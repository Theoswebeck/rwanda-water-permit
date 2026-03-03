import { query } from '@/lib/db/postgres'
import { PindoClient } from '@/lib/pindo-client'
import { getApplicantName, getApplicantPhone, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendResendEmail } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

type SubmissionNotifyResult =
  | { ok: true; status: 'sent' | 'skipped_already_sent' | 'skipped_not_submitted'; applicationId: string }
  | { ok: false; status: 'error'; applicationId: string; message: string }

function buildSubmissionCopy(params: {
  applicantName: string
  applicationId: string
  applicationNumber?: string | null
}) {
  const portalUrl = getPortalUrl()
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
  const ref = params.applicationNumber ? `${params.applicationNumber} (ID: ${params.applicationId})` : params.applicationId

  const subject = `Application submitted — ${params.applicationNumber || params.applicationId}`
  const title = 'Application Submitted'
  const sms = `${orgName}: Dear ${params.applicantName}, your water permit application has been submitted successfully. Application ID: ${params.applicationId}. ${params.applicationNumber ? `Reference: ${params.applicationNumber}. ` : ''}Track progress in your dashboard. Support: ${supportEmail}.`
  const text = [
    `Dear ${params.applicantName},`,
    ``,
    `Your water permit application has been submitted successfully.`,
    ``,
    `Reference: ${ref}`,
    ``,
    `Portal: ${portalUrl}`,
    `Support: ${supportEmail}`,
    ``,
    `${orgName}`,
  ].join('\n')

  return { sms, email: { subject, title, text } }
}

export async function notifyOnApplicationSubmitted(applicationId: string): Promise<SubmissionNotifyResult> {
  if (!isNonEmptyString(applicationId)) {
    return { ok: false, status: 'error', applicationId: String(applicationId), message: 'Invalid applicationId' }
  }

  const appRes = await query<{ id: string; application_number: string | null; status: string; applicant_id: string }>(
    `
    select id, application_number, status, applicant_id
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
  if (String(app.status) !== 'submitted') {
    return { ok: true, status: 'skipped_not_submitted', applicationId }
  }

  const existingRes = await query<{ id: string; sms_sent: boolean | null; email_sent: boolean | null }>(
    `
    select id, sms_sent, email_sent
    from public.notifications
    where application_id = $1 and title = 'Application Submitted'
    order by created_at desc
    limit 1
    `,
    [applicationId]
  )
  const existing = existingRes.rows[0]
  if (existing && existing.sms_sent && existing.email_sent) {
    return { ok: true, status: 'skipped_already_sent', applicationId }
  }

  const lockMessage = 'Submission notification dispatch started.'
  let lockId = existing?.id || null
  if (!lockId) {
    const lockRes = await query<{ id: string }>(
      `
      insert into public.notifications (
        user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
      ) values ($1, 'Application Submitted', $2, 'info', $3, false, false, now(), now())
      returning id
      `,
      [app.applicant_id, lockMessage, applicationId]
    )
    lockId = lockRes.rows[0]?.id || null
  }
  if (!lockId) {
    return { ok: false, status: 'error', applicationId, message: 'Failed to create notification lock' }
  }

  try {
    const currentNotifRes = await query<{ sms_sent: boolean | null; email_sent: boolean | null }>(
      `select sms_sent, email_sent from public.notifications where id = $1 limit 1`,
      [lockId]
    )
    const currentNotif = currentNotifRes.rows[0]
    const needSms = !currentNotif?.sms_sent
    const needEmail = !currentNotif?.email_sent

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

    const applicantName = getApplicantName(applicant)
    const applicantPhone = getApplicantPhone(applicant)
    const applicantEmail = String(applicant.email || '').trim().toLowerCase()
    if (!isNonEmptyString(applicantEmail)) throw new Error('Applicant email not found')
    if (!isNonEmptyString(applicantPhone)) throw new Error('Applicant phone number not found')

    const copy = buildSubmissionCopy({
      applicantName,
      applicationId,
      applicationNumber: app.application_number,
    })

    let smsSent = Boolean(currentNotif?.sms_sent)
    if (needSms) {
      const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
      const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
      const isSmsDev = process.env.PINDO_DEVELOPMENT_MODE === 'true'
      if (!pindo.isValidRwandanPhone(applicantPhone)) {
        console.warn('⚠️ [SUBMISSION] Invalid phone; cannot send SMS.')
      } else if (isSmsDev) {
        smsSent = true
      } else {
        await pindo.sendSMS(applicantPhone, copy.sms, senderName)
        smsSent = true
      }
    }

    let emailSent = Boolean(currentNotif?.email_sent)
    if (needEmail) {
      const res = await sendResendEmail({
        to: applicantEmail,
        subject: copy.email.subject,
        title: copy.email.title,
        text: copy.email.text,
      })
      emailSent = Boolean(res.delivered) || emailSent
    }

    await query(
      `
      update public.notifications
      set message = $2, sms_sent = $3, email_sent = $4, updated_at = now()
      where id = $1
      `,
      [lockId, copy.email.text, smsSent, emailSent]
    )

    if (smsSent && emailSent) return { ok: true, status: 'sent', applicationId }
    return { ok: false, status: 'error', applicationId, message: `Partial delivery: sms_sent=${String(smsSent)} email_sent=${String(emailSent)}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await query(`delete from public.notifications where id = $1`, [lockId]).catch(() => undefined)
    return { ok: false, status: 'error', applicationId, message }
  }
}
