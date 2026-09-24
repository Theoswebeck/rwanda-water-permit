import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { verifyPassword } from '@/lib/auth/password'
import { createPendingTwoFactorToken, setPendingTwoFactorCookie } from '@/lib/auth/session'
import { issueSessionResponse } from '@/lib/auth/issue-session'
import { requiresTwoFactor, sendTwoFactorCode } from '@/lib/auth/two-factor'
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

    // RWB staff need a second factor; applicants sign in on the password alone.
    if (requiresTwoFactor(user.role)) {
      try {
        const { devCode } = await sendTwoFactorCode(user.email)
        const pending = await createPendingTwoFactorToken(user.id, user.email)
        const response = NextResponse.json({
          success: true,
          twoFactorRequired: true,
          email: user.email,
          devCode,
        })
        setPendingTwoFactorCookie(response, pending)
        return response
      } catch (mailErr) {
        // No session is issued if the code could not be delivered — signing the
        // user in anyway would silently disable the second factor.
        console.error('❌ 2FA code delivery failed:', mailErr)
        return NextResponse.json(
          { success: false, message: 'Could not send your sign-in code. Please try again or contact the administrator.' },
          { status: 500 }
        )
      }
    }

    return await issueSessionResponse(user)
  } catch (err) {
    console.error('❌ login server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
