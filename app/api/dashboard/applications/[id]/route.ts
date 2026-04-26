import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildApplicationUpdateParts, getMissingApplicationColumnFromError } from '@/lib/db/application-payload'
import { sanitizeApplicationEnumPayload } from '@/lib/db/application-enum-sanitizer'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
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
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await context.params

    let appRes
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
    const application = appRes.rows[0]
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
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

    while (true) {
      const keys = Object.keys(updatePayload)
      if (!keys.length) {
        return NextResponse.json({ success: false, message: 'No update fields provided' }, { status: 400 })
      }

      const { sets, values } = buildApplicationUpdateParts(updatePayload)
      values.push(id, userId)

      try {
        const updated = await query(
          `
          update public.applications
          set ${sets.join(', ')}
          where id = $${keys.length + 1} and applicant_id = $${keys.length + 2}
          returning *
          `,
          values
        )

        if (!updated.rowCount) {
          return NextResponse.json(
            { success: false, message: 'Application not found or cannot be updated' },
            { status: 404 }
          )
        }

        if (droppedColumns.length > 0) {
          console.warn('⚠️ dashboard applications PATCH ignored unknown columns:', droppedColumns)
        }

        return NextResponse.json({ success: true, application: updated.rows[0] || null })
      } catch (updateErr) {
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

