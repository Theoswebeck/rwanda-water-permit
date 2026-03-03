import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId, isMissingTransferRequestsTable, normalizeEmail, normalizeRwandaPhoneKey } from '../_utils'

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
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const transferRequestId = body?.transferRequestId as string
    if (!isNonEmpty(transferRequestId)) {
      return NextResponse.json({ success: false, message: 'transferRequestId is required' }, { status: 400 })
    }

    // Load current user's profile to match phone/email.
    const profileRes = await query<UserContactProfile>(
      `
      select id, email, phone, mobile_phone, company_phone, landline_phone
      from public.users
      where id = $1
      limit 1
      `,
      [userId]
    )
    const profile = profileRes.rows[0]
    if (!profile) {
      return NextResponse.json({ success: false, message: 'User profile not found' }, { status: 404 })
    }

    const p = profile
    const emailLower = normalizeEmail(p.email || '')
    const rawPhone = p.phone || p.mobile_phone || p.company_phone || p.landline_phone || ''
    const phoneKey = normalizeRwandaPhoneKey(rawPhone)

    // Load transfer request
    let tr: Record<string, unknown> | undefined
    try {
      const trRes = await query(
        `
        select *
        from public.transfer_requests
        where id = $1
        limit 1
        `,
        [transferRequestId]
      )
      tr = trRes.rows[0]
    } catch (trErr) {
      if (isMissingTransferRequestsTable(trErr)) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Permit transfer requests are not available yet (missing transfer_requests table). Please apply the transfer requests migration to your database.',
          },
          { status: 503 }
        )
      }
      throw trErr
    }
    if (!tr) return NextResponse.json({ success: false, message: 'Transfer request not found' }, { status: 404 })

    if (String(tr.status) !== 'pending') {
      return NextResponse.json({ success: false, message: `Transfer request is not pending (status=${tr.status})` }, { status: 400 })
    }

    if (normalizeEmail(tr.transferee_email) !== emailLower || String(tr.transferee_phone) !== phoneKey) {
      return NextResponse.json({ success: false, message: 'Forbidden: this transfer request does not match your email/phone' }, { status: 403 })
    }

    // Validate application state
    const appRes = await query<{
      id: string
      applicant_id: string
      status: string
      terms_status: string | null
      application_type: string | null
      internal_notes: string | null
      application_number: string | null
    }>(
      `
      select id, applicant_id, status, terms_status, application_type, internal_notes::text as internal_notes, application_number
      from public.applications
      where id = $1
      limit 1
      `,
      [String(tr.application_id)]
    )
    const app = appRes.rows[0]
    if (!app) {
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
        transferRequestId: String(tr.id),
        transfereeApproved: true,
        transfereeUserId: userId,
        transfereeEmail: emailLower,
        transfereePhoneKey: phoneKey,
        approvedAt: now,
        transferorUserId: String(tr.transferor_user_id || ''),
        originalPermitId: String(tr.original_permit_id || ''),
      }
      return JSON.stringify({ ...parsed, transferApproval })
    })()

    // Idempotent updates: mark transfer request approved + handoff application ownership to transferee.
    try {
      await query(
        `
        update public.transfer_requests
        set
          status = 'approved',
          approved_by_user_id = $2,
          approved_at = $3,
          updated_at = $3
        where id = $1
        `,
        [String(tr.id), userId, now]
      )
    } catch (updTrErr) {
      if (isMissingTransferRequestsTable(updTrErr)) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Permit transfer requests are not available yet (missing transfer_requests table). Please apply the transfer requests migration to your database.',
          },
          { status: 503 }
        )
      }
      throw updTrErr
    }

    await query(
      `
      update public.applications
      set
        applicant_id = $2,
        internal_notes = $3::jsonb,
        updated_at = $4
      where id = $1
      `,
      [String(tr.application_id), userId, nextNotes, now]
    )

    return NextResponse.json({ success: true, applicationId: String(tr.application_id) })
  } catch (err) {
    console.error('❌ transfers/approve error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

