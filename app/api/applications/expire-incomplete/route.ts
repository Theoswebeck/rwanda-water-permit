import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import {
  findApplicationsNearingExpiry,
  findExpiredIncompleteApplications,
  runApplicationExpirationSweep,
} from '@/lib/notifications/application-expiration-sweep'

/**
 * Six-month auto-close sweep (RWB point: applications incomplete for more
 * than six months must be closed, with a pre-deadline notice). Safe to call
 * repeatedly — every write is idempotent.
 *
 * `?dryRun=1` lists exactly what a real run would notify and close, and
 * writes nothing — RWB asked to see the affected applications before the
 * sweep is switched on.
 *
 * Auth: CRON_SECRET bearer or x-vercel-cron header, or an approver/admin
 * session (so ops can trigger it manually). Mirrors
 * /api/notifications/retry-transfer-pending-terms.
 */
function isCronAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET || '').trim()
  const authHeader = String(req.headers.get('authorization') || '').trim()
  if (expected && authHeader === `Bearer ${expected}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

async function isPrivilegedUser(req: NextRequest): Promise<boolean> {
  const token = readSessionTokenFromRequest(req)
  const claims = token ? await verifySessionToken(token) : null
  if (!claims?.sub) return false
  const resolvedRoles = await resolveEffectiveRoles({
    userId: claims.sub,
    claimsRole: claims?.role,
  })
  return hasAnyRole(resolvedRoles.effectiveRoles, ['approver', 'admin'])
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  try {
    const authorized = isCronAuthorized(req) || (await isPrivilegedUser(req))
    if (!authorized) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    const dryRun = ['1', 'true', 'yes'].includes(
      String(new URL(req.url).searchParams.get('dryRun') || '').toLowerCase()
    )
    if (dryRun) {
      const [wouldNotify, wouldClose] = await Promise.all([
        findApplicationsNearingExpiry(100),
        findExpiredIncompleteApplications(100),
      ])
      return NextResponse.json({
        success: true,
        dryRun: true,
        counts: { wouldNotify: wouldNotify.length, wouldClose: wouldClose.length },
        wouldNotify,
        wouldClose,
      })
    }

    const result = await runApplicationExpirationSweep(100)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('❌ expire-incomplete error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
