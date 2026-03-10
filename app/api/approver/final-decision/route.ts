import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { PindoClient } from '@/lib/pindo-client'
import { getApplicantName, getApplicantPhone, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendResendEmail } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'
import { notifyOnTransferPendingTerms } from '@/lib/notifications/transfer-pending-terms'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

type Decision = 'approve' | 'reject' | 'return_to_assessment'
const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const clamp = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

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

function logFinalDecision(
  level: 'log' | 'warn' | 'error',
  traceId: string,
  step: string,
  details?: Record<string, unknown>
) {
  const payload = details ? { traceId, ...details } : { traceId }
  console[level](`🧾 [approver/final-decision] ${step}`, payload)
}

function normalizeRole(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return ''
  const aliases: Record<string, string> = { application: 'applicant' }
  return aliases[raw] ?? raw
}

function buildDecisionCopy(params: { decision: Decision; applicantName: string; applicationNumber: string; reason?: string }) {
  const { decision, applicantName, applicationNumber } = params
  const reason = (params.reason || '').trim()
  const portalUrl = getPortalUrl()
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const orgName = 'Rwanda Water Resources Board'

  if (decision === 'approve') {
    const sms = `Rwanda Water Resources Board: Dear ${applicantName}, your water permit application ${applicationNumber} has been APPROVED. Please log in and accept the Terms and Conditions for the permit to be issued. Once issued, you will be able to download the permit from your dashboard. Support: ${supportEmail}.`
    const subject = `Application approved — ${applicationNumber}`
    const title = 'Application Approved'
    const text = [
      `Dear ${applicantName},`,
      ``,
      `We are pleased to inform you that your water permit application (${applicationNumber}) has been approved by Rwanda Water Resources Board.`,
      ``,
      `Next steps:`,
      `- Please log in and accept the Terms and Conditions for the permit to be issued.`,
      `- Once the permit is issued, you will be able to download the permit document from your dashboard.`,
      `- If you require assistance, please contact us at ${supportEmail}.`,
      ``,
      `Portal: ${portalUrl}`,
      ``,
      `${orgName}`,
    ].join('\n')
    return { sms, email: { subject, title, text, type: 'success' as const } }
  }

  if (decision === 'return_to_assessment') {
    const sms = `Rwanda Water Resources Board: Dear ${applicantName}, your water permit application ${applicationNumber} is undergoing further verification. No action is required from you at this time. Support: ${supportEmail}.`
    const subject = `Further verification in progress — ${applicationNumber}`
    const title = 'Further Verification in Progress'
    const text = [
      `Dear ${applicantName},`,
      ``,
      `Your water permit application (${applicationNumber}) has been returned for further verification by the board.`,
      ``,
      `Current Status:`,
      `The application is being verified again to ensure all requirements are met. You do not need to take any action at this time.`,
      ``,
      `What to do next:`,
      `- We will notify you once the verification is complete and a final decision is made.`,
      `- You can continue to track your application status in the portal.`,
      ``,
      `Portal: ${portalUrl}`,
      `Support: ${supportEmail}`,
      ``,
      `${orgName}`,
    ].join('\n')
    return { sms, email: { subject, title, text, type: 'info' as const } }
  }

  const reasonLine = reason ? `Reason provided: ${reason}` : `Reason provided: (not specified)`
  const sms = `Rwanda Water Resources Board: Dear ${applicantName}, your water permit application ${applicationNumber} has been REJECTED. ${clamp(reasonLine, 220)} Support: ${supportEmail}.`
  const subject = `Application rejected — ${applicationNumber}`
  const title = 'Application Rejected'
  const text = [
    `Dear ${applicantName},`,
    ``,
    `We regret to inform you that your water permit application (${applicationNumber}) has been rejected by Rwanda Water Resources Board.`,
    ``,
    `Reason:`,
    reason ? reason : '(not specified)',
    ``,
    `You may correct the issues and submit a new application, or contact us for guidance.`,
    ``,
    `Support: ${supportEmail}`,
    `Portal: ${portalUrl}`,
    ``,
    `${orgName}`,
  ].join('\n')
  return { sms, email: { subject, title, text, type: 'error' as const } }
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID()
  try {
    logFinalDecision('log', traceId, 'received approver final-decision request')

    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    const actorUserId = claims?.sub
    if (!actorUserId) {
      logFinalDecision('warn', traceId, 'rejecting request because actor is not authenticated')
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const actorRoleRes = await query<{ role: string | null }>(
      `
      select role
      from public.users
      where id = $1
      limit 1
      `,
      [actorUserId]
    )
    const roleFromDb = normalizeRole(actorRoleRes.rows[0]?.role)
    const roleFromClaims = normalizeRole(claims?.role)
    const effectiveRole = roleFromDb || roleFromClaims
    const actorEmail = String(claims?.email || '').trim().toLowerCase()
    const isSuperuser = SUPERUSER_EMAILS.has(actorEmail)
    logFinalDecision('log', traceId, 'resolved actor identity', {
      actorUserId,
      actorEmail: maskEmail(actorEmail),
      effectiveRole,
      isSuperuser,
    })
    if (!isSuperuser && !['approver', 'admin'].includes(effectiveRole)) {
      logFinalDecision('warn', traceId, 'rejecting request because actor is not authorized')
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const decision = body?.decision as Decision
    const applicationId = body?.applicationId as string
    const reason = (body?.reason as string | undefined) || ''
    const conditions = (body?.conditions as string | undefined) || ''
    logFinalDecision('log', traceId, 'parsed request body', {
      applicationId,
      decision,
      hasReason: isNonEmptyString(reason),
      hasConditions: isNonEmptyString(conditions),
    })

    if (!isNonEmptyString(applicationId) || !['approve', 'reject', 'return_to_assessment'].includes(decision)) {
      logFinalDecision('warn', traceId, 'rejecting request because payload is invalid', {
        applicationId,
        decision,
      })
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId and decision are required' }, { status: 400 })
    }
    if (decision !== 'approve' && !isNonEmptyString(reason)) {
      logFinalDecision('warn', traceId, 'rejecting request because reason is missing for non-approval decision', {
        applicationId,
        decision,
      })
      return NextResponse.json({ success: false, message: 'Reason is required for rejection or return-to-assessment' }, { status: 400 })
    }

    const appRes = await query<{ id: string; application_number: string | null; applicant_id: string; application_type: string | null; internal_notes: string | null }>(
      `select id, application_number, applicant_id, application_type, internal_notes::text as internal_notes from public.applications where id = $1 limit 1`,
      [applicationId]
    )
    const application = appRes.rows[0]
    if (!application) {
      logFinalDecision('warn', traceId, 'application not found', { applicationId })
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }
    const applicationNumber = application.application_number || application.id
    let isTransferApplication = application.application_type === 'transfer'
    if (!isTransferApplication) {
      try {
        const notes = typeof application.internal_notes === 'string' ? JSON.parse(application.internal_notes) : null
        if (notes && typeof notes === 'object' && (notes as { isTransfer?: boolean }).isTransfer === true) {
          isTransferApplication = true
        }
      } catch {
        // Ignore malformed notes; approval route should not fail because of logging-only parsing.
      }
    }
    logFinalDecision('log', traceId, 'loaded application', {
      applicationId,
      applicationNumber,
      applicationType: application.application_type,
      isTransferApplication,
      applicantId: application.applicant_id,
    })

    const applicantRes = await query<ApplicantContact & { email: string }>(
      `
      select id, email, first_name, last_name, company_name, account_type, phone, mobile_phone, landline_phone, company_phone
      from public.users
      where id = $1
      limit 1
      `,
      [application.applicant_id]
    )
    const applicant = applicantRes.rows[0]
    if (!applicant) {
      logFinalDecision('warn', traceId, 'applicant record not found', {
        applicationId,
        applicantId: application.applicant_id,
      })
      return NextResponse.json({ success: false, message: 'Applicant not found' }, { status: 404 })
    }

    const applicantName = getApplicantName(applicant as ApplicantContact)
    const applicantPhone = getApplicantPhone(applicant as ApplicantContact)
    const applicantEmail = String(applicant.email || '').trim().toLowerCase()
    if (!isNonEmptyString(applicantEmail) || !isNonEmptyString(applicantPhone)) {
      logFinalDecision('warn', traceId, 'applicant contact info missing', {
        applicationId,
        applicantEmail: isNonEmptyString(applicantEmail) ? maskEmail(applicantEmail) : '(missing-email)',
        applicantPhone: isNonEmptyString(applicantPhone) ? maskPhone(applicantPhone) : '(missing-phone)',
      })
      return NextResponse.json({ success: false, message: 'Applicant contact info missing' }, { status: 400 })
    }

    logFinalDecision('log', traceId, 'resolved applicant contact', {
      applicationId,
      applicantName,
      applicantEmail: maskEmail(applicantEmail),
      applicantPhone: maskPhone(applicantPhone),
    })

    const copy = buildDecisionCopy({ decision, applicantName, applicationNumber, reason })
    logFinalDecision('log', traceId, 'built applicant notification copy', {
      applicationId,
      decision,
    })
    if (decision !== 'return_to_assessment') {
      const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
      const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
      if (!pindo.isValidRwandanPhone(applicantPhone)) {
        logFinalDecision('warn', traceId, 'aborting because applicant phone format is invalid', {
          applicationId,
          applicantPhone: maskPhone(applicantPhone),
        })
        return NextResponse.json({ success: false, message: 'Invalid applicant phone number format' }, { status: 400 })
      }
      logFinalDecision('log', traceId, 'sending applicant approval notifications', {
        applicationId,
        smsTo: maskPhone(applicantPhone),
        emailTo: maskEmail(applicantEmail),
        senderName,
      })
      await pindo.sendSMS(applicantPhone, copy.sms, senderName)
      logFinalDecision('log', traceId, 'applicant SMS sent successfully', {
        applicationId,
        smsTo: maskPhone(applicantPhone),
      })
      await sendResendEmail({ to: applicantEmail, subject: copy.email.subject, title: copy.email.title, text: copy.email.text })
      logFinalDecision('log', traceId, 'applicant email sent successfully', {
        applicationId,
        emailTo: maskEmail(applicantEmail),
      })
    }

    if (decision === 'approve') {
      logFinalDecision('log', traceId, 'updating application to approved_pending_permit', {
        applicationId,
        hasConditions: isNonEmptyString(conditions.trim()),
      })
      await query(
        `
        update public.applications
        set
          status = 'approved_pending_permit',
          assigned_approver_id = $2,
          approved_at = now(),
          updated_at = now(),
          terms_status = 'pending',
          terms_presented_at = now(),
          approval_conditions = case when $3 <> '' then $3 else approval_conditions end
        where id = $1
        `,
        [applicationId, actorUserId, conditions.trim()]
      )
      logFinalDecision('log', traceId, 'application status updated to approved_pending_permit', {
        applicationId,
        applicationNumber,
      })

      logFinalDecision('log', traceId, 'dispatching transferee pending-terms notification', {
        applicationId,
        isTransferApplication,
      })
      const transferNotifyResult = await notifyOnTransferPendingTerms(applicationId, {
        traceId,
        source: 'approver-final-decision',
      })
      if (!transferNotifyResult.ok) {
        logFinalDecision('warn', traceId, 'transferee pending-terms notification did not complete fully', {
          applicationId,
          message: transferNotifyResult.message,
          smsSent: transferNotifyResult.smsSent,
          emailSent: transferNotifyResult.emailSent,
        })
      } else {
        logFinalDecision('log', traceId, 'transferee pending-terms notification finished', {
          applicationId,
          resultStatus: transferNotifyResult.status,
        })
      }
    } else if (decision === 'reject') {
      logFinalDecision('log', traceId, 'updating application to rejected', {
        applicationId,
      })
      await query(
        `
        update public.applications
        set
          status = 'rejected',
          assigned_approver_id = $2,
          rejection_reason = $3,
          rejected_at = now(),
          updated_at = now()
        where id = $1
        `,
        [applicationId, actorUserId, reason.trim()]
      )
      logFinalDecision('log', traceId, 'application status updated to rejected', {
        applicationId,
      })
    } else {
      logFinalDecision('log', traceId, 'returning application to verification', {
        applicationId,
      })
      await query(
        `
        update public.applications
        set
          status = 'returned_to_verification',
          internal_notes = $3,
          assigned_approver_id = $2,
          updated_at = now()
        where id = $1
        `,
        [applicationId, actorUserId, `Returned from Approval for further verification: ${reason.trim()}`]
      )
      logFinalDecision('log', traceId, 'application returned to verification', {
        applicationId,
      })
    }

    await query(
      `
      insert into public.notifications (user_id, title, message, type, application_id, email_sent, sms_sent, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, now(), now())
      `,
      [
        application.applicant_id,
        decision === 'approve' ? 'Application Approved' : decision === 'reject' ? 'Application Rejected' : 'Further Assessment in Progress',
        copy.email.text,
        copy.email.type,
        applicationId,
        decision !== 'return_to_assessment',
        decision !== 'return_to_assessment',
      ]
    ).catch(() => undefined)
    logFinalDecision('log', traceId, 'application notification row inserted', {
      applicationId,
      title: decision === 'approve' ? 'Application Approved' : decision === 'reject' ? 'Application Rejected' : 'Further Assessment in Progress',
    })

    await query(
      `
      insert into public.audit_logs (
        user_id, action, entity_type, table_name, record_id, old_values, new_values, description, severity, status, request_id, created_at
      ) values ($1, $2, 'application', 'applications', $3, $4::jsonb, $5::jsonb, $6, $7, 'success', $8, now())
      `,
      [
        actorUserId,
        decision === 'approve' ? 'application.approved' : decision === 'reject' ? 'application.rejected' : 'application.revision_requested',
        applicationId,
        JSON.stringify({ status: 'pending_final_approval' }),
        JSON.stringify({
          status: decision === 'approve' ? 'approved_pending_permit' : decision === 'reject' ? 'rejected' : 'returned_to_verification',
        }),
        decision === 'approve'
          ? `Approved application ${applicationNumber} for ${applicantName}`
          : decision === 'reject'
            ? `Rejected application ${applicationNumber}. Reason: ${reason || 'Not specified'}`
            : `Returned application ${applicationNumber} for further verification`,
        decision === 'reject' ? 'warning' : 'info',
        traceId,
      ]
    ).catch(() => undefined)
    logFinalDecision('log', traceId, 'audit log inserted', {
      applicationId,
      decision,
    })

    logFinalDecision('log', traceId, 'final-decision request completed successfully', {
      applicationId,
      decision,
      applicationNumber,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      logFinalDecision('warn', traceId, 'session validation failed', { error: message })
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    logFinalDecision('error', traceId, 'final-decision request failed', {
      error: message,
    })
    console.error('❌ final-decision error:', err)
    return NextResponse.json(
      { success: false, message: 'Failed to process decision. Please try again.', debug: process.env.NODE_ENV !== 'production' ? String(err) : undefined },
      { status: 500 }
    )
  }
}
