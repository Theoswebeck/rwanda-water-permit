import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PindoClient } from '@/lib/pindo-client'

type Decision = 'approve' | 'reject' | 'return_to_review'

type ApplicantContact = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  account_type?: string | null
  phone?: string | null
  mobile_phone?: string | null
  landline_phone?: string | null
  company_phone?: string | null
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  // Note: this repo's `types/database.ts` is app-domain types, not Supabase-generated Database types.
  // Using generics here collapses to `never`, so keep the client untyped and validate at runtime.
  return createClient(url, serviceKey)
}

const getApplicantName = (u: ApplicantContact) => {
  const acct = String(u.account_type || '').toLowerCase()
  if (acct === 'individual') return `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Applicant'
  return (u.company_name || '').trim() || 'Applicant'
}

const getApplicantPhone = (u: ApplicantContact) => {
  return u.phone || u.mobile_phone || u.landline_phone || u.company_phone || null
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

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://permit.rwb.rw'
  const supportEmail = process.env.SUPPORT_EMAIL || 'contact@rwb.rw'
  const orgName = 'Rwanda Water Board'

  if (decision === 'approve') {
    const sms = `Rwanda Water Board: Dear ${applicantName}, your water permit application ${applicationNumber} has been APPROVED. Please log in and accept the Terms and Conditions for the permit to be issued. Once issued, you will be able to download the permit from your dashboard. Support: ${supportEmail}.`
    const subject = `Application approved — ${applicationNumber}`
    const title = 'Application Approved'
    const text = [
      `Dear ${applicantName},`,
      ``,
      `We are pleased to inform you that your water permit application (${applicationNumber}) has been approved by Rwanda Water Board.`,
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

  if (decision === 'return_to_review') {
    const reasonLine = reason ? ` Feedback: ${reason}` : ''
    const sms = `Rwanda Water Board: Dear ${applicantName}, your water permit application ${applicationNumber} requires revisions.${clamp(reasonLine, 220)} Please log in to your portal to view the details and resubmit. Support: ${supportEmail}.`
    const subject = `Revisions required — ${applicationNumber}`
    const title = 'Revisions Required'
    const text = [
      `Dear ${applicantName},`,
      ``,
      `Your water permit application (${applicationNumber}) requires revisions before it can proceed.`,
      ``,
      `Feedback:`,
      reason ? reason : '(not specified)',
      ``,
      `What to do next:`,
      `- Log in to your portal to view the detailed feedback.`,
      `- Update the required information/documents and resubmit your application.`,
      ``,
      `Portal: ${portalUrl}`,
      `Support: ${supportEmail}`,
      ``,
      `${orgName}`,
    ].join('\n')
    return { sms, email: { subject, title, text, type: 'warning' as const } }
  }

  // reject
  const reasonLine = reason ? `Reason provided: ${reason}` : `Reason provided: (not specified)`
  const sms = `Rwanda Water Board: Dear ${applicantName}, your water permit application ${applicationNumber} has been REJECTED. ${clamp(reasonLine, 220)} Support: ${supportEmail}.`
  const subject = `Application rejected — ${applicationNumber}`
  const title = 'Application Rejected'
  const text = [
    `Dear ${applicantName},`,
    ``,
    `We regret to inform you that your water permit application (${applicationNumber}) has been rejected by Rwanda Water Board.`,
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

function renderDecisionEmailHtml(params: { title: string; text: string }) {
  const escaped = params.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `
    <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:680px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="color:#111827;margin:0">Rwanda Water Board</h1>
        <h2 style="color:#374151;margin:10px 0">${params.title}</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;color:#111827">
        ${escaped}
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#6b7280;font-size:12px;text-align:center;margin:0">Rwanda Water Board - Water Permit Application System</p>
    </div>
  `
}

async function sendEmail(params: { to: string; subject: string; title: string; text: string }) {
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.EMAIL_FROM || 'nouru@menlohq.com'
  if (!resendKey) {
    throw new Error('Email provider not configured. Set RESEND_API_KEY.')
  }

  const html = renderDecisionEmailHtml({ title: params.title, text: params.text })
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html,
    }),
  })

  const responseText = await resp.text()
  if (!resp.ok) {
    throw new Error(`Resend API error: status=${resp.status}, body=${responseText}`)
  }
}

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

    if (!isNonEmptyString(applicationId) || !['approve', 'reject', 'return_to_review'].includes(decision)) {
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId and decision are required' }, { status: 400 })
    }
    if (decision !== 'approve' && !isNonEmptyString(reason)) {
      return NextResponse.json({ success: false, message: 'Reason is required for rejection or return-to-review' }, { status: 400 })
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
    await sendEmail({
      to: applicantEmail,
      subject: copy.email.subject,
      title: copy.email.title,
      text: copy.email.text,
    })

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
      const { error: updErr } = await supabase
        .from('applications')
        .update({
          status: 'revision_required',
          revision_notes: reason.trim(),
          assigned_approver_id: approver.id,
          updated_at: now,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr
    }

    // Create in-app notification record
    const title =
      decision === 'approve' ? 'Application Approved' : decision === 'reject' ? 'Application Rejected' : 'Revisions Required'
    const message = copy.email.text

    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: application.applicant_id,
      title,
      message,
      type: copy.email.type,
      application_id: applicationId,
      email_sent: true,
      sms_sent: true,
    })
    if (notifErr) {
      // Don’t fail the workflow for a non-critical dashboard notification record.
      console.warn('⚠️ Failed to insert notifications row:', notifErr)
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


