import { query } from '@/lib/db/postgres'
import { PindoClient } from '@/lib/pindo-client'
import { sendResendEmail } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const NOTIFICATION_TITLE = 'Transfer Pending Terms (Transferee)'
const NOTIFICATION_TYPE = 'info'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

type TransferNotifyResult =
  | { ok: true; status: 'sent' | 'skipped_already_sent' | 'skipped_not_transfer' | 'skipped_wrong_stage'; applicationId: string }
  | { ok: false; status: 'error'; applicationId: string; message: string; smsSent?: boolean; emailSent?: boolean }

type RetryTransferNotifyResult = {
  scanned: number
  sent: number
  alreadySent: number
  skipped: number
  failed: number
}

type TransferRequestRow = {
  transferee_email: string
  transferee_phone: string
}

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase()
}

function formatTransferPhoneForSms(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 9) return `+250${digits}`
  if (digits.length === 10 && digits.startsWith('07')) return `+25${digits}`
  if (digits.length === 12 && digits.startsWith('250')) return `+${digits}`
  return null
}

function parseNotes(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // Ignore invalid JSON; transfer detection falls back to application_type.
  }
  return {}
}

function isMissingTransferRequestsTable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  const message = String((err as { message?: unknown } | null)?.message || '')
  return (
    code === '42P01' ||
    message.includes('relation "public.transfer_requests" does not exist') ||
    message.includes('relation "transfer_requests" does not exist')
  )
}

function isTransferApplication(applicationType: unknown, internalNotesRaw: unknown): boolean {
  if (String(applicationType || '').trim().toLowerCase() === 'transfer') return true
  const notes = parseNotes(internalNotesRaw)
  return notes.isTransfer === true
}

