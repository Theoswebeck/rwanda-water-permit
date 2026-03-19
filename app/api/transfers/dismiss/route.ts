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

    let tr: Record<string, unknown> | undefined
    try {
      const trRes = await query(
        `
        select id, transferee_email, transferee_phone, status
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
          { success: false, message: 'Transfer requests table is not available yet.' },
          { status: 503 }
        )
      }
      throw trErr
    }

    if (!tr) {
      return NextResponse.json({ success: false, message: 'Transfer request not found' }, { status: 404 })
    }

    if (String(tr.status) !== 'pending') {
      return NextResponse.json({ success: false, message: `Transfer request is not pending (status=${tr.status})` }, { status: 400 })
    }

    if (normalizeEmail(tr.transferee_email) !== emailLower || String(tr.transferee_phone) !== phoneKey) {
      return NextResponse.json({ success: false, message: 'Forbidden: this transfer request does not match your email/phone' }, { status: 403 })
    }

    try {
      const result = await query(
        `
        update public.transfer_requests
        set status = 'rejected', updated_at = now()
        where id = $1 and status = 'pending'
        `,
        [transferRequestId]
      )

      if (result.rowCount !== 1) {
        return NextResponse.json({ success: false, message: 'Transfer request is no longer pending' }, { status: 409 })
      }
    } catch (updErr) {
      if (isMissingTransferRequestsTable(updErr)) {
        return NextResponse.json(
          { success: false, message: 'Transfer requests table is not available yet.' },
          { status: 503 }
        )
      }
      throw updErr
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ transfers/dismiss error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
