import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    const userId = claims?.sub
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const resolvedRoles = await resolveEffectiveRoles({
      userId,
      claimsRole: claims?.role,
    })
    const userEmail = String(claims?.email ?? '').trim().toLowerCase()
    const isSuperuser = SUPERUSER_EMAILS.has(userEmail)
    if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, ['admin', 'approver', 'reviewer', 'verifier', 'inspector', 'assessor'])) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const appsRes = await query<{ id: string; status: string }>(
      `
      select id::text as id, status::text as status
      from public.applications
      where status <> 'draft'
        and status <> 'pending_payment'
      `
    )

    return NextResponse.json({ success: true, applications: appsRes.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ staff/applications/summary error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
