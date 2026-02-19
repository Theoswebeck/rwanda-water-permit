import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseServerAuth, normalizeEmail, normalizeRwandaPhoneKey } from '../_utils'

const isMissingTransferRequestsTable = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  const message = String((err as { message?: unknown } | null)?.message || '')
  return (
    code === '42P01' ||
    message.includes('relation "public.transfer_requests" does not exist') ||
    message.includes('relation "transfer_requests" does not exist')
  )
}

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

    // Fetch profile to get phone (email comes from auth user).
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

    if (!emailLower || !phoneKey) {
      return NextResponse.json({ success: true, transfers: [] })
    }

    const { data, error } = await supabaseAdmin
      .from('transfer_requests')
      .select(
        'id,application_id,original_permit_id,transferor_user_id,transferee_email,transferee_phone,status,approved_by_user_id,approved_at,created_at,updated_at'
      )
      .eq('transferee_email', emailLower)
      .eq('transferee_phone', phoneKey)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      // If the feature table isn't deployed yet, treat as "no incoming transfers"
      // to avoid breaking the dashboard UX.
      if (isMissingTransferRequestsTable(error)) {
        console.warn('⚠️ transfers/incoming: transfer_requests table missing; returning empty list')
        return NextResponse.json({ success: true, transfers: [] })
      }

      console.error('❌ transfers/incoming error:', error)
      return NextResponse.json({ success: false, message: 'Failed to fetch incoming transfers' }, { status: 500 })
    }

    const transferRows = (data || []) as TransferRequestRow[]
    const applicationIds = Array.from(
      new Set(transferRows.map((r) => r.application_id).filter((id): id is string => Boolean(id)))
    )

    if (applicationIds.length === 0) {
      return NextResponse.json({ success: true, transfers: [] })
    }

    // NOTE: PostgREST "embedding" (applications!application_id) requires a real FK, which
    // isn't present in some environments. We do a second query and stitch results manually.
    const { data: apps, error: appsErr } = await supabaseAdmin
      .from('applications')
      .select('id,application_number,project_title,status,terms_status,application_type,internal_notes')
      .in('id', applicationIds)

    if (appsErr) {
      console.error('❌ transfers/incoming applications fetch error:', appsErr)
      return NextResponse.json({ success: false, message: 'Failed to fetch incoming transfers' }, { status: 500 })
    }

    const appById = new Map<string, TransferApplicationRow>()
    ;((apps || []) as TransferApplicationRow[]).forEach((a) => {
      appById.set(a.id, a)
    })

    const transfers = transferRows
      .map((tr) => ({ ...tr, application: appById.get(tr.application_id) ?? null }))
      .filter((row) => {
        const app = row.application
        return app && app.application_type === 'transfer' && app.status === 'approved_pending_permit'
      })

    return NextResponse.json({ success: true, transfers })
  } catch (err) {
    console.error('❌ transfers/incoming error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

