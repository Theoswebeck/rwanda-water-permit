import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { applicationIds?: unknown }
    const applicationIds = Array.isArray(body.applicationIds)
      ? body.applicationIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : []

    if (applicationIds.length === 0) {
      return NextResponse.json({ success: true, rows: [] })
    }

    const rows = await query<{ application_id: string; to_status: string; created_at: string }>(
      `
      select application_id::text, to_status::text, created_at::text
      from public.workflow_history
      where application_id = any($1::uuid[])
        and to_status = any($2::text[])
      order by created_at asc
      `,
      [
        applicationIds,
        ['pending_assessment', 'pending_review', 'pending_verification', 'pending_final_approval', 'approved', 'approved_pending_permit', 'rejected'],
      ]
    )

    return NextResponse.json({ success: true, rows: rows.rows })
  } catch (error) {
    console.error('workflow/dates error:', error)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
