import { query } from '@/lib/db/postgres'
import { getApplicantName, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const NOTIFICATION_TITLE = 'Application Terminated — Exempted Water Use'

type TerminationNotifyResult =
  | {
      ok: true
      status: 'sent' | 'skipped_already_sent' | 'skipped_not_terminated'
      applicationId: string
      /** true only when the applicant email was actually delivered */
      emailSent: boolean
      /** true when a public.notifications row exists for this termination */
      notificationRecorded: boolean
    }
  | {
      ok: false
      status: 'error'
      applicationId: string
      message: string
      emailSent: false
      /**
       * true when the in-portal notification row survived the failure, so the
       * applicant still sees the termination in their portal and ops can retry.
       */
      notificationRecorded: boolean
    }

function buildTerminationCopy(params: {
  applicantName: string
  applicationId: string
  applicationNumber?: string | null
  terminationReason?: string | null
}) {
  const portalUrl = getPortalUrl()
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
  const ref = params.applicationNumber ? `${params.applicationNumber} (ID: ${params.applicationId})` : params.applicationId
  const reason = String(params.terminationReason || '').trim()

  const subject = `Application closed — no permit required — ${params.applicationNumber || params.applicationId}`
  const text = [
    `Dear ${params.applicantName},`,
    ``,
    `After review, Rwanda Water Resources Board has determined that the water use described in your application falls under an EXEMPTED water use category. This means a water use permit is NOT required for this activity, and your application has therefore been closed (terminated).`,
    ``,
    `Reference: ${ref}`,
    ``,
    `Reason:`,
    reason || '(not specified)',
    ``,
    `No further action is required from you, and you may lawfully proceed with the exempted water use in accordance with the applicable regulations. This is not a rejection and it is not a request for corrections — no resubmission is needed.`,
    ``,
    `If your planned water use changes (for example, the scale of the activity increases beyond the exemption threshold), you will need to submit a new application.`,
    ``,
    `Portal: ${portalUrl}`,
    `Support: ${supportEmail}`,
    ``,
    `${orgName}`,
  ].join('\n')

  return { email: { subject, title: NOTIFICATION_TITLE, text } }
}

/**
 * In-portal message used when the email could not be delivered. The applicant
 * must still learn (in the portal) that the file was closed as an exempted
 * water use, and support must be reachable since no email arrived.
 */
function buildFailedDeliveryMessage(
  applicationNumber: string | null,
  terminationReason: string | null,
  failure: string
) {
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const reason = String(terminationReason || '').trim()
  return [
    `Your application${applicationNumber ? ` ${applicationNumber}` : ''} has been closed: the water use it describes falls under an EXEMPTED water use category, so a water use permit is NOT required. This is not a rejection and no resubmission is needed.`,
    reason ? `\nReason: ${reason}` : '',
    `\nWe could not deliver the confirmation email to you (${failure}). Please contact ${supportEmail} if you need a copy in writing.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Email-only notification to the applicant when their application is
 * terminated because the water use is exempted (no permit required).
 * Termination is terminal, so idempotency is simple title-existence:
 * one notification per application. Mirrors lib/notifications/revision.ts.
 */
export async function notifyOnApplicationTerminated(applicationId: string): Promise<TerminationNotifyResult> {
  if (!isNonEmptyString(applicationId)) {
    return {
      ok: false,
      status: 'error',
      applicationId: String(applicationId),
      message: 'Invalid applicationId',
      emailSent: false,
      notificationRecorded: false,
    }
  }

  const appRes = await query<{
    id: string
    application_number: string | null
    status: string
    applicant_id: string
    termination_reason: string | null
  }>(
    `
    select id, application_number, status, applicant_id, termination_reason
    from public.applications
    where id = $1
    limit 1
    `,
    [applicationId]
  )
  const app = appRes.rows[0]
  if (!app) {
    return {
      ok: false,
      status: 'error',
      applicationId,
      message: 'Application not found',
      emailSent: false,
      notificationRecorded: false,
    }
  }
  if (String(app.status) !== 'terminated') {
    return { ok: true, status: 'skipped_not_terminated', applicationId, emailSent: false, notificationRecorded: false }
  }

  const existingRes = await query<{ id: string; email_sent: boolean | null }>(
    `
    select id, email_sent
    from public.notifications
    where application_id = $1 and title = $2
    order by created_at desc
    limit 1
    `,
    [applicationId, NOTIFICATION_TITLE]
  )
  const existing = existingRes.rows[0]
  if (existing?.email_sent) {
    return { ok: true, status: 'skipped_already_sent', applicationId, emailSent: true, notificationRecorded: true }
  }

  // Reuse an unsent lock row; otherwise create one so retries can't double-send.
  let lockId = existing && !existing.email_sent ? existing.id : null
  if (!lockId) {
    const lockRes = await query<{ id: string }>(
      `
      insert into public.notifications (
        user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
      ) values ($1, $2, 'Termination notification dispatch started.', 'info', $3, false, false, now(), now())
      returning id
      `,
      [app.applicant_id, NOTIFICATION_TITLE, applicationId]
    )
    lockId = lockRes.rows[0]?.id || null
  }
  if (!lockId) {
    return {
      ok: false,
      status: 'error',
      applicationId,
      message: 'Failed to create notification lock',
      emailSent: false,
      notificationRecorded: false,
    }
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

    const copy = buildTerminationCopy({
      applicantName: getApplicantName(applicant),
      applicationId,
      applicationNumber: app.application_number,
      terminationReason: app.termination_reason,
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

    if (emailSent) {
      return { ok: true, status: 'sent', applicationId, emailSent: true, notificationRecorded: true }
    }
    return {
      ok: false,
      status: 'error',
      applicationId,
      message: 'Email delivery failed',
      emailSent: false,
      notificationRecorded: true,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // DO NOT delete the lock row. The application IS terminated at this point,
    // so the row is the applicant's in-portal record of that fact and ops'
    // only trace that the email attempt happened. Deleting it (the previous
    // behaviour) left the applicant with a terminated application, no email,
    // no in-portal notification, and nothing to retry from. Keeping it with
    // email_sent=false also lets a later call reuse it as the lock, so a retry
    // still cannot double-send.
    const recorded = await query(
      `
      update public.notifications
      set message = $2, email_sent = false, updated_at = now()
      where id = $1
      `,
      [lockId, buildFailedDeliveryMessage(app.application_number, app.termination_reason, message)]
    )
      .then(() => true)
      .catch(() => false)
    return { ok: false, status: 'error', applicationId, message, emailSent: false, notificationRecorded: recorded }
  }
}
