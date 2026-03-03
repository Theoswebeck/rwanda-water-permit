import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

function isStaffRole(role?: string): boolean {
  return ['admin', 'reviewer', 'assessor', 'inspector', 'approver', 'verifier'].includes(String(role || ''))
}

function pickPayload(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['id', 'applicant_id', 'created_at'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) continue
    if (blocked.has(k)) continue
    out[k] = v
  }
  return out
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const { id } = await context.params

    const where = isStaffRole(String(claims.role)) ? `wur.id = $1` : `wur.id = $1 and wur.applicant_id = $2`
    const params = isStaffRole(String(claims.role)) ? [id] : [id, claims.sub]

    const res = await query(
      `
      select
        wur.*,
        row_to_json(p.*) as permit,
        row_to_json(a.*) as application,
        row_to_json(u.*) as applicant
      from public.water_use_reports wur
      left join public.permits p on p.id = wur.permit_id
      left join public.applications a on a.id = wur.application_id
      left join public.users u on u.id = wur.applicant_id
      where ${where}
      limit 1
      `,
      params
    )
    const report = res.rows[0]
    if (!report) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ water-use-reports GET[id] error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const { id } = await context.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 })
    }

    const payload = pickPayload(body)
    payload.updated_at = new Date().toISOString()
    const keys = Object.keys(payload)
    if (!keys.length) {
      return NextResponse.json({ success: false, message: 'No update fields provided' }, { status: 400 })
    }

    const sets = keys.map((k, i) => `${k} = $${i + 1}`)
    const values = keys.map((k) => payload[k])

    const where = isStaffRole(String(claims.role))
      ? `id = $${keys.length + 1}`
      : `id = $${keys.length + 1} and applicant_id = $${keys.length + 2}`
    const params = isStaffRole(String(claims.role))
      ? [...values, id]
      : [...values, id, claims.sub]

    const updated = await query(
      `
      update public.water_use_reports
      set ${sets.join(', ')}
      where ${where}
      returning *
      `,
      params
    )

    if (!updated.rowCount) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, report: updated.rows[0] || null })
  } catch (err) {
    console.error('❌ water-use-reports PATCH error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
