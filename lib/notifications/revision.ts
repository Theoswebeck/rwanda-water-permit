import { query } from '@/lib/db/postgres'
import { getApplicantName, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const NOTIFICATION_TITLE = 'Application Returned for Revision'

type RevisionNotifyResult =
  | { ok: true; status: 'sent' | 'skipped_already_sent' | 'skipped_not_in_revision'; applicationId: string }
  | { ok: false; status: 'error'; applicationId: string; message: string }

function buildRevisionCopy(params: {
  applicantName: string
  applicationId: string
  applicationNumber?: string | null
  revisionNotes?: string | null
}) {
  const portalUrl = getPortalUrl()
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
  const ref = params.applicationNumber ? `${params.applicationNumber} (ID: ${params.applicationId})` : params.applicationId
  const notes = String(params.revisionNotes || '').trim()
  // A bare punctuation note (e.g. ".") carries no instructions — omit it.
  const hasMeaningfulNotes = notes.replace(/[^\p{L}\p{N}]/gu, '').length > 0

  const subject = `Action required: revision requested — ${params.applicationNumber || params.applicationId}`
  const text = [
    `Dear ${params.applicantName},`,
    ``,
    `Your water permit application has been returned to you for revision.`,
    ``,
    `Reference: ${ref}`,
    ...(hasMeaningfulNotes
      ? [``, `Required changes:`, notes]
      : [``, `Please log in to the portal to see the requested changes.`]),
    ``,
    `To revise: log in to the portal, open the application and click "Edit Application", make the requested changes (including uploading any requested documents), then resubmit.`,
    ``,
    `Portal: ${portalUrl}`,
    `Support: ${supportEmail}`,
    ``,
    `${orgName}`,
  ].join('\n')

  return { email: { subject, title: NOTIFICATION_TITLE, text } }
}

/**
 * Email-only notification to the applicant when their application is returned
 * for revision. Idempotent PER REVISION CYCLE: an application can be returned,
 * resubmitted and returned again, so dedupe compares the latest notification
 * against the latest revision_required transition in workflow_history instead
 * of using title-existence alone.
 */
export async function notifyOnApplicationReturnedForRevision(applicationId: string): Promise<RevisionNotifyResult> {
  if (!isNonEmptyString(applicationId)) {
    return { ok: false, status: 'error', applicationId: String(applicationId), message: 'Invalid applicationId' }
  }

  const appRes = await query<{
    id: string
    application_number: string | null
    status: string
    applicant_id: string
    revision_notes: string | null
  }>(
    `
    select id, application_number, status, applicant_id, revision_notes
    from public.applications
    where id = $1
    limit 1
    `,
    [applicationId]
  )
  const app = appRes.rows[0]
  if (!app) {
    return { ok: false, status: 'error', applicationId, message: 'Application not found' }
  }
  if (String(app.status) !== 'revision_required') {
    return { ok: true, status: 'skipped_not_in_revision', applicationId }
  }

  const transitionRes = await query<{ created_at: string }>(
    `
    select created_at
    from public.workflow_history
    where application_id = $1 and to_status = 'revision_required'
    order by created_at desc
    limit 1
    `,
    [applicationId]
  )
  const lastReturnedAt = transitionRes.rows[0]?.created_at || null

  const existingRes = await query<{ id: string; email_sent: boolean | null; created_at: string }>(
    `
    select id, email_sent, created_at
    from public.notifications
    where application_id = $1 and title = $2
    order by created_at desc
    limit 1
    `,
    [applicationId, NOTIFICATION_TITLE]
  )
  const existing = existingRes.rows[0]
  const existingCoversThisCycle =
    existing?.email_sent &&
    (!lastReturnedAt || new Date(existing.created_at) >= new Date(lastReturnedAt))
  if (existingCoversThisCycle) {
    return { ok: true, status: 'skipped_already_sent', applicationId }
  }

  // Reuse an unsent lock row from this cycle; otherwise create a fresh one so
  // each revision cycle gets its own notification record.
  const existingIsThisCycleLock =
    existing && !existing.email_sent && (!lastReturnedAt || new Date(existing.created_at) >= new Date(lastReturnedAt))
  let lockId = existingIsThisCycleLock ? existing.id : null
  if (!lockId) {
    const lockRes = await query<{ id: string }>(
      `
      insert into public.notifications (
        user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
      ) values ($1, $2, 'Revision notification dispatch started.', 'warning', $3, false, false, now(), now())
      returning id
      `,
      [app.applicant_id, NOTIFICATION_TITLE, applicationId]
    )
    lockId = lockRes.rows[0]?.id || null
  }
  if (!lockId) {
    return { ok: false, status: 'error', applicationId, message: 'Failed to create notification lock' }
  }

  try {
    const applicantRes = await query<ApplicantContact & { email: string }>(
      `
      select id, email, first_name, last_name, company_name, account_type, phone, mobile_phone, landline_phone, company_phone
      from public.users
      where id = $1
      limit 1
      `,
      [app.applicant_id]
    )
    const applicant = applicantRes.rows[0]
    if (!applicant) throw new Error('Applicant not found')

    const applicantEmail = String(applicant.email || '').trim().toLowerCase()
    if (!isNonEmptyString(applicantEmail)) throw new Error('Applicant email not found')

    const copy = buildRevisionCopy({
      applicantName: getApplicantName(applicant),
      applicationId,
      applicationNumber: app.application_number,
      revisionNotes: app.revision_notes,
    })

    const res = await sendSmtpEmail({
      to: applicantEmail,
      subject: copy.email.subject,
      title: copy.email.title,
      text: copy.email.text,
    })
    const emailSent = Boolean(res.delivered)

    await query(
      `
      update public.notifications
      set message = $2, email_sent = $3, updated_at = now()
      where id = $1
      `,
      [lockId, copy.email.text, emailSent]
    )

    if (emailSent) return { ok: true, status: 'sent', applicationId }
    return { ok: false, status: 'error', applicationId, message: 'Email delivery failed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await query(`delete from public.notifications where id = $1`, [lockId]).catch(() => undefined)
    return { ok: false, status: 'error', applicationId, message }
  }
}
