import { createClient } from '@supabase/supabase-js'
import { PindoClient } from '@/lib/pindo-client'
import { getApplicantName, getApplicantPhone, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendResendEmail } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

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

/**
 * Sends SMS + email after an application is submitted.
 *
 * Idempotency is handled via the `notifications` table:
 * - We check for an existing "Application Submitted" notification for this application.
 * - (Recommended) Add a UNIQUE partial index so concurrent triggers cannot double-send.
 */
export async function notifyOnApplicationSubmitted(applicationId: string): Promise<SubmissionNotifyResult> {
  if (!isNonEmptyString(applicationId)) {
    return { ok: false, status: 'error', applicationId: String(applicationId), message: 'Invalid applicationId' }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return {
      ok: false,
      status: 'error',
      applicationId,
      message: 'Server misconfiguration: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }
  }

  // Fetch application (must be submitted)
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, application_number, status, applicant_id')
    .eq('id', applicationId)
    .single()

  if (appErr || !app) {
    return { ok: false, status: 'error', applicationId, message: 'Application not found' }
  }

  if (String((app as any).status) !== 'submitted') {
    return { ok: true, status: 'skipped_not_submitted', applicationId }
  }

  // Fast path: already sent
  const { data: existing } = await supabase
    .from('notifications')
    .select('id, sms_sent, email_sent')
    .eq('application_id', applicationId)
    .eq('title', 'Application Submitted')
    .limit(1)
    .maybeSingle()

  if (existing && (existing as any).sms_sent && (existing as any).email_sent) {
    console.log('ℹ️ [SUBMISSION] Notifications already marked sent; skipping.', { applicationId })
    return { ok: true, status: 'skipped_already_sent', applicationId }
  }

  // Create (or claim) a notification row as a lock.
  const lockMessage = 'Submission notification dispatch started.'
  let lockId: string | null = (existing as any)?.id || null
  if (!lockId) {
    const { data: lockRow, error: lockErr } = await supabase
      .from('notifications')
      .insert({
        user_id: (app as any).applicant_id,
        title: 'Application Submitted',
        message: lockMessage,
        type: 'info',
        application_id: applicationId,
        email_sent: false,
        sms_sent: false,
      })
      .select('id')
      .maybeSingle()

    if (lockErr) {
      const code = (lockErr as any)?.code
      // 23505 = unique_violation (Postgres)
      if (code === '23505') {
        const { data: existingRow } = await supabase
          .from('notifications')
          .select('id')
          .eq('application_id', applicationId)
          .eq('title', 'Application Submitted')
          .limit(1)
          .maybeSingle()
        lockId = (existingRow as any)?.id || null
      } else {
        return { ok: false, status: 'error', applicationId, message: (lockErr as any)?.message || 'Failed to claim notification lock' }
      }
    } else {
      lockId = (lockRow as any)?.id || null
    }
  }

  if (!lockId) {
    return { ok: false, status: 'error', applicationId, message: 'Failed to create notification lock' }
  }

  try {
    // Re-fetch current send state so we can retry missing channels (without resending already-sent channels).
    const { data: currentNotif } = await supabase
      .from('notifications')
      .select('id, sms_sent, email_sent')
      .eq('id', lockId)
      .maybeSingle()

    const needSms = !(currentNotif as any)?.sms_sent
    const needEmail = !(currentNotif as any)?.email_sent

    const { data: applicant, error: userErr } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, company_name, account_type, phone, mobile_phone, landline_phone, company_phone')
      .eq('id', (app as any).applicant_id)
      .single()

    if (userErr || !applicant) throw new Error('Applicant not found')

    const applicantName = getApplicantName(applicant as ApplicantContact)
    const applicantPhone = getApplicantPhone(applicant as ApplicantContact)
    const applicantEmail = String((applicant as any).email || '').trim().toLowerCase()

    if (!isNonEmptyString(applicantEmail)) throw new Error('Applicant email not found')
    if (!isNonEmptyString(applicantPhone)) throw new Error('Applicant phone number not found')

    const copy = buildSubmissionCopy({
      applicantName,
      applicationId,
      applicationNumber: (app as any).application_number,
    })

    // SMS (reuse PindoClient)
    let smsSent = Boolean((currentNotif as any)?.sms_sent)
    if (needSms) {
      const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
      const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
      const isSmsDev = process.env.PINDO_DEVELOPMENT_MODE === 'true'

      if (!pindo.isValidRwandanPhone(applicantPhone)) {
        console.warn('⚠️ [SUBMISSION] Invalid phone; cannot send SMS (skipping).')
      } else if (isSmsDev) {
        console.log(`📟 [SUBMISSION] SMS dev mode enabled; skipping external SMS send. toSuffix=${String(applicantPhone).slice(-3)}`)
      } else {
        await pindo.sendSMS(applicantPhone, copy.sms, senderName)
        smsSent = true
      }
    }

    // Email (reuse shared Resend helper)
    let emailSent = Boolean((currentNotif as any)?.email_sent)
    if (needEmail) {
      const res = await sendResendEmail({
        to: applicantEmail,
        subject: copy.email.subject,
        title: copy.email.title,
        text: copy.email.text,
      })
      emailSent = Boolean(res.delivered) || emailSent
    }

    // Mark lock row as sent
    await supabase
      .from('notifications')
      .update({
        message: copy.email.text,
        sms_sent: smsSent,
        email_sent: emailSent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lockId)

    if (smsSent && emailSent) return { ok: true, status: 'sent', applicationId }
    return { ok: false, status: 'error', applicationId, message: `Partial delivery: sms_sent=${String(smsSent)} email_sent=${String(emailSent)}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('⚠️ [SUBMISSION] Failed; releasing lock so it can retry:', message)
    // Best-effort: delete the lock row so the workflow can retry later
    try {
      await supabase.from('notifications').delete().eq('id', lockId)
    } catch {}
    return { ok: false, status: 'error', applicationId, message }
  }
}


