import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildApplicationInsertParts, getMissingApplicationColumnFromError } from '@/lib/db/application-payload'
import {
  getInvalidEnumFallbackFromError,
  recordEnumCoercionInPayload,
  sanitizeApplicationEnumPayload,
} from '@/lib/db/application-enum-sanitizer'
import { checkPermitPipelineConflict } from '@/lib/db/permit-application-guard'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

function parseCsvList(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
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

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

function toSafeApplicationPayload(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['id', 'applicant_id', 'created_at', 'updated_at'])
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

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const statuses = parseCsvList(req.nextUrl.searchParams.get('status'))
    const types = parseCsvList(req.nextUrl.searchParams.get('type'))
    const provinces = parseCsvList(req.nextUrl.searchParams.get('province'))

    const conditions: string[] = [
      `(
        a.applicant_id = $1
        or (
          (a.application_type = 'transfer' or (a.internal_notes is not null and a.internal_notes::text like '%"isTransfer":true%'))
          and exists (
            select 1
            from public.transfer_requests tr
            where tr.application_id = a.id
              and tr.transferor_user_id = $1
          )
        )
      )`,
    ]
    const params: unknown[] = [userId]
    let idx = 2

    if (statuses.length > 0) {
      conditions.push(`a.status = any($${idx}::text[])`)
      params.push(statuses)
      idx += 1
    }
    if (types.length > 0) {
      conditions.push(`a.application_type = any($${idx}::text[])`)
      params.push(types)
      idx += 1
    }
    if (provinces.length > 0) {
      conditions.push(`a.province = any($${idx}::text[])`)
      params.push(provinces)
      idx += 1
    }

    let result
    try {
      result = await query(
        `
        select
          a.*,
          coalesce(last_status_action.last_action_at, a.created_at) as last_action_at,
          tr_contact.transferee_email
        from public.applications a
        left join lateral (
          select max(wh.created_at) as last_action_at
          from public.workflow_history wh
          where wh.application_id = a.id
        ) as last_status_action on true
        left join lateral (
          select tr.transferee_email
          from public.transfer_requests tr
          where tr.application_id = a.id
          order by tr.created_at desc
          limit 1
        ) as tr_contact on true
        where ${conditions.join(' and ')}
        order by a.created_at desc
        `,
        params
      )
    } catch (listErr) {
      if (!isMissingTransferRequestsTable(listErr)) {
        throw listErr
      }

      // Backward compatibility if transfer_requests table is not deployed yet.
      const fallbackConditions: string[] = ['a.applicant_id = $1']
      let fallbackIdx = 2
      if (statuses.length > 0) {
        fallbackConditions.push(`a.status = any($${fallbackIdx}::text[])`)
        fallbackIdx += 1
      }
      if (types.length > 0) {
        fallbackConditions.push(`a.application_type = any($${fallbackIdx}::text[])`)
        fallbackIdx += 1
      }
      if (provinces.length > 0) {
        fallbackConditions.push(`a.province = any($${fallbackIdx}::text[])`)
      }
      result = await query(
        `
        select
          a.*,
          coalesce(last_status_action.last_action_at, a.created_at) as last_action_at
        from public.applications a
        left join lateral (
          select max(wh.created_at) as last_action_at
          from public.workflow_history wh
          where wh.application_id = a.id
        ) as last_status_action on true
        where ${fallbackConditions.join(' and ')}
        order by a.created_at desc
        `,
        params
      )
    }

    return NextResponse.json({ success: true, applications: result.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 })
    }

    const safePayload = toSafeApplicationPayload(body)
    const payload = sanitizeApplicationEnumPayload(safePayload)
    payload.applicant_id = userId
    payload.updated_at = new Date().toISOString()

    const pipelineCheck = await checkPermitPipelineConflict({
      payload,
      applicantId: userId,
    })
    if (pipelineCheck.hasConflict) {
      return NextResponse.json(
        {
          success: false,
          code: 'PERMIT_PIPELINE_CONFLICT',
          message: pipelineCheck.message,
          conflict: pipelineCheck.conflictApplication,
        },
        { status: 409 }
      )
    }

    const insertPayload: Record<string, unknown> = { ...payload }
    const droppedColumns: string[] = []
    const coercedEnums: string[] = []
    const pendingMigrations: string[] = []

    // Backward compatibility: tolerate missing DB columns when app code is newer than schema.
    while (true) {
      const { columns, placeholders, values } = buildApplicationInsertParts(insertPayload)
      if (!columns.length) {
        return NextResponse.json(
          { success: false, message: 'No valid application data provided for insert' },
          { status: 400 }
        )
      }

      try {
        const created = await query(
          `
          insert into public.applications (${columns.join(', ')})
          values (${placeholders.join(', ')})
          returning *
          `,
          values
        )

        if (droppedColumns.length > 0) {
          console.warn('⚠️ dashboard applications POST ignored unknown columns:', droppedColumns)
        }
        if (coercedEnums.length > 0) {
          console.warn('⚠️ dashboard applications POST stored legacy enum fallbacks:', coercedEnums)
        }

        return NextResponse.json({
          success: true,
          application: created.rows[0] || null,
          // Never let a lossy enum coercion be visible only in the server log:
          // the response carries it too, and the value itself is recorded in
          // internal_notes.enumCoercions (see recordEnumCoercionInPayload).
          ...(coercedEnums.length > 0
            ? { enumCoercions: coercedEnums, pendingMigrations: pendingMigrations }
            : {}),
        })
      } catch (insertErr) {
        // Schema older than the code, case 1: the enum value exists in the app's
        // allow-set but its migration has not been applied yet (SQLSTATE 22P02).
        // Retry once with the legacy value so the applicant is never blocked.
        const enumFallback = getInvalidEnumFallbackFromError(insertErr, insertPayload)
        if (enumFallback) {
          console.warn(
            `⚠️ dashboard applications POST: "${enumFallback.from}" is not a valid ${enumFallback.enumType} value in this database; ` +
              `retrying with "${enumFallback.to}". APPLY MIGRATION ${enumFallback.migration} to store "${enumFallback.from}" correctly.`
          )
          coercedEnums.push(`${enumFallback.column}: ${enumFallback.from} -> ${enumFallback.to}`)
          if (!pendingMigrations.includes(enumFallback.migration)) {
            pendingMigrations.push(enumFallback.migration)
          }
          // Keep the intended value recoverable (internal_notes.enumCoercions)
          // and keep intended_activities — which every classifier reads first —
          // carrying the true activity, so the coerced column can never flip the
          // permit variant. The migration backfills water_purpose afterwards.
          recordEnumCoercionInPayload(insertPayload, enumFallback, { allowCreateColumns: true })
          insertPayload[enumFallback.column] = enumFallback.to
          continue
        }

        // Schema older than the code, case 2: the column does not exist yet.
        const missingColumn = getMissingApplicationColumnFromError(insertErr)
        if (!missingColumn || !(missingColumn in insertPayload)) {
          throw insertErr
        }

        droppedColumns.push(missingColumn)
        delete insertPayload[missingColumn]
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications POST error:', err)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