export async function notifyOnTransferPendingTerms(applicationId: string): Promise<TransferNotifyResult> {
  try {
    if (!isNonEmptyString(applicationId)) {
      return { ok: false, status: 'error', applicationId: String(applicationId), message: 'Invalid applicationId' }
    }

    const appRes = await query<{
      id: string
      applicant_id: string
      application_number: string | null
      status: string
      application_type: string | null
      internal_notes: string | null
    }>(
      `
      select id, applicant_id, application_number, status, application_type, internal_notes::text as internal_notes
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

    if (!isTransferApplication(app.application_type, app.internal_notes)) {
      return { ok: true, status: 'skipped_not_transfer', applicationId }
    }

    if (String(app.status) !== 'approved_pending_permit') {
      return { ok: true, status: 'skipped_wrong_stage', applicationId }
    }

    const existingRes = await query<{ id: string; sms_sent: boolean | null; email_sent: boolean | null }>(
      `
      select id, sms_sent, email_sent
      from public.notifications
      where application_id = $1
        and title = $2
      order by created_at desc
      limit 1
      `,
      [applicationId, NOTIFICATION_TITLE]
    )
    const existing = existingRes.rows[0]
    if (existing && existing.sms_sent && existing.email_sent) {
      return { ok: true, status: 'skipped_already_sent', applicationId }
    }

    const transferRes = await query<TransferRequestRow>(
      `
      select transferee_email, transferee_phone
      from public.transfer_requests
      where application_id = $1
      order by updated_at desc
      limit 1
      `,
      [applicationId]
    )
    const transferRequest = transferRes.rows[0]
    if (!transferRequest) {
      return { ok: false, status: 'error', applicationId, message: 'Transfer request not found' }
    }

    const transfereeEmail = normalizeEmail(transferRequest.transferee_email)
    const transfereePhoneRaw = String(transferRequest.transferee_phone || '').trim()
    const applicationNumber = app.application_number || app.id
    const portalUrl = getPortalUrl()
    const subject = `Permit transfer approved - action required — ${applicationNumber}`
    const title = 'Permit Transfer Approved - Action Required'
    const text = [
      `Dear Permit Transferee,`,
      ``,
      `A water permit transfer application has now been approved by Rwanda Water Resources Board and is waiting for your action.`,
      ``,
      `Reference: ${applicationNumber}`,
      ``,
      `Next steps:`,
      `- Log in (or sign up) using this same email address and phone number.`,
      `- On your dashboard, open the transfer application with status: "Approved - Pending Terms".`,
      `- Review details and accept the Terms and Conditions to complete permit transfer into your name.`,
      ``,
      `Important: Only the transferee can accept these terms.`,
      ``,
      `Portal: ${portalUrl}`,
    ].join('\n')

    let notifId = existing?.id || null
    if (!notifId) {
      const lockRes = await query<{ id: string }>(
        `
        insert into public.notifications (
          user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, false, false, now(), now())
        returning id
        `,
        [app.applicant_id, NOTIFICATION_TITLE, 'Transfer pending-terms notification dispatch started.', NOTIFICATION_TYPE, applicationId]
      )
      notifId = lockRes.rows[0]?.id || null
    }

    if (!notifId) {
      return { ok: false, status: 'error', applicationId, message: 'Failed to create notification state row' }
    }

    const currentNotifRes = await query<{ sms_sent: boolean | null; email_sent: boolean | null }>(
      `select sms_sent, email_sent from public.notifications where id = $1 limit 1`,
      [notifId]
    )
    const currentNotif = currentNotifRes.rows[0]
    let smsSent = Boolean(currentNotif?.sms_sent)
    let emailSent = Boolean(currentNotif?.email_sent)

    if (!emailSent && isNonEmptyString(transfereeEmail)) {
      const emailRes = await sendResendEmail({ to: transfereeEmail, subject, title, text })
      emailSent = Boolean(emailRes.delivered) || emailSent
    }

    if (!smsSent) {
      const smsPhone = formatTransferPhoneForSms(transfereePhoneRaw)
      if (smsPhone) {
        const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
        const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
        const sms = `RWB: Transfer ${applicationNumber} approved. Login with same email+phone, open status Approved - Pending Terms, then accept terms to complete transfer. Portal: ${portalUrl}`
        if (pindo.isValidRwandanPhone(smsPhone)) {
          await pindo.sendSMS(smsPhone, sms, senderName)
          smsSent = true
        }
      }
    }

    await query(
      `
      update public.notifications
      set
        message = $2,
        sms_sent = $3,
        email_sent = $4,
        updated_at = now()
      where id = $1
      `,
      [notifId, text, smsSent, emailSent]
    )

    if (smsSent && emailSent) return { ok: true, status: 'sent', applicationId }
    return {
      ok: false,
      status: 'error',
      applicationId,
      message: `Partial delivery: sms_sent=${String(smsSent)} email_sent=${String(emailSent)}`,
      smsSent,
      emailSent,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMissingTransferRequestsTable(err)) {
      return { ok: false, status: 'error', applicationId, message: 'transfer_requests table missing' }
    }
    return { ok: false, status: 'error', applicationId, message }
  }
}

export async function retryTransferPendingTermsNotifications(limit: number = 25): Promise<RetryTransferNotifyResult> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25
  const result: RetryTransferNotifyResult = {
    scanned: 0,
    sent: 0,
    alreadySent: 0,
    skipped: 0,
    failed: 0,
  }

  const pendingRes = await query<{ id: string }>(
    `
    select a.id
    from public.applications a
    where a.status = 'approved_pending_permit'
      and (
        a.application_type = 'transfer'
        or coalesce(a.internal_notes ->> 'isTransfer', 'false') = 'true'
      )
      and exists (
        select 1
        from public.transfer_requests tr
        where tr.application_id = a.id
          and tr.status = 'pending'
      )
      and (
        not exists (
          select 1
          from public.notifications n0
          where n0.application_id = a.id
            and n0.title = $1
        )
        or exists (
          select 1
          from public.notifications n1
          where n1.application_id = a.id
            and n1.title = $1
            and (coalesce(n1.sms_sent, false) = false or coalesce(n1.email_sent, false) = false)
        )
      )
    order by a.updated_at desc
    limit $2
    `,
    [NOTIFICATION_TITLE, safeLimit]
  )

  result.scanned = pendingRes.rows.length
  for (const row of pendingRes.rows) {
    const sendResult = await notifyOnTransferPendingTerms(row.id)
    if (sendResult.ok && sendResult.status === 'sent') {
      result.sent += 1
      continue
    }
    if (sendResult.ok && sendResult.status === 'skipped_already_sent') {
      result.alreadySent += 1
      continue
    }
    if (sendResult.ok) {
      result.skipped += 1
      continue
    }
    result.failed += 1
  }

  return result
}
