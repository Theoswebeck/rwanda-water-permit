import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildApplicationUpdateParts, getMissingApplicationColumnFromError } from '@/lib/db/application-payload'
import {
  getInvalidEnumFallbackFromError,
  recordEnumCoercionInPayload,
  sanitizeApplicationEnumPayload,
} from '@/lib/db/application-enum-sanitizer'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

// Emails that are always treated as superusers (kept in sync with middleware.ts).
const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

// Returns the authenticated user's id plus whether they may read any application
// (admins / superusers), not just the ones they personally submitted.
async function getAuthenticatedActor(
  req: NextRequest
): Promise<{ userId: string; canReadAny: boolean } | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  if (!claims?.sub) return null
  const email = String(claims.email || '').toLowerCase()
  const canReadAny = claims.role === 'admin' || SUPERUSER_EMAILS.has(email)
  return { userId: claims.sub, canReadAny }
}

function isMissingTransferRequestsTable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  const message = String((err as { message?: unknown } | null)?.message || '')
  return (
    code === '42P01' ||
    message.includes('relation "public.transfer_requests" does not exist') ||
    message.includes('relation "transfer_requests" does not exist')
  )
}

function toSafeApplicationPayload(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['id', 'applicant_id', 'created_at', 'payment_waived'])
  const optionalUuidColumns = new Set([
    'modified_from_application_id',
    'renewed_from_permit_id',
  ])
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue
    if (blocked.has(key)) continue
    if (optionalUuidColumns.has(key)) {
      if (typeof value !== 'string') {
        out[key] = null
        continue
      }
      const normalized = value.trim()
      out[key] = uuidPattern.test(normalized) ? normalized : null
      continue
    }
    out[key] = value
  }

  return out
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAuthenticatedActor(req)
    if (!actor) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const { userId, canReadAny } = actor

    const { id } = await context.params

    let appRes
    if (canReadAny) {
      // Admins / superusers may open any application, not just their own.
      appRes = await query(
        `
        select *
        from public.applications
        where id = $1
        limit 1
        `,
        [id]
      )
    } else {
      try {
        appRes = await query(
          `
          select *
          from public.applications a
          where
            a.id = $1
            and (
              a.applicant_id = $2
              or (
                (a.application_type = 'transfer' or (a.internal_notes is not null and a.internal_notes::text like '%"isTransfer":true%'))
                and exists (
                  select 1
                  from public.transfer_requests tr
                  where tr.application_id = a.id
                    and tr.transferor_user_id = $2
                )
              )
            )
          limit 1
          `,
          [id, userId]
        )
      } catch (appErr) {
        if (!isMissingTransferRequestsTable(appErr)) {
          throw appErr
        }

        appRes = await query(
          `
          select *
          from public.applications
          where id = $1 and applicant_id = $2
          limit 1
          `,
          [id, userId]
        )
      }
    }
    const application = appRes.rows[0]
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    let transfereeEmail: string | null = null
    try {
      const trRes = await query(
        `select transferee_email from public.transfer_requests where application_id = $1 order by created_at desc limit 1`,
        [id]
      )
      transfereeEmail = (trRes.rows[0]?.transferee_email as string | undefined) ?? null
    } catch (trErr) {
      if (!isMissingTransferRequestsTable(trErr)) throw trErr
    }

    const [applicantRes, docsRes, reviewsRes, inspectionsRes, permitsRes] = await Promise.all([
      query(
        `
        select *
        from public.users
        where id = $1
        limit 1
        `,
        [String(application.applicant_id)]
      ),
      query(
        `
        select *
        from public.documents
        where application_id = $1
        order by created_at desc
        `,
        [id]
      ),
      query(
        `
        select *
        from public.reviews
        where application_id = $1
        order by created_at desc
        `,
        [id]
      ),
      query(
        `
        select *
        from public.inspections
        where application_id = $1
        order by created_at desc
        `,
        [id]
      ),
      query(
        `
        select *
        from public.permits
        where application_id = $1
        order by created_at desc
        `,
        [id]
      ),
    ])

    const full = {
      ...application,
      transferee_email: transfereeEmail,
      applicant: applicantRes.rows[0] || null,
      documents: docsRes.rows,
      reviews: reviewsRes.rows,
      inspections: inspectionsRes.rows,
      permits: permitsRes.rows,
    }

    return NextResponse.json({ success: true, application: full })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications GET[id] error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await context.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 })
    }

    const safePayload = toSafeApplicationPayload(body)
    const payload = sanitizeApplicationEnumPayload(safePayload)
    payload.updated_at = new Date().toISOString()
    const updatePayload: Record<string, unknown> = { ...payload }
    const droppedColumns: string[] = []
    const coercedEnums: string[] = []
    const pendingMigrations: string[] = []

    // Status writes from the applicant dashboard are restricted twice over:
    //  - the requested value may only be an applicant-stage status (an applicant
    //    must never be able to set e.g. 'approved' on their own application);
    //  - the row's CURRENT status must still be applicant-editable, enforced in
    //    the UPDATE's where-clause so a concurrent promotion cannot slip through.
    // Clients can hold a stale view of the status: RWB-2026-000184 was promoted
    // to 'submitted' by a payment-status poll and 11 seconds later a save-as-draft
    // from the still-mounted form PATCHed it back to 'draft', hiding the paid
    // application from staff for 20 days (same class as RWB-2026-000064).
    // 'pending_assessment' is settable ONLY as a resubmission of an application
    // the assessor returned (the edit form routes it straight back to the
    // assigned assessor). Omitting it here silently dropped every such
    // resubmission — RWB-2026-000109 resubmitted four times and stayed in
    // 'revision_required' — so it is allowed, but narrowed below to a current
    // status of 'revision_required' (from a draft it would skip payment).
    const APPLICANT_SETTABLE_STATUSES = new Set([
      'draft',
      'pending_payment',
      'submitted',
      'pending_assessment',
    ])
    const APPLICANT_EDITABLE_CURRENT_STATUSES = ['draft', 'pending_payment', 'revision_required']
    const editableCurrentStatusesFor = (next: unknown) =>
      String(next) === 'pending_assessment' ? ['revision_required'] : APPLICANT_EDITABLE_CURRENT_STATUSES
    let statusDroppedReason: string | null = null
    if ('status' in updatePayload && !APPLICANT_SETTABLE_STATUSES.has(String(updatePayload.status))) {
      statusDroppedReason = `requested status "${String(updatePayload.status)}" is not applicant-settable`
      delete updatePayload.status
    }

    while (true) {
      const keys = Object.keys(updatePayload)
      if (!keys.length) {
        return NextResponse.json({ success: false, message: 'No update fields provided' }, { status: 400 })
      }

      const includesStatus = 'status' in updatePayload
      const { sets, values } = buildApplicationUpdateParts(updatePayload)
      values.push(id, userId)
      let statusGuardSql = ''
      if (includesStatus) {
        values.push(editableCurrentStatusesFor(updatePayload.status))
        statusGuardSql = ` and status = any($${keys.length + 3})`
      }

      try {
        const updated = await query(
          `
          update public.applications
          set ${sets.join(', ')}
          where id = $${keys.length + 1} and applicant_id = $${keys.length + 2}${statusGuardSql}
          returning *
          `,
          values
        )

        if (!updated.rowCount) {
          if (includesStatus) {
            // The row exists but is no longer in an applicant-editable status
            // (or does not belong to this user). Retry without touching status
            // so plain field saves still succeed instead of clobbering the
            // application's pipeline state.
            statusDroppedReason = `application is not in an applicant-editable status (attempted "${String(updatePayload.status)}")`
            delete updatePayload.status
            continue
          }
          return NextResponse.json(
            { success: false, message: 'Application not found or cannot be updated' },
            { status: 404 }
          )
        }

        if (statusDroppedReason) {
          console.warn(`⚠️ dashboard applications PATCH ignored status write on ${id}: ${statusDroppedReason}`)
        }

        if (droppedColumns.length > 0) {
          console.warn('⚠️ dashboard applications PATCH ignored unknown columns:', droppedColumns)
        }
        if (coercedEnums.length > 0) {
          console.warn('⚠️ dashboard applications PATCH stored legacy enum fallbacks:', coercedEnums)
        }

        const updatedApplication = updated.rows[0] || null

        // Attach the applicant (user) record so the response shape matches GET.
        // Consumers (e.g. the edit form's setApplication / payment tab) replace their
        // in-state application with this response; without the join, downstream code
        // that resolves payer contact details from `application.applicant`
        // (email/phone/name) would see undefined and block payment.
        let applicant = null
        if (updatedApplication?.applicant_id) {
          try {
            const applicantRes = await query(
              `
              select *
              from public.users
              where id = $1
              limit 1
              `,
              [String(updatedApplication.applicant_id)]
            )
            applicant = applicantRes.rows[0] || null
          } catch (applicantErr) {
            console.warn('⚠️ dashboard applications PATCH could not load applicant for response:', applicantErr)
          }
        }

        return NextResponse.json({
          success: true,
          application: updatedApplication ? { ...updatedApplication, applicant } : null,
          // Never let a lossy enum coercion be visible only in the server log.
          ...(coercedEnums.length > 0
            ? { enumCoercions: coercedEnums, pendingMigrations: pendingMigrations }
            : {}),
          ...(statusDroppedReason ? { statusIgnored: statusDroppedReason } : {}),
        })
      } catch (updateErr) {
        // Schema older than the code, case 1: the enum value exists in the app's
        // allow-set but its migration has not been applied yet (SQLSTATE 22P02).
        // Retry once with the legacy value so the applicant is never blocked.
        const enumFallback = getInvalidEnumFallbackFromError(updateErr, updatePayload)
        if (enumFallback) {
          console.warn(
            `⚠️ dashboard applications PATCH: "${enumFallback.from}" is not a valid ${enumFallback.enumType} value in this database; ` +
              `retrying with "${enumFallback.to}". APPLY MIGRATION ${enumFallback.migration} to store "${enumFallback.from}" correctly.`
          )
          coercedEnums.push(`${enumFallback.column}: ${enumFallback.from} -> ${enumFallback.to}`)
          if (!pendingMigrations.includes(enumFallback.migration)) {
            pendingMigrations.push(enumFallback.migration)
          }
          // Keep the intended value recoverable (internal_notes.enumCoercions,
          // only when this PATCH already writes internal_notes so we never
          // clobber stored notes) and keep intended_activities — which every
          // classifier reads first — carrying the true activity. The migration
          // backfills water_purpose afterwards.
          recordEnumCoercionInPayload(updatePayload, enumFallback)
          updatePayload[enumFallback.column] = enumFallback.to
          continue
        }

        // Schema older than the code, case 2: the column does not exist yet.
        const missingColumn = getMissingApplicationColumnFromError(updateErr)
        if (!missingColumn || !(missingColumn in updatePayload)) {
          throw updateErr
        }

        droppedColumns.push(missingColumn)
        delete updatePayload[missingColumn]
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications PATCH error:', err)
    return NextResponse.json({ success: false, message: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ success: false, message: 'Application id is required' }, { status: 400 })
    }

    const result = await query(
      `
      delete from public.applications
      where
        id = $1
        and applicant_id = $2
        and status = 'draft'
      `,
      [id, userId]
    )

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, message: 'Application not found or cannot be deleted' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications DELETE error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

