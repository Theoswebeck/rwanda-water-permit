import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  resetRateLimit,
  tooManyRequests,
} from '@/lib/security/rate-limit'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

type UserRow = {
  id: string
  email: string
  password_hash: string
  role: UserRole
  status: UserStatus
  account_type: AccountType
  must_change_password: boolean
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 })
    }

    // SECURITY: throttle credential guessing. Per-account catches password
    // guessing against one user; per-IP catches credential stuffing spread
    // across many accounts. Both are checked before the bcrypt comparison, so
    // a flood cannot burn CPU either.
    const ipKey = `login:ip:${getClientIp(req)}`
    const accountKey = `login:account:${email}`

    const ipCheck = checkRateLimit(ipKey, AUTH_RATE_LIMITS.loginPerIp)
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck, 'Too many sign-in attempts from this network. Please try again later.')
    }

    const accountCheck = checkRateLimit(accountKey, AUTH_RATE_LIMITS.loginPerAccount)
    if (!accountCheck.allowed) {
      return tooManyRequests(
        accountCheck,
        'Too many failed sign-in attempts for this account. Please wait before trying again, or reset your password.'
      )
    }

    const result = await query<UserRow>(
      `
      select id, email, password_hash, role, status, account_type, must_change_password
      from public.users
      where lower(email) = $1
      limit 1
      `,
      [email]
    )
    const user = result.rows[0]

    if (!user) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 })
    }

    const validPassword = await verifyPassword(password, user.password_hash)
    if (!validPassword) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 })
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { success: false, message: 'Your account has been suspended. Please contact support for assistance.' },
        { status: 403 }
      )
    }
    if (user.status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Your account is inactive. Please contact support to reactivate your account.' },
        { status: 403 }
      )
    }

    // Credentials verified: clear this account's failure counter so a user who
    // fumbled their password is not locked out afterwards. The per-IP counter
    // is intentionally left in place.
    resetRateLimit(accountKey)

    const resolved = await resolveEffectiveRoles({
      userId: user.id,
      claimsRole: user.role,
    })

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      accountType: user.account_type,
      effectiveRoles: resolved.effectiveRoles,
    })

    await query(`update public.users set last_login_at = now(), updated_at = now() where id = $1`, [user.id])

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          role: user.role,
          status: user.status,
          account_type: user.account_type,
          base_role: resolved.baseRole,
          delegated_roles: resolved.delegatedRoles,
          effective_roles: resolved.effectiveRoles,
        },
      },
      mustChangePassword: Boolean(user.must_change_password),
    })
    setSessionCookie(response, token)
    return response
  } catch (err) {
    console.error('❌ login server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
