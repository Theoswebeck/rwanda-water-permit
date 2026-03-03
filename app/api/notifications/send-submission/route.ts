import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const applicationId = body?.applicationId as string

    if (!isNonEmptyString(applicationId)) {
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId is required' }, { status: 400 })
    }

    // Require auth to prevent abuse/spam
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    // Only the applicant can trigger their own submission notification from the client.
    const appRes = await query<{ id: string; applicant_id: string }>(
      `
      select id, applicant_id
      from public.applications
      where id = $1
      limit 1
      `,
      [applicationId]
    )
    const appRow = appRes.rows[0]
    if (!appRow) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    if (appRow.applicant_id !== claims.sub) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const result = await notifyOnApplicationSubmitted(applicationId)
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    console.error('❌ send-submission error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}




