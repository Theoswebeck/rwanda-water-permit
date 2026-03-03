import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId, isMissingTransferRequestsTable } from '../_utils'

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const applicationId = body?.applicationId as string
    const oldPermitId = body?.oldPermitId as string

    if (!isNonEmpty(applicationId) || !isNonEmpty(oldPermitId)) {
      return NextResponse.json({ success: false, message: 'applicationId and oldPermitId are required' }, { status: 400 })
    }

    // Validate the current user is the transferee who approved this transfer request.
    let tr: { id: string; status: string; approved_by_user_id: string | null; original_permit_id: string | null } | undefined
    try {
      const trRes = await query<{ id: string; status: string; approved_by_user_id: string | null; original_permit_id: string | null }>(
        `
        select id, status, approved_by_user_id, original_permit_id
        from public.transfer_requests
        where application_id = $1
        limit 1
        `,
        [applicationId]
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
      return NextResponse.json({ success: false, message: 'Transfer request not found for application' }, { status: 404 })
    }
    if (!tr) {
      return NextResponse.json({ success: false, message: 'Transfer request not found for application' }, { status: 404 })
    }
    if (tr.status !== 'approved' || tr.approved_by_user_id !== userId) {
      return NextResponse.json({ success: false, message: 'Forbidden: transfer not approved by current user' }, { status: 403 })
    }
    if (tr.original_permit_id !== oldPermitId) {
      return NextResponse.json({ success: false, message: 'Invalid oldPermitId for this transfer' }, { status: 400 })
    }

    // Fetch application number for a clearer audit note.
    const appRes = await query<{ id: string; application_number: string | null; application_type: string | null; status: string }>(
      `
      select id, application_number, application_type, status
      from public.applications
      where id = $1
      limit 1
      `,
      [applicationId]
    )
    const app = appRes.rows[0]
    if (!app) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }
    if (app.application_type !== 'transfer') {
      return NextResponse.json({ success: false, message: 'Not a transfer application' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const appNumber = app.application_number || app.id

    const updRes = await query(
      `
      update public.permits
      set
        status = 'revoked',
        transfer_reason = $2,
        updated_at = $3
      where id = $1
      `,
      [oldPermitId, `Transferred via application ${appNumber}`, now]
    )

    if (!updRes.rowCount) {
      console.error('❌ Failed to revoke old permit: permit not found')
      return NextResponse.json({ success: false, message: 'Failed to revoke old permit' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ transfers/revoke-old-permit error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

