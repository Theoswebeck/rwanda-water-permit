import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { notifyOnApplicationReturnedForRevision } from '@/lib/notifications/revision'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const STAFF_ROLES = new Set(['admin', 'assessor', 'reviewer', 'verifier', 'approver', 'inspector'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const applicationId = body?.applicationId as string

    if (!isNonEmptyString(applicationId)) {
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId is required' }, { status: 400 })
    }

    // Require an authenticated staff session — only staff return applications
    // for revision, and applicants must not be able to trigger arbitrary sends.
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const userRes = await query<{ role: string | null }>(
      `select role::text as role from public.users where id = $1 limit 1`,
      [claims.sub]
    )
    const role = String(userRes.rows[0]?.role || '').toLowerCase()
    if (!STAFF_ROLES.has(role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const result = await notifyOnApplicationReturnedForRevision(applicationId)
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    console.error('❌ send-revision error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
