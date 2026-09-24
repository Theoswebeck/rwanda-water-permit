import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import {
  clearPendingTwoFactorCookie,
  readPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
} from '@/lib/auth/session'
import { issueSessionResponse, type SessionUser } from '@/lib/auth/issue-session'
import { consumeTwoFactorCode } from '@/lib/auth/two-factor'
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  resetRateLimit,
  tooManyRequests,
} from '@/lib/security/rate-limit'

/**
 * POST /api/auth/login/verify-2fa — second step of RWB staff sign-in.
 * The pending-2FA cookie says whose password was accepted; the emailed code
 * says the person holds that mailbox. Only both together mint a session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = String(body?.code ?? '').trim()

    const pendingToken = readPendingTwoFactorToken(req)
    const pending = pendingToken ? await verifyPendingTwoFactorToken(pendingToken) : null
    if (!pending) {
      return NextResponse.json(
        { success: false, message: 'Your sign-in request expired. Please enter your password again.' },
        { status: 401 }
      )
    }

    if (!code) {
      return NextResponse.json({ success: false, message: 'Enter the code sent to your email.' }, { status: 400 })
    }

    // Guessing a six-digit code is cheap without a limit.
    const ipCheck = checkRateLimit(`login2fa:ip:${getClientIp(req)}`, AUTH_RATE_LIMITS.loginPerIp)
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck, 'Too many attempts from this network. Please try again later.')
    }
    const accountKey = `login2fa:account:${pending.email}`
    const accountCheck = checkRateLimit(accountKey, AUTH_RATE_LIMITS.loginPerAccount)
    if (!accountCheck.allowed) {
      return tooManyRequests(accountCheck, 'Too many incorrect codes. Please wait before trying again.')
    }

    const ok = await consumeTwoFactorCode(pending.email, code)
    // A correct code clears the counter: five *correct* sign-ins in a morning
    // (desktop, phone, a session timeout) must not lock a staff member out.
    if (ok) resetRateLimit(accountKey)
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 401 })
    }

    const { rows } = await query<SessionUser>(
      `select id, email, role, status, account_type, must_change_password
       from public.users
       where id = $1
       limit 1`,
      [pending.userId]
    )
    const user = rows[0]
    if (!user || user.status === 'suspended' || user.status === 'inactive') {
      return NextResponse.json({ success: false, message: 'Your account is not active.' }, { status: 403 })
    }

    const response = await issueSessionResponse(user)
    clearPendingTwoFactorCookie(response)
    return response
  } catch (err) {
    console.error('❌ verify-2fa server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
