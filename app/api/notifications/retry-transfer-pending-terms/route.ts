import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { notifyOnTransferPendingTerms, retryTransferPendingTermsNotifications } from '@/lib/notifications/transfer-pending-terms'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

function isCronAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET || '').trim()
  const authHeader = String(req.headers.get('authorization') || '').trim()
  if (expected && authHeader === `Bearer ${expected}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

async function isPrivilegedUser(req: NextRequest): Promise<boolean> {
  const token = readSessionTokenFromRequest(req)
  const claims = token ? await verifySessionToken(token) : null
  const userId = claims?.sub
  if (!userId) return false

  const actorEmail = String(claims?.email || '').trim().toLowerCase()
  if (SUPERUSER_EMAILS.has(actorEmail)) return true

  const resolvedRoles = await resolveEffectiveRoles({
    userId,
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

    const body = await req.json().catch(() => ({}))
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : ''
    const limitRaw = Number(body?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 25

    if (applicationId) {
      const single = await notifyOnTransferPendingTerms(applicationId)
      if (single.ok) {
        return NextResponse.json({ success: true, mode: 'single', result: single })
      }
      return NextResponse.json({ success: false, mode: 'single', result: single }, { status: 500 })
    }

    const batch = await retryTransferPendingTermsNotifications(limit)
    return NextResponse.json({ success: true, mode: 'batch', result: batch })
  } catch (err) {
    console.error('❌ retry-transfer-pending-terms error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
