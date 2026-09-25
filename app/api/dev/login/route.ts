import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import { DEV_ALL_ROLES, isDevAuthBypass } from '@/lib/auth/dev-bypass'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

// Local-only auto sign-in used by the dev login bypass (lib/auth/dev-bypass.ts).
// Returns 404 anywhere the bypass is not enabled.
export async function GET(req: NextRequest) {
  if (!isDevAuthBypass(req.headers.get('host'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const email = process.env.DEV_AUTH_EMAIL?.trim().toLowerCase()
  let user: { id: string; email: string; role: UserRole; account_type: AccountType } | undefined
  try {
    const res = await query<{ id: string; email: string; role: UserRole; account_type: AccountType }>(
      email
        ? `select id, email, role, account_type from public.users where lower(email) = $1 limit 1`
        : `select id, email, role, account_type from public.users
           where role = 'admin' and coalesce(status::text, 'active') = 'active'
           order by created_at limit 1`,
      email ? [email] : []
    )
    user = res.rows[0]
  } catch (err) {
    return NextResponse.json(
      { error: 'Database unreachable — is the VPN on and the DB tunnel running? (see DATABASE_URL in .env.local)', detail: String(err) },
      { status: 503 }
    )
  }
  if (!user) {
    return NextResponse.json(
      { error: email ? `DEV_AUTH_EMAIL ${email} not found in users` : 'No active admin user found' },
      { status: 500 }
    )
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    status: 'active' as UserStatus,
    accountType: user.account_type,
    effectiveRoles: DEV_ALL_ROLES,
  })

  // Only follow same-site relative paths.
  const next = req.nextUrl.searchParams.get('next') || '/'
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const response = NextResponse.redirect(new URL(target, req.url))
  setSessionCookie(response, token)
  return response
}
