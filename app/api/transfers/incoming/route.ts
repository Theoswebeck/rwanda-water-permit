import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId, isMissingTransferRequestsTable, normalizeEmail, normalizeRwandaPhoneKey } from '../_utils'

type UserContactProfile = {
  id: string
  email: string | null
  phone: string | null
  mobile_phone: string | null
  company_phone: string | null
  landline_phone: string | null
}

type TransferRequestRow = {
  id: string
  application_id: string
  original_permit_id: string | null
  transferor_user_id: string
  transferee_email: string
  transferee_phone: string
  status: string
  approved_by_user_id: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

type TransferApplicationRow = {
  id: string
  application_number: string | null
  project_title: string | null
  status: string
  terms_status: string | null
  application_type: string | null
  internal_notes: string | null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    // Fetch profile to get phone (email comes from auth user).
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

    if (!emailLower || !phoneKey) {
      console.warn('⚠️ transfers/incoming: missing strict match identity fields', {
        userId,
        hasEmail: Boolean(emailLower),
        hasPhoneKey: Boolean(phoneKey),
      })
      return NextResponse.json({ success: true, transfers: [] })
    }

    let transferRows: TransferRequestRow[] = []
    try {
      const trRes = await query<TransferRequestRow>(
        `
        select id,application_id,original_permit_id,transferor_user_id,transferee_email,transferee_phone,status,approved_by_user_id,approved_at,created_at,updated_at
        from public.transfer_requests
        where transferee_email = $1
          and transferee_phone = $2
          and status = 'pending'
        order by created_at desc
        `,
        [emailLower, phoneKey]
      )
      transferRows = trRes.rows
    } catch (error) {
      // If the feature table isn't deployed yet, treat as "no incoming transfers"
      // to avoid breaking the dashboard UX.
      if (isMissingTransferRequestsTable(error)) {
        console.warn('⚠️ transfers/incoming: transfer_requests table missing; returning empty list')
        return NextResponse.json({ success: true, transfers: [] })
      }

      console.error('❌ transfers/incoming error:', error)
      return NextResponse.json({ success: false, message: 'Failed to fetch incoming transfers' }, { status: 500 })
    }
    const applicationIds = Array.from(
      new Set(transferRows.map((r) => r.application_id).filter((id): id is string => Boolean(id)))
    )

    if (applicationIds.length === 0) {
      return NextResponse.json({ success: true, transfers: [] })
    }

    // NOTE: PostgREST "embedding" (applications!application_id) requires a real FK, which
    // isn't present in some environments. We do a second query and stitch results manually.
    const apps = await query<TransferApplicationRow>(
      `
      select id,application_number,project_title,status,terms_status,application_type,internal_notes::text as internal_notes
      from public.applications
      where id = any($1::uuid[])
      `,
      [applicationIds]
    )

    const appById = new Map<string, TransferApplicationRow>()
    ;(apps.rows || []).forEach((a) => {
      appById.set(a.id, a)
    })

    const transfers = transferRows
      .map((tr) => ({ ...tr, application: appById.get(tr.application_id) ?? null }))
      .filter((row) => {
        const app = row.application
        if (!app || app.status !== 'approved_pending_permit') return false
        if (app.application_type === 'transfer') return true
        try {
          const notes = typeof app.internal_notes === 'string' ? JSON.parse(app.internal_notes) : null
          if (notes && notes.isTransfer === true) return true
        } catch { /* invalid JSON, skip */ }
        return false
      })

    return NextResponse.json({ success: true, transfers })
  } catch (err) {
    console.error('❌ transfers/incoming error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

