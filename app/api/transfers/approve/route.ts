import { NextRequest, NextResponse } from 'next/server'
import { query, withTransaction } from '@/lib/db/postgres'
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
    const transferRequestId = body?.transferRequestId as string | undefined
    const applicationId = body?.applicationId as string | undefined

    // Must provide either transferRequestId (external transferee, requires email+phone)
    // or applicationId (applicant-is-transferee, requires email + applicant_id ownership).
    if (!isNonEmpty(transferRequestId) && !isNonEmpty(applicationId)) {
      return NextResponse.json({ success: false, message: 'transferRequestId or applicationId is required' }, { status: 400 })
    }

    // Load current user's profile for email matching.
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

    // Load transfer request — either by its own ID or by application_id.
    let tr: Record<string, unknown> | undefined
    // When looking up by applicationId, also verify the caller is the applicant (ownership proof).
    let callerIsApplicant = false
    try {
      if (isNonEmpty(transferRequestId)) {
        const trRes = await query(
          `select * from public.transfer_requests where id = $1 limit 1`,
          [transferRequestId]
        )
        tr = trRes.rows[0]
      } else {
        // Look up by application — take the most recent pending request.
        const trRes = await query(
          `
          select tr.*
          from public.transfer_requests tr
          join public.applications a on a.id = tr.application_id
          where tr.application_id = $1
            and tr.status = 'pending'
            and a.applicant_id = $2
          order by tr.created_at desc
          limit 1
          `,
          [applicationId, userId]
        )
        tr = trRes.rows[0]
        callerIsApplicant = true
      }
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

    // Identity check: email must always match.
    // Phone is additionally required when the caller is an external transferee (not the applicant).
    // When the caller IS the applicant (callerIsApplicant), applicant_id ownership already proves identity.
    const emailMatches = normalizeEmail(tr.transferee_email) === emailLower
    const phoneMatches = Boolean(phoneKey) && String(tr.transferee_phone) === phoneKey
    if (!emailMatches || (!callerIsApplicant && !phoneMatches)) {
      console.warn('⚠️ transfers/approve identity mismatch', {
        transferRequestId: tr.id,
        callerIsApplicant,
        emailMatches,
        phoneMatches,
      })
      return NextResponse.json({ success: false, message: 'Forbidden: this transfer request does not match your identity' }, { status: 403 })
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
    let appIsTransfer = app.application_type === 'transfer'
    if (!appIsTransfer) {
      try {
        const notes = typeof app.internal_notes === 'string' ? JSON.parse(app.internal_notes) : null
        if (notes && notes.isTransfer === true) appIsTransfer = true
      } catch { /* invalid JSON */ }
    }
    if (!appIsTransfer) {
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

    // Atomic updates: mark transfer request approved + handoff application ownership to transferee.
    try {
      await withTransaction(async (tx) => {
        const trUpdate = await tx.query(
          `
          update public.transfer_requests
          set
            status = 'approved',
            approved_by_user_id = $2,
            approved_at = $3,
            updated_at = $3
          where id = $1
            and status = 'pending'
          `,
          [String(tr.id), userId, now]
        )

        if (trUpdate.rowCount !== 1) {
          throw new Error('Transfer request is no longer pending')
        }

        const appUpdate = await tx.query(
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

        if (appUpdate.rowCount !== 1) {
          throw new Error('Failed to transfer application ownership')
        }
      })
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

    return NextResponse.json({ success: true, applicationId: String(tr.application_id) })
  } catch (err) {
    console.error('❌ transfers/approve error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

