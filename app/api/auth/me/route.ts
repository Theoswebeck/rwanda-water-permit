import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken, clearSessionCookie } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'

type UserRow = Record<string, unknown> & {
  id: string
  email: string
  role: string
  status: string
  account_type: string
  password_hash?: string
}

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const claims = await verifySessionToken(token)
    if (!claims?.sub) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }

    const userRes = await query<UserRow>(`select * from public.users where id = $1 limit 1`, [claims.sub])
    const row = userRes.rows[0]

    if (!row) {
      const res = NextResponse.json({ success: false, message: 'Account not found' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }

    if (row.status === 'suspended' || row.status === 'inactive') {
      const res = NextResponse.json({ success: false, message: 'Account is not active' }, { status: 403 })
      clearSessionCookie(res)
      return res
    }

    const { password_hash, ...profile } = row
    const resolved = await resolveEffectiveRoles({
      userId: row.id,
      claimsRole: claims.role,
    })

    return NextResponse.json({
      success: true,
      user: {
        id: row.id,
        email: row.email,
        user_metadata: {
          role: row.role,
          status: row.status,
          account_type: row.account_type,
          base_role: resolved.baseRole,
          delegated_roles: resolved.delegatedRoles,
          effective_roles: resolved.effectiveRoles,
        },
      },
      profile: {
        ...profile,
        effective_roles: resolved.effectiveRoles,
        delegated_roles: resolved.delegatedRoles,
      },
    })
  } catch (err) {
    console.error('❌ me server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

const ALLOWED_PROFILE_FIELDS = new Set([
  'first_name',
  'last_name',
  'company_name',
  'company_tin',
  'phone',
  'company_phone',
  'company_address',
  'address',
])

export async function PATCH(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const claims = await verifySessionToken(token)
    if (!claims?.sub) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 })
    }

    const entries = Object.entries(body).filter(([key]) => ALLOWED_PROFILE_FIELDS.has(key))
    if (entries.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' }, { status: 400 })
    }

    const assignments: string[] = []
    const values: unknown[] = [claims.sub]
    let idx = 2
    for (const [key, value] of entries) {
      assignments.push(`${key} = $${idx}`)
      values.push(typeof value === 'string' ? value.trim() : value)
      idx += 1
    }
    assignments.push(`updated_at = now()`)

    await query(
      `
      update public.users
      set ${assignments.join(', ')}
      where id = $1
      `,
      values
    )

    return GET(req)
  } catch (err) {
    console.error('❌ me PATCH server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
