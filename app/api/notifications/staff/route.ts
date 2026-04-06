import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { notifyStaffOnEvent } from '@/lib/notifications/staff-notify'

export async function POST(request: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(request)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { eventType, entityType, entityId } = body

    if (!eventType || !entityType || !entityId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: eventType, entityType, entityId' },
        { status: 400 },
      )
    }

    const result = await notifyStaffOnEvent(eventType, entityType, entityId)

    if (!result.ok) {
      console.error(`❌ [STAFF-NOTIFY-API] ${result.message}`)
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('❌ [STAFF-NOTIFY-API] Unhandled error:', err)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
