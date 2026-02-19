import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseServerAuth, normalizeEmail, normalizeRwandaPhoneKey } from '../_utils'

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

type UserContactProfile = {
  id: string
  email: string | null
  phone: string | null
  mobile_phone: string | null
  company_phone: string | null
  landline_phone: string | null
}

const asRecord = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object') return {}
  return v as Record<string, unknown>
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const auth = getSupabaseServerAuth(req)
    if (!supabaseAdmin || !auth) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: missing Supabase env vars' },
        { status: 500 }
      )
    }

    const { supabaseAuth } = auth
    const user = (await supabaseAuth.auth.getUser()).data.user
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const transferRequestId = body?.transferRequestId as string
    if (!isNonEmpty(transferRequestId)) {
      return NextResponse.json({ success: false, message: 'transferRequestId is required' }, { status: 400 })
    }

    // Load current user's profile to match phone/email.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id, email, phone, mobile_phone, company_phone, landline_phone')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile) {
      return NextResponse.json({ success: false, message: 'User profile not found' }, { status: 404 })
    }

    const p = profile as unknown as UserContactProfile
    const emailLower = normalizeEmail(p.email || user.email || '')
    const rawPhone = p.phone || p.mobile_phone || p.company_phone || p.landline_phone || ''
    const phoneKey = normalizeRwandaPhoneKey(rawPhone)

    // Load transfer request
    const { data: tr, error: trErr } = await supabaseAdmin
      .from('transfer_requests')
      .select('*')
      .eq('id', transferRequestId)
      .single()
    if (trErr || !tr) {
      return NextResponse.json({ success: false, message: 'Transfer request not found' }, { status: 404 })
    }

    if (String(tr.status) !== 'pending') {
      return NextResponse.json({ success: false, message: `Transfer request is not pending (status=${tr.status})` }, { status: 400 })
    }

    if (normalizeEmail(tr.transferee_email) !== emailLower || String(tr.transferee_phone) !== phoneKey) {
      return NextResponse.json({ success: false, message: 'Forbidden: this transfer request does not match your email/phone' }, { status: 403 })
    }

    // Validate application state
    const { data: app, error: appErr } = await supabaseAdmin
      .from('applications')
      .select('id, applicant_id, status, terms_status, application_type, internal_notes, application_number')
      .eq('id', tr.application_id)
      .single()
    if (appErr || !app) {
      return NextResponse.json({ success: false, message: 'Linked application not found' }, { status: 404 })
    }
    if (app.application_type !== 'transfer') {
      return NextResponse.json({ success: false, message: 'Linked application is not a transfer application' }, { status: 400 })
    }
    if (app.status !== 'approved_pending_permit') {
      return NextResponse.json(
        { success: false, message: 'Transfer can only be approved at Pending Terms Acceptance stage' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    // Update internal_notes with transferee approval info (preserve existing notes).
    const nextNotes = (() => {
      const raw = app.internal_notes
      let parsed: Record<string, unknown> = {}
      try {
        if (typeof raw === 'string' && raw.trim()) parsed = asRecord(JSON.parse(raw))
      } catch {
        parsed = {}
      }
      const prevTransferApproval = asRecord(parsed.transferApproval)
      const transferApproval = {
        ...prevTransferApproval,
        transferRequestId: tr.id,
        transfereeApproved: true,
        transfereeUserId: user.id,
        transfereeEmail: emailLower,
        transfereePhoneKey: phoneKey,
        approvedAt: now,
        transferorUserId: tr.transferor_user_id,
        originalPermitId: tr.original_permit_id,
      }
      return JSON.stringify({ ...parsed, transferApproval })
    })()

    // Idempotent updates: mark transfer request approved + handoff application ownership to transferee.
    const { error: updTrErr } = await supabaseAdmin
      .from('transfer_requests')
      .update({
        status: 'approved',
        approved_by_user_id: user.id,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', tr.id)
    if (updTrErr) throw updTrErr

    const { error: updAppErr } = await supabaseAdmin
      .from('applications')
      .update({
        applicant_id: user.id,
        internal_notes: nextNotes,
        updated_at: now,
      })
      .eq('id', tr.application_id)
    if (updAppErr) throw updAppErr

    return NextResponse.json({ success: true, applicationId: tr.application_id })
  } catch (err) {
    console.error('❌ transfers/approve error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

