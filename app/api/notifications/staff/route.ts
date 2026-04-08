import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { notifyStaffOnEvent } from '@/lib/notifications/staff-notify'

const STAFF_ROLES = new Set(['admin', 'reviewer', 'assessor', 'verifier', 'approver', 'inspector'])

export async function POST(request: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(request)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const callerRole = (typeof claims.role === 'string' ? claims.role : '').toLowerCase()
    if (!STAFF_ROLES.has(callerRole)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { eventType, entityType, entityId } = body

    if (!eventType || !entityType || !entityId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: eventType, entityType, entityId' },
        { status: 400 },
      )
    }

    // Fire-and-forget: return 202 immediately, send email in background.
    // This prevents 504 Gateway Timeout from the reverse proxy when SMTP
    // connection is slow (common on the RWB on-prem server).
    notifyStaffOnEvent(eventType, entityType, entityId)
      .then((result) => {
        if (!result.ok) {
          console.error(`❌ [STAFF-NOTIFY-API] ${result.message}`)
        }
      })
      .catch((err) => {
        console.error('❌ [STAFF-NOTIFY-API] Background error:', err)
      })

    return NextResponse.json({ success: true, status: 'accepted' }, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('❌ [STAFF-NOTIFY-API] Unhandled error:', err)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
