import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'

export const runtime = 'nodejs'

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

    const resolved = await resolveEffectiveRoles({
      userId: claims.sub,
      claimsRole: claims.role,
    })

    return NextResponse.json({
      success: true,
      baseRole: resolved.baseRole,
      delegatedRoles: resolved.delegatedRoles,
      effectiveRoles: resolved.effectiveRoles,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
