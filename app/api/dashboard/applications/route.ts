import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildApplicationInsertParts } from '@/lib/db/application-payload'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

function parseCsvList(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

function toSafeApplicationPayload(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['id', 'applicant_id', 'created_at', 'updated_at'])
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue
    if (blocked.has(key)) continue
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

    const conditions: string[] = ['applicant_id = $1']
    const params: unknown[] = [userId]
    let idx = 2

    if (statuses.length > 0) {
      conditions.push(`status = any($${idx}::text[])`)
      params.push(statuses)
      idx += 1
    }
    if (types.length > 0) {
      conditions.push(`application_type = any($${idx}::text[])`)
      params.push(types)
      idx += 1
    }
    if (provinces.length > 0) {
      conditions.push(`province = any($${idx}::text[])`)
      params.push(provinces)
      idx += 1
    }

    const result = await query(
      `
      select *
      from public.applications
      where ${conditions.join(' and ')}
      order by created_at desc
      `,
      params
    )

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

    const payload = toSafeApplicationPayload(body)
    payload.applicant_id = userId
    payload.updated_at = new Date().toISOString()

    const { columns, placeholders, values } = buildApplicationInsertParts(payload)
    if (!columns.length) {
      return NextResponse.json({ success: false, message: 'No application data provided' }, { status: 400 })
    }

    const created = await query(
      `
      insert into public.applications (${columns.join(', ')})
      values (${placeholders.join(', ')})
      returning *
      `,
      values
    )

    return NextResponse.json({ success: true, application: created.rows[0] || null })
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

