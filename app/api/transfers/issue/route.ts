import { NextRequest, NextResponse } from 'next/server'
import { query, withTransaction } from '@/lib/db/postgres'
import { getAuthenticatedUserId, isMissingTransferRequestsTable } from '../_utils'

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/**
 * Coerces an optional date-only ISO string (YYYY-MM-DD) into a normalised
 * value safe to write to `permits.issued_date`. Anything else falls through
 * to today, computed once per request so the value is stable across both the
 * UPDATE and the response payload.
 */
function resolveTransferIssueDateOnly(raw: unknown, now: Date): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (dateOnly) return trimmed
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return now.toISOString().slice(0, 10)
}

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

    let transferRequest: {
      id: string
      status: string
      approved_by_user_id: string | null
      original_permit_id: string | null
    } | undefined
    try {
      const trRes = await query<{
        id: string
        status: string
        approved_by_user_id: string | null
        original_permit_id: string | null
      }>(
        `
        select id, status, approved_by_user_id, original_permit_id
        from public.transfer_requests
        where application_id = $1
        limit 1
        `,
        [applicationId]
      )
      transferRequest = trRes.rows[0]
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

    if (!transferRequest) {
      return NextResponse.json({ success: false, message: 'Transfer request not found for application' }, { status: 404 })
    }
    if (transferRequest.status !== 'approved' || transferRequest.approved_by_user_id !== userId) {
      return NextResponse.json({ success: false, message: 'Forbidden: transfer not approved by current user' }, { status: 403 })
    }
    if (transferRequest.original_permit_id !== oldPermitId) {
      return NextResponse.json({ success: false, message: 'Invalid oldPermitId for this transfer' }, { status: 400 })
    }

    const appRes = await query<{
      id: string
      application_number: string | null
      application_type: string | null
      internal_notes: string | null
      status: string
    }>(
      `
      select id, application_number, application_type, internal_notes::text as internal_notes, status
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
    if (app.status !== 'approved_pending_permit') {
      return NextResponse.json(
        { success: false, message: `Application is not pending permit issuance (status=${app.status})` },
        { status: 400 }
      )
    }

    let isTransferApp = app.application_type === 'transfer'
    if (!isTransferApp) {
      try {
        const notes = typeof app.internal_notes === 'string' ? JSON.parse(app.internal_notes) : null
        if (notes && notes.isTransfer === true) isTransferApp = true
      } catch {
        // ignore malformed notes
      }
    }
    if (!isTransferApp) {
      return NextResponse.json({ success: false, message: 'Not a transfer application' }, { status: 400 })
    }

    const nowDate = new Date()
    const nowIso = nowDate.toISOString()
    const appNumber = app.application_number || app.id
    const transferReason = `Transferred via application ${appNumber}`
    // Transfer issuance date locks to "today" (the moment the transferee
    // signs the terms — this route is invoked from the terms-acceptance
    // handler). The same rule applies to every other application type via
    // `lib/permit/resolve-issue-date.ts`. Expiry is intentionally NOT
    // touched here because a transfer preserves the original permit's
    // remaining validity (see the preview route's "Transfer / modification:
    // preserve the exact expiry of the original permit." comment).
    const issuedDateOnly = resolveTransferIssueDateOnly(body?.issuedDate, nowDate)

    const updatedPermit = await withTransaction(async (tx) => {
      const existingPermitRes = await tx.query<{ id: string }>(
        `
        select id
        from public.permits
        where id = $1
        limit 1
        `,
        [oldPermitId]
      )
      if (!existingPermitRes.rows[0]) {
        throw new Error('Original permit not found')
      }

      const updateRes = await tx.query(
        `
        update public.permits
        set
          application_id = $2,
          status = 'active',
          is_transfer = true,
          transfer_reason = $3,
          issued_date = $5,
          updated_at = $4
        where id = $1
        returning *
        `,
        [oldPermitId, applicationId, transferReason, nowIso, issuedDateOnly]
      )

      if (updateRes.rowCount !== 1) {
        throw new Error('Failed to update permit ownership')
      }

      return updateRes.rows[0]
    })

    return NextResponse.json({ success: true, permit: updatedPermit })
  } catch (err) {
    console.error('❌ transfers/issue error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

