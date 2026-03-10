import { query } from '@/lib/db/postgres'
import { PindoClient } from '@/lib/pindo-client'
import { sendResendEmail } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

const NOTIFICATION_TITLE = 'Transfer Pending Terms (Transferee)'
const NOTIFICATION_TYPE = 'info'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

type NotifyOnTransferPendingTermsOptions = {
  traceId?: string
  source?: string
}

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

type ParsedTransferNotes = {
  isTransfer?: boolean
  originalPermitId?: string
  transferFormData?: {
    transfereeEmail?: string
    transfereePhone?: string
  }
}

function maskEmail(email: string): string {
  const [localPart, domainPart] = email.split('@')
  if (!localPart || !domainPart) return '(invalid-email)'
  if (localPart.length <= 2) return `${localPart[0] || '*'}***@${domainPart}`
  return `${localPart.slice(0, 2)}***@${domainPart}`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return '(missing-phone)'
  if (digits.length <= 4) return `***${digits}`
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

function logTransferNotification(
  level: 'log' | 'warn' | 'error',
  traceId: string,
  applicationId: string,
  step: string,
  details?: Record<string, unknown>
) {
  const payload = details ? { applicationId, traceId, ...details } : { applicationId, traceId }
  console[level](`📨 [transfer-pending-terms] ${step}`, payload)
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

function parseTransferNotes(raw: unknown): ParsedTransferNotes {
  return parseNotes(raw) as ParsedTransferNotes
}

function extractTransfereeContactFromNotes(raw: unknown) {
  const notes = parseTransferNotes(raw)
  const transferFormData = notes.transferFormData || {}
  const transfereeEmail = normalizeEmail(transferFormData.transfereeEmail)
  const transfereePhoneRaw = String(transferFormData.transfereePhone || '').trim()
  const transfereePhoneKey = transfereePhoneRaw.replace(/\D/g, '').slice(-9)
  const originalPermitId = String(notes.originalPermitId || '').trim()

  return {
    transfereeEmail,
    transfereePhoneRaw,
    transfereePhoneKey,
    originalPermitId,
  }
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
  const notes = parseTransferNotes(internalNotesRaw)
  return notes.isTransfer === true
}

export async function notifyOnTransferPendingTerms(
  applicationId: string,
  options: NotifyOnTransferPendingTermsOptions = {}
): Promise<TransferNotifyResult> {
  const traceId = options.traceId || crypto.randomUUID()
  try {
    logTransferNotification('log', traceId, applicationId, 'starting notification flow', {
      source: options.source || 'unknown',
    })

    if (!isNonEmptyString(applicationId)) {
      logTransferNotification('warn', traceId, applicationId, 'aborting because applicationId is invalid')
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
      logTransferNotification('warn', traceId, applicationId, 'application not found')
      return { ok: false, status: 'error', applicationId, message: 'Application not found' }
    }

    logTransferNotification('log', traceId, applicationId, 'loaded application', {
      status: app.status,
      applicationType: app.application_type,
      applicantId: app.applicant_id,
    })

    if (!isTransferApplication(app.application_type, app.internal_notes)) {
      logTransferNotification('log', traceId, applicationId, 'skipping because application is not a transfer')
      return { ok: true, status: 'skipped_not_transfer', applicationId }
    }

    if (String(app.status) !== 'approved_pending_permit') {
      logTransferNotification('log', traceId, applicationId, 'skipping because application is not at pending terms stage', {
        currentStatus: app.status,
      })
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
      logTransferNotification('log', traceId, applicationId, 'skipping because transferee notification already fully sent', {
        notificationId: existing.id,
      })
      return { ok: true, status: 'skipped_already_sent', applicationId }
    }

    const notesContact = extractTransfereeContactFromNotes(app.internal_notes)
    let transferRequest: TransferRequestRow | undefined
    let contactSource: 'transfer_requests' | 'application_notes' | 'transfer_requests_backfilled' = 'application_notes'

    try {
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
      transferRequest = transferRes.rows[0]
      if (transferRequest) {
        contactSource = 'transfer_requests'
        logTransferNotification('log', traceId, applicationId, 'loaded transferee contact from transfer_requests', {
          transfereeEmail: maskEmail(normalizeEmail(transferRequest.transferee_email)),
          transfereePhone: maskPhone(String(transferRequest.transferee_phone || '')),
        })
      } else {
        logTransferNotification('warn', traceId, applicationId, 'no transfer_requests row found, will fall back to application notes')
      }

      const hasTransferRequestContact =
        isNonEmptyString(transferRequest?.transferee_email) && isNonEmptyString(transferRequest?.transferee_phone)
      const canBackfillTransferRequest =
        !hasTransferRequestContact &&
        isNonEmptyString(notesContact.originalPermitId) &&
        isNonEmptyString(notesContact.transfereeEmail) &&
        isNonEmptyString(notesContact.transfereePhoneKey)

      if (canBackfillTransferRequest) {
        const upsertRes = await query<TransferRequestRow>(
          `
          insert into public.transfer_requests (
            application_id,
            original_permit_id,
            transferor_user_id,
            transferee_email,
            transferee_phone,
            status,
            created_at,
            updated_at
          ) values ($1, $2, $3, $4, $5, 'pending', now(), now())
          on conflict (application_id) do update set
            original_permit_id = excluded.original_permit_id,
            transferor_user_id = excluded.transferor_user_id,
            transferee_email = excluded.transferee_email,
            transferee_phone = excluded.transferee_phone,
            updated_at = now()
          returning transferee_email, transferee_phone
          `,
          [
            applicationId,
            notesContact.originalPermitId,
            app.applicant_id,
            notesContact.transfereeEmail,
            notesContact.transfereePhoneKey,
          ]
        )
        transferRequest = upsertRes.rows[0]
        contactSource = 'transfer_requests_backfilled'
        logTransferNotification('log', traceId, applicationId, 'backfilled transfer_requests from application notes', {
          transfereeEmail: maskEmail(normalizeEmail(transferRequest?.transferee_email || '')),
          transfereePhone: maskPhone(String(transferRequest?.transferee_phone || '')),
        })
      }
    } catch (transferErr) {
      if (isMissingTransferRequestsTable(transferErr)) {
        logTransferNotification('warn', traceId, applicationId, 'transfer_requests table is missing, using application notes fallback')
      }
      if (!isMissingTransferRequestsTable(transferErr)) throw transferErr
    }

    const transfereeEmail = normalizeEmail(transferRequest?.transferee_email || notesContact.transfereeEmail)
    const transfereePhoneRaw = String(transferRequest?.transferee_phone || notesContact.transfereePhoneRaw || '').trim()
    if (!isNonEmptyString(transfereeEmail) && !isNonEmptyString(transfereePhoneRaw)) {
      logTransferNotification('error', traceId, applicationId, 'transferee contact details could not be resolved')
      return { ok: false, status: 'error', applicationId, message: 'Transferee contact details not found' }
    }

    logTransferNotification('log', traceId, applicationId, 'resolved transferee contact details', {
      contactSource,
      transfereeEmail: isNonEmptyString(transfereeEmail) ? maskEmail(transfereeEmail) : '(missing-email)',
      transfereePhone: isNonEmptyString(transfereePhoneRaw) ? maskPhone(transfereePhoneRaw) : '(missing-phone)',
    })

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
      logTransferNotification('log', traceId, applicationId, 'creating notification state row')
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
      logTransferNotification('error', traceId, applicationId, 'failed to create notification state row')
      return { ok: false, status: 'error', applicationId, message: 'Failed to create notification state row' }
    }

    const currentNotifRes = await query<{ sms_sent: boolean | null; email_sent: boolean | null }>(
      `select sms_sent, email_sent from public.notifications where id = $1 limit 1`,
      [notifId]
    )
    const currentNotif = currentNotifRes.rows[0]
    let smsSent = Boolean(currentNotif?.sms_sent)
    let emailSent = Boolean(currentNotif?.email_sent)
    logTransferNotification('log', traceId, applicationId, 'notification state ready', {
      notificationId: notifId,
      smsSent,
      emailSent,
    })

    if (!emailSent && isNonEmptyString(transfereeEmail)) {
      try {
        logTransferNotification('log', traceId, applicationId, 'sending transferee email', {
          to: maskEmail(transfereeEmail),
        })
        const emailRes = await sendResendEmail({ to: transfereeEmail, subject, title, text })
        emailSent = Boolean(emailRes.delivered) || emailSent
        logTransferNotification('log', traceId, applicationId, 'transferee email send completed', {
          delivered: Boolean(emailRes.delivered),
          skipped: Boolean(emailRes.skipped),
        })
      } catch (emailErr) {
        logTransferNotification('warn', traceId, applicationId, 'transferee email send failed; SMS will still be attempted', {
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        })
      }
    } else if (emailSent) {
      logTransferNotification('log', traceId, applicationId, 'skipping transferee email because it was already sent')
    } else {
      logTransferNotification('warn', traceId, applicationId, 'skipping transferee email because email address is missing')
    }

    if (!smsSent) {
      try {
        const smsPhone = formatTransferPhoneForSms(transfereePhoneRaw)
        if (smsPhone) {
          const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
          const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
          const sms = `RWB: Transfer ${applicationNumber} approved. Login with same email+phone, open status Approved - Pending Terms, then accept terms to complete transfer. Portal: ${portalUrl}`
          if (pindo.isValidRwandanPhone(smsPhone)) {
            logTransferNotification('log', traceId, applicationId, 'sending transferee SMS', {
              to: maskPhone(smsPhone),
              senderName,
            })
            await pindo.sendSMS(smsPhone, sms, senderName)
            smsSent = true
            logTransferNotification('log', traceId, applicationId, 'transferee SMS sent successfully', {
              to: maskPhone(smsPhone),
            })
          } else {
            logTransferNotification('warn', traceId, applicationId, 'skipping transferee SMS because phone format is invalid', {
              phone: maskPhone(smsPhone),
            })
          }
        } else {
          logTransferNotification('warn', traceId, applicationId, 'skipping transferee SMS because phone could not be normalized')
        }
      } catch (smsErr) {
        logTransferNotification('warn', traceId, applicationId, 'transferee SMS send failed', {
          error: smsErr instanceof Error ? smsErr.message : String(smsErr),
        })
      }
    } else {
      logTransferNotification('log', traceId, applicationId, 'skipping transferee SMS because it was already sent')
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
    logTransferNotification('log', traceId, applicationId, 'updated notification state row', {
      notificationId: notifId,
      smsSent,
      emailSent,
    })

    if (smsSent && emailSent) {
      logTransferNotification('log', traceId, applicationId, 'notification flow completed successfully')
      return { ok: true, status: 'sent', applicationId }
    }

    logTransferNotification('warn', traceId, applicationId, 'notification flow completed with partial delivery', {
      smsSent,
      emailSent,
    })
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
      logTransferNotification('error', traceId, applicationId, 'notification flow failed because transfer_requests table is missing')
      return { ok: false, status: 'error', applicationId, message: 'transfer_requests table missing' }
    }
    logTransferNotification('error', traceId, applicationId, 'notification flow failed with unexpected error', {
      error: message,
    })
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
        or coalesce((a.internal_notes::jsonb) ->> 'isTransfer', 'false') = 'true'
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
