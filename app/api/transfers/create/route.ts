import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId, isMissingTransferRequestsTable, normalizeEmail, normalizeRwandaPhoneKey } from '../_utils'

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const applicationId = body?.applicationId as string
    const originalPermitId = body?.originalPermitId as string
    const transfereeEmailRaw = body?.transfereeEmail as string
    const transfereePhoneRaw = body?.transfereePhone as string

    if (!isNonEmpty(applicationId) || !isNonEmpty(originalPermitId) || !isNonEmpty(transfereeEmailRaw) || !isNonEmpty(transfereePhoneRaw)) {
      return NextResponse.json(
        { success: false, message: 'Invalid request: applicationId, originalPermitId, transfereeEmail, transfereePhone are required' },
        { status: 400 }
      )
    }

    const transfereeEmail = normalizeEmail(transfereeEmailRaw)
    const transfereePhoneKey = normalizeRwandaPhoneKey(transfereePhoneRaw)
    if (!transfereeEmail.includes('@')) {
      return NextResponse.json({ success: false, message: 'Invalid transferee email' }, { status: 400 })
    }
    if (!transfereePhoneKey || transfereePhoneKey.length !== 9) {
      return NextResponse.json({ success: false, message: 'Invalid transferee phone number' }, { status: 400 })
    }

    // Validate application is owned by the current user and is a transfer application.
    const appRes = await query<{
      id: string
      applicant_id: string
      application_number: string | null
      project_title: string | null
      application_type: string | null
      internal_notes: string | null
    }>(
      `
      select id, applicant_id, application_number, project_title, application_type, internal_notes::text as internal_notes
      from public.applications
      where id = $1
      limit 1
      `,
      [applicationId]
    )
    const app = appRes.rows[0]
    if (!app) {
      return NextResponse.json({ success: false, message: 'Transfer application not found' }, { status: 404 })
    }
    if (app.applicant_id !== userId) {
      return NextResponse.json({ success: false, message: 'Forbidden: not your transfer application' }, { status: 403 })
    }
    if (app.application_type !== 'transfer') {
      return NextResponse.json({ success: false, message: 'Not a transfer application' }, { status: 400 })
    }

    // Create or update transfer request (idempotent per application).
    let tr: Record<string, unknown> | undefined
    try {
      const trRes = await query(
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
        ) values ($1,$2,$3,$4,$5,'pending',now(),now())
        on conflict (application_id) do update set
          original_permit_id = excluded.original_permit_id,
          transferor_user_id = excluded.transferor_user_id,
          transferee_email = excluded.transferee_email,
          transferee_phone = excluded.transferee_phone,
          status = 'pending',
          updated_at = now()
        returning *
        `,
        [applicationId, originalPermitId, userId, transfereeEmail, transfereePhoneKey]
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
      console.error('❌ Failed to create transfer request:', trErr)
      return NextResponse.json({ success: false, message: 'Failed to create transfer request' }, { status: 500 })
    }
    if (!tr) return NextResponse.json({ success: false, message: 'Failed to create transfer request' }, { status: 500 })

    return NextResponse.json({ success: true, transferRequest: tr })
  } catch (err) {
    console.error('❌ transfers/create error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

