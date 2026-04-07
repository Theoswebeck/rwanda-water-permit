import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

type AssessorOptionRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string | null
}

const ALLOWED_STAFF_ROLES = ['admin', 'reviewer', 'approver', 'verifier', 'inspector', 'assessor'] as const

// GET /api/staff/assessors/options - list active assessor options for assignment UIs
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
    if (!hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const assessorsRes = await query<AssessorOptionRow>(
      `
      select
        id::text as id,
        first_name::text as first_name,
        last_name::text as last_name,
        email::text as email,
        role::text as role
      from public.users
      where lower(btrim(coalesce(role::text, ''))) = 'assessor'
        and lower(btrim(coalesce(status::text, ''))) = 'active'
      order by first_name asc nulls last, last_name asc nulls last
      `
    )

    return NextResponse.json({ success: true, data: assessorsRes.rows || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }

    console.error('❌ staff/assessors/options error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
