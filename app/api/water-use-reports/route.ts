import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildWaterUseReportInsertParts } from '@/lib/db/water-use-report-payload'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

function isStaffRole(role?: string): boolean {
  return ['admin', 'reviewer', 'assessor', 'inspector', 'approver', 'verifier'].includes(String(role || ''))
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const permitId = req.nextUrl.searchParams.get('permitId')?.trim() || ''
    const reportingYearRaw = req.nextUrl.searchParams.get('reportingYear')?.trim() || ''
    const includeRelations = req.nextUrl.searchParams.get('includeRelations') !== 'false'

    const where: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (!isStaffRole(String(claims.role))) {
      where.push(`wur.applicant_id = $${idx}`)
      params.push(claims.sub)
      idx += 1
    }
    if (permitId) {
      where.push(`wur.permit_id = $${idx}`)
      params.push(permitId)
      idx += 1
    }
    if (reportingYearRaw) {
      where.push(`wur.reporting_year = $${idx}`)
      params.push(Number(reportingYearRaw))
      idx += 1
    }

    const sql = includeRelations
      ? `
        select
          wur.*,
          row_to_json(p.*) as permit,
          row_to_json(a.*) as application,
          row_to_json(u.*) as applicant
        from public.water_use_reports wur
        left join public.permits p on p.id = wur.permit_id
        left join public.applications a on a.id = wur.application_id
        left join public.users u on u.id = wur.applicant_id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by wur.created_at desc
      `
      : `
        select wur.*
        from public.water_use_reports wur
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by wur.created_at desc
      `

    const res = await query(sql, params)
    return NextResponse.json({ success: true, reports: res.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ water-use-reports GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 })
    }

    const payload: Record<string, unknown> = { ...body, applicant_id: claims.sub, updated_at: new Date().toISOString() }
    delete payload.id
    delete payload.created_at

    const safePayload = Object.fromEntries(
      Object.entries(payload).filter(([k]) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(k))
    )
    const { columns: keys, placeholders, values } = buildWaterUseReportInsertParts(safePayload)
    if (!keys.length) {
      return NextResponse.json({ success: false, message: 'No report fields provided' }, { status: 400 })
    }

    const created = await query(
      `
      insert into public.water_use_reports (${keys.join(', ')})
      values (${placeholders.join(', ')})
      returning *
      `,
      values
    )
    return NextResponse.json({ success: true, report: created.rows[0] || null })
  } catch (err) {
    console.error('❌ water-use-reports POST error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
