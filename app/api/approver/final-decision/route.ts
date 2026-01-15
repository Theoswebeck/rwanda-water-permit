import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PindoClient } from '@/lib/pindo-client'
import { getApplicantName, getApplicantPhone, type ApplicantContact } from '@/lib/notifications/applicant-contact'
import { sendResendEmail, renderAppEmailHtml } from '@/lib/notifications/resend-email'
import { getPortalUrl } from '@/lib/notifications/portal-url'

type Decision = 'approve' | 'reject' | 'return_to_assessment'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  // Note: this repo's `types/database.ts` is app-domain types, not Supabase-generated Database types.
  // Using generics here collapses to `never`, so keep the client untyped and validate at runtime.
  return createClient(url, serviceKey)
}

const clamp = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

function buildDecisionCopy(params: {
  decision: Decision
  applicantName: string
  applicationNumber: string
  reason?: string
}) {
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
    const reasonLine = reason ? ` Details: ${reason}` : ''
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

  // reject
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

// Use shared Resend + HTML helpers (avoid duplicating email logic across routes)
const renderDecisionEmailHtml = renderAppEmailHtml

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const decision = body?.decision as Decision
    const applicationId = body?.applicationId as string
    const reason = (body?.reason as string | undefined) || ''
    const conditions = (body?.conditions as string | undefined) || ''

    if (!isNonEmptyString(applicationId) || !['approve', 'reject', 'return_to_assessment'].includes(decision)) {
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId and decision are required' }, { status: 400 })
    }
    if (decision !== 'approve' && !isNonEmptyString(reason)) {
      return NextResponse.json({ success: false, message: 'Reason is required for rejection or return-to-assessment' }, { status: 400 })
    }

    console.log(`🔄 Approver final decision requested: decision=${decision} applicationId=${applicationId}`)

    // Fetch application
    const { data: application, error: appErr } = await supabase
      .from('applications')
      .select('id, application_number, applicant_id')
      .eq('id', applicationId)
      .single()

    if (appErr || !application) {
      console.error('❌ Failed to fetch application:', appErr)
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    const applicationNumber = application.application_number || application.id

    // Fetch applicant
    const { data: applicant, error: userErr } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, company_name, account_type, phone, mobile_phone, landline_phone, company_phone')
      .eq('id', application.applicant_id)
      .single()

    if (userErr || !applicant) {
      console.error('❌ Failed to fetch applicant:', userErr)
      return NextResponse.json({ success: false, message: 'Applicant not found' }, { status: 404 })
    }

    const applicantName = getApplicantName(applicant as ApplicantContact)
    const applicantPhone = getApplicantPhone(applicant as ApplicantContact)
    // Recipient email must be the applicant account email for THIS application (users.email).
    const applicantEmail = (applicant.email || '').trim().toLowerCase()

    if (!isNonEmptyString(applicantEmail)) {
      return NextResponse.json({ success: false, message: 'Cannot send update: applicant email not found' }, { status: 400 })
    }
    if (!isNonEmptyString(applicantPhone)) {
      return NextResponse.json({ success: false, message: 'Cannot send update: applicant phone number not found' }, { status: 400 })
    }

    // Compose messages
    const copy = buildDecisionCopy({
      decision,
      applicantName,
      applicationNumber,
      reason,
    })

    // Skip SMS/Email for return_to_assessment as per user request
    if (decision !== 'return_to_assessment') {
      // Send SMS
      const senderName = process.env.PINDO_SENDER_NAME || 'RWB'
      const pindo = new PindoClient(process.env.PINDO_API_KEY, senderName)
      if (!pindo.isValidRwandanPhone(applicantPhone)) {
        return NextResponse.json({ success: false, message: 'Invalid applicant phone number format' }, { status: 400 })
      }

      console.log(`📱 Sending decision SMS: to=${applicantPhone} application=${applicationNumber}`)
      await pindo.sendSMS(applicantPhone, copy.sms, senderName)

      // Send Email
      console.log(`✉️ Sending decision email: to=${applicantEmail} application=${applicationNumber}`)
      await sendResendEmail({
        to: applicantEmail,
        subject: copy.email.subject,
        title: copy.email.title,
        text: copy.email.text,
      })
    } else {
      console.log(`ℹ️ Skipping SMS/Email for return_to_assessment for application=${applicationNumber}`)
    }

    // Assign an approver id (fallback for environments without auth wired)
    const { data: approver, error: approverErr } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'approver')
      .limit(1)
      .single()

    if (approverErr || !approver) {
      console.error('❌ No approver user found:', approverErr)
      return NextResponse.json({ success: false, message: 'No approver found in users table' }, { status: 500 })
    }

    // Update application status only after notifications are successfully sent (prevents partial success).
    const now = new Date().toISOString()
    if (decision === 'approve') {
      const update: Record<string, unknown> = {
        // Important workflow: approval should move to "approved_pending_permit"
        // so the applicant must accept Terms & Conditions before the permit is issued.
        status: 'approved_pending_permit',
        assigned_approver_id: approver.id,
        approved_at: now,
        updated_at: now,
        // Terms tracking (added by DB migration). Keep these consistent so the dashboard can drive the flow.
        terms_status: 'pending',
        terms_presented_at: now,
      }
      if (isNonEmptyString(conditions)) update.approval_conditions = conditions.trim()

      const { error: updErr } = await supabase.from('applications').update(update).eq('id', applicationId)
      if (updErr) throw updErr
    } else if (decision === 'reject') {
      const { error: updErr } = await supabase
        .from('applications')
        .update({
          status: 'rejected',
          assigned_approver_id: approver.id,
          rejection_reason: reason.trim(),
          rejected_at: now,
          updated_at: now,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr
    } else {
      // return_to_assessment (updated workflow: return to verification stage)
      const { error: updErr } = await supabase
        .from('applications')
        .update({
          status: 'pending_verification',
          internal_notes: `Returned from Approval for further verification: ${reason.trim()}`,
          assigned_approver_id: approver.id,
          updated_at: now,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr
    }

    // Create in-app notification record
    const title =
      decision === 'approve' ? 'Application Approved' : decision === 'reject' ? 'Application Rejected' : 'Further Assessment in Progress'
    const message = copy.email.text

    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: application.applicant_id,
      title,
      message,
      type: copy.email.type,
      application_id: applicationId,
      email_sent: decision !== 'return_to_assessment',
      sms_sent: decision !== 'return_to_assessment',
    })
    if (notifErr) {
      // Don’t fail the workflow for a non-critical dashboard notification record.
      console.warn('⚠️ Failed to insert notifications row:', notifErr)
    }

    // Log the decision to audit logs
    try {
      const actionMap = {
        approve: 'application.approved',
        reject: 'application.rejected',
        return_to_assessment: 'application.revision_requested'
      }
      const severityMap = {
        approve: 'info',
        reject: 'warning',
        return_to_assessment: 'info'
      }
      const descriptionMap = {
        approve: `Approved application ${applicationNumber} for ${applicantName}`,
        reject: `Rejected application ${applicationNumber}. Reason: ${reason || 'Not specified'}`,
        return_to_assessment: `Returned application ${applicationNumber} for further verification`
      }

      await supabase.from('audit_logs').insert({
        user_id: approver.id,
        action: actionMap[decision],
        entity_type: 'application',
        table_name: 'applications',
        record_id: applicationId,
        old_values: { status: 'pending_final_approval' },
        new_values: { 
          status: decision === 'approve' ? 'approved_pending_permit' : decision === 'reject' ? 'rejected' : 'pending_verification',
          ...(decision === 'reject' ? { rejection_reason: reason } : {}),
          ...(decision === 'approve' && conditions ? { approval_conditions: conditions } : {})
        },
        description: descriptionMap[decision],
        severity: severityMap[decision] as 'info' | 'warning' | 'critical',
        status: 'success',
        request_id: crypto.randomUUID()
      })
      console.log('📝 Audit log created for final decision')
    } catch (auditErr) {
      console.warn('⚠️ Failed to create audit log:', auditErr)
    }

    console.log(`✅ Final decision completed: decision=${decision} application=${applicationNumber}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ final-decision error:', err)
    return NextResponse.json(
      { success: false, message: 'Failed to process decision. Please try again.', debug: process.env.NODE_ENV !== 'production' ? String(err) : undefined },
      { status: 500 }
    )
  }
}


