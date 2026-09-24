import { NextRequest, NextResponse } from 'next/server'
import {
  createPendingTwoFactorToken,
  readPendingTwoFactorToken,
  setPendingTwoFactorCookie,
  verifyPendingTwoFactorToken,
} from '@/lib/auth/session'
import { sendTwoFactorCode } from '@/lib/auth/two-factor'
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  emailKey,
  getClientIp,
  tooManyRequests,
} from '@/lib/security/rate-limit'

/** POST /api/auth/login/resend-2fa — send the staff sign-in code again. */
export async function POST(req: NextRequest) {
  const pendingToken = readPendingTwoFactorToken(req)
  const pending = pendingToken ? await verifyPendingTwoFactorToken(pendingToken) : null
  if (!pending) {
    return NextResponse.json(
      { success: false, message: 'Your sign-in request expired. Please enter your password again.' },
      { status: 401 }
    )
  }

  const ipCheck = checkRateLimit(
    `login2fa:resend:ip:${getClientIp(req)}`,
    AUTH_RATE_LIMITS.passwordResetRequestPerIp
  )
  if (!ipCheck.allowed) {
    return tooManyRequests(ipCheck, 'Too many code requests from this network. Please try again later.')
  }
  const accountCheck = checkRateLimit(
    `login2fa:resend:account:${emailKey(pending.email)}`,
    AUTH_RATE_LIMITS.passwordResetRequestPerAccount
  )
  if (!accountCheck.allowed) {
    return tooManyRequests(accountCheck, 'A code was sent recently. Check your inbox and spam folder.')
  }

  try {
    const { devCode } = await sendTwoFactorCode(pending.email)
    // The new code lives ten minutes; so must the cookie that pairs with it,
    // or a resend near the deadline sends a code the user cannot spend.
    const response = NextResponse.json({ success: true, devCode })
    setPendingTwoFactorCookie(response, await createPendingTwoFactorToken(pending.userId, pending.email))
    return response
  } catch (err) {
    console.error('❌ 2FA resend failed:', err)
    return NextResponse.json({ success: false, message: 'Could not send the code. Please try again.' }, { status: 500 })
  }
}
