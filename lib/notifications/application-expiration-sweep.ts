/**
 * Six-month auto-close sweep for incomplete applications.
 *
 * RWB feedback (Sep 2026), per the Water Use Permit Law: applications that
 * stay incomplete for more than six months must be closed, and the applicant
 * must be notified before the six-month period expires.
 *
 * The clock runs from submitted_at, or from created_at for an application
 * that was never submitted — RWB confirmed (Sep 2026) that abandoned drafts
 * must be closed too, and a draft has no submission date. All writes are idempotent — the status update is guarded
 * by the current status and each notification is locked by title — so the
 * sweep is safe to run from multiple instances or on overlapping schedules.
 */
import { query } from '@/lib/db/postgres'
import { getApplicantName, getApplicantPhone, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'
import { PindoClient } from '@/lib/pindo-client'

const ORG_NAME = process.env.ORG_NAME || 'Rwanda Water Resources Board'
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@rwb.rw'

const NOTICE_TITLE = 'Application incomplete — six-month deadline approaching'
const CLOSED_TITLE = 'Application closed — incomplete after six months'

/** Status an application is moved to by the sweep (RWB's wording). */
const CLOSED_STATUS = 'closed_incomplete'
/** Pre-migration equivalent; what the sweep wrote before the label existed. */
const CLOSED_STATUS_FALLBACK = 'expired'

/**
 * Statuses where the application is incomplete *and the outstanding action is
 * the applicant's*. Deliberately excludes everything sitting in an RWB queue
 * (`submitted`, `under_review`, `pending_assessment|review|verification|
 * final_approval`) and the internal staff returns (`returned_to_*`, which go
 * back to the assessor/reviewer, not to the applicant) — closing those would
 * penalise the applicant for RWB's own processing time.
 *
 * Every value must be a real `application_status` enum label, or the query
 * throws at runtime.
 */
const EXPIRABLE_STATUSES = [
  'draft',
  'pending_payment',
  'revision_required',
  // Approved but the applicant never accepted the terms; the terms page
  // already expires these on visit (lib/application-expiration.ts).
  'approved_pending_permit',
]

const EXPIRABLE_STATUS_LIST = `('${EXPIRABLE_STATUSES.join("','")}')`

/**
 * Start of the six-month clock. Unsubmitted drafts have no submitted_at, so
 * they fall back to created_at; without this they would never be closed.
 */
const CLOCK = `coalesce(a.submitted_at, a.created_at)`

/** Applications with no permit that were submitted between 5 and 6 months ago. */
export async function findApplicationsNearingExpiry(limit = 50): Promise<
  Array<{ id: string; application_number: string | null; applicant_id: string; submitted_at: string; expires_at: string }>
> {
  const res = await query<{
    id: string
    application_number: string | null
    applicant_id: string
    submitted_at: string
    expires_at: string
  }>(
    `
    select a.id, a.application_number, a.applicant_id, ${CLOCK}::text as submitted_at,
           (${CLOCK} + interval '6 months')::text as expires_at
    from public.applications a
    where ${CLOCK} is not null
      and a.status in ${EXPIRABLE_STATUS_LIST}
      and ${CLOCK} + interval '5 months' <= now()
      and ${CLOCK} + interval '6 months' > now()
      and not exists (select 1 from public.permits p where p.application_id = a.id)
      and not exists (
        select 1 from public.notifications n where n.application_id = a.id and n.title = $1
      )
    order by ${CLOCK} asc
    limit $2
    `,
    [NOTICE_TITLE, limit]
  )
  return res.rows
}

/** Applications past the six-month mark that are still open. */
export async function findExpiredIncompleteApplications(limit = 100): Promise<
  Array<{ id: string; application_number: string | null; applicant_id: string; submitted_at: string }>
> {
  const res = await query<{
    id: string
    application_number: string | null
    applicant_id: string
    submitted_at: string
  }>(
    `
    select a.id, a.application_number, a.applicant_id, ${CLOCK}::text as submitted_at
    from public.applications a
    where ${CLOCK} is not null
      and ${CLOCK} + interval '6 months' <= now()
      and a.status in ${EXPIRABLE_STATUS_LIST}
      and not exists (select 1 from public.permits p where p.application_id = a.id)
    order by ${CLOCK} asc
    limit $1
    `,
    [limit]
  )
  return res.rows
}

/** One pre-deadline notice (email + SMS), idempotent by notification title. */
export async function notifyApplicationNearingExpiry(applicationId: string): Promise<{
  ok: boolean
  status: 'sent' | 'skipped_already_notified' | 'error'
  message?: string
}> {
  const appRes = await query<{ id: string; application_number: string | null; applicant_id: string }>(
    `select id, application_number, applicant_id from public.applications where id = $1 limit 1`,
    [applicationId]
  )
  const app = appRes.rows[0]
  if (!app) return { ok: false, status: 'error', message: 'Application not found' }

  const existing = await query<{ id: string }>(
    `select id from public.notifications where application_id = $1 and title = $2 limit 1`,
    [applicationId, NOTICE_TITLE]
  )
  if (existing.rows[0]) return { ok: true, status: 'skipped_already_notified' }

  const applicantRes = await query<ApplicantContact & { email: string }>(
    `
    select id, email, first_name, last_name, company_name, account_type, phone, mobile_phone, landline_phone, company_phone
    from public.users where id = $1 limit 1
    `,
    [app.applicant_id]
  )
  const applicant = applicantRes.rows[0]
  if (!applicant) return { ok: false, status: 'error', message: 'Applicant not found' }

  const portalUrl = getPortalUrl()
  const name = getApplicantName(applicant)
  const ref = app.application_number || applicationId
  const text = [
    `Dear ${name},`,
    '',
    `Your water use permit application ${ref} is still incomplete. Under the Water Use Permit Law, applications that remain incomplete for more than six (6) months are closed automatically.`,
    '',
    `Your application will reach the six-month deadline soon and will be closed unless completed. Please log in to the portal, complete any outstanding requirements, and resubmit before the deadline.`,
    '',
    `Portal: ${portalUrl}`,
    `Support: ${SUPPORT_EMAIL}`,
    '',
    ORG_NAME,
  ].join('\n')

  const lockRes = await query<{ id: string }>(
    `
    insert into public.notifications (
      user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
    ) values ($1, $2, $3, 'info', $4, false, false, now(), now())
    returning id
    `,
    [app.applicant_id, NOTICE_TITLE, text, applicationId]
  )
  const lockId = lockRes.rows[0]?.id
  if (!lockId) return { ok: false, status: 'error', message: 'Failed to record notification' }

  let emailSent = false
  let smsSent = false
  const emailTo = String(applicant.email || '').trim().toLowerCase()
  if (emailTo) {
    try {
      const res = await sendSmtpEmail({
        to: emailTo,
        subject: `Action required: complete your application ${ref} before the six-month deadline`,
        title: NOTICE_TITLE,
        text,
      })
      emailSent = Boolean(res.delivered)
    } catch (err) {
      console.error('⚠️ Expiry-notice email failed:', err)
    }
  }

  const phone = getApplicantPhone(applicant)
  const pindo = new PindoClient()
  if (phone && pindo.isValidRwandanPhone(phone)) {
    try {
      const sms = `RWB: Your water permit application ${ref} is incomplete and will be closed after its six-month deadline. Complete it at ${portalUrl.replace(/^https?:\/\//i, '')}`
      await pindo.sendSMS(phone, sms)
      smsSent = true
    } catch (err) {
      console.error('⚠️ Expiry-notice SMS failed:', err)
    }
  }

  await query(
    `update public.notifications set email_sent = $2, sms_sent = $3, updated_at = now() where id = $1`,
    [lockId, emailSent, smsSent]
  )
  return { ok: true, status: 'sent' }
}

/** Status change + in-portal record for applications past six months. */
export async function expireApplication(applicationId: string): Promise<{
  ok: boolean
  status: 'expired' | 'skipped_not_expirable' | 'error'
  message?: string
}> {
  // RWB asked for the law's own wording: the application is CLOSED because it
  // was left incomplete, which is not the same thing as a permit expiring.
  // 'expired' is the pre-migration fallback — see LEGACY_ENUM_FALLBACKS in
  // lib/db/application-enum-sanitizer.ts, same deploy-order tolerance as
  // 'terminated'.
  const closeSql = (statusLabel: string) => `
    update public.applications a
    set status = '${statusLabel}', updated_at = now()
    where a.id = $1
      and ${CLOCK} is not null
      and ${CLOCK} + interval '6 months' <= now()
      and a.status in ${EXPIRABLE_STATUS_LIST}
      and not exists (select 1 from public.permits p where p.application_id = a.id)
    returning a.id
  `
  let res: { rows: Array<{ id: string }> }
  try {
    res = await query<{ id: string }>(closeSql(CLOSED_STATUS), [applicationId])
  } catch (err) {
    // 22P02 = the enum label does not exist yet (migration not applied).
    if ((err as { code?: string })?.code !== '22P02') throw err
    console.warn(
      `⚠️ application_status has no '${CLOSED_STATUS}' label yet — applying database/add-closed-incomplete-status.sql will fix this. Falling back to '${CLOSED_STATUS_FALLBACK}'.`
    )
    res = await query<{ id: string }>(closeSql(CLOSED_STATUS_FALLBACK), [applicationId])
  }
  if (!res.rows[0]) return { ok: true, status: 'skipped_not_expirable' }

  const appRes = await query<{ application_number: string | null; applicant_id: string }>(
    `select application_number, applicant_id from public.applications where id = $1 limit 1`,
    [applicationId]
  )
  const app = appRes.rows[0]
  if (app) {
    const message = `Your application ${app.application_number || applicationId} has been closed automatically: it remained incomplete for more than six months, as provided by the Water Use Permit Law. You may submit a new application at ${getPortalUrl()}.`
    await query(
      `
      insert into public.notifications (
        user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
      ) values ($1, $2, $3, 'info', $4, false, false, now(), now())
      on conflict do nothing
      `,
      [app.applicant_id, CLOSED_TITLE, message, applicationId]
    ).catch(() => null)
  }
  return { ok: true, status: 'expired' }
}

export type ExpirationSweepResult = {
  notified: number
  notifyFailed: number
  expired: number
  expireFailed: number
}

/** Full sweep: pre-deadline notices first, then expire whatever is past due. */
export async function runApplicationExpirationSweep(limit = 100): Promise<ExpirationSweepResult> {
  const result: ExpirationSweepResult = { notified: 0, notifyFailed: 0, expired: 0, expireFailed: 0 }

  for (const row of await findApplicationsNearingExpiry(limit)) {
    const r = await notifyApplicationNearingExpiry(row.id)
    if (r.ok) result.notified += 1
    else result.notifyFailed += 1
  }

  for (const row of await findExpiredIncompleteApplications(limit)) {
    const r = await expireApplication(row.id)
    if (r.ok && r.status === 'expired') result.expired += 1
    else if (!r.ok) result.expireFailed += 1
  }

  return result
}
