import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

function getStartDate(range: string): Date | null {
  const now = new Date()
  switch (range) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    case 'all':
    default:
      return null
  }
}

const APPROVED_STATUSES = ['approved', 'approved_pending_permit']
const PENDING_STATUSES = [
  'submitted',
  'under_review',
  'pending_inspection',
  'pending_final_approval',
  'pending_assessment',
  'pending_review',
  'pending_verification',
]

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRes = await query<{ role: string }>(
      `SELECT role FROM public.users WHERE id = $1`,
      [claims.sub]
    )
    const role = userRes.rows[0]?.role
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const range = req.nextUrl.searchParams.get('range') || '30d'
    const startDate = getStartDate(range)

    const dateFilter = startDate ? `WHERE a.created_at >= $1` : ''
    const dateParams: unknown[] = startDate ? [startDate.toISOString()] : []

    const appStatsRes = await query<{
      total: number
      approved: number
      rejected: number
      pending: number
    }>(
      `SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE a.status = ANY($${dateParams.length + 1}))::int AS approved,
        count(*) FILTER (WHERE a.status = 'rejected')::int AS rejected,
        count(*) FILTER (WHERE a.status = ANY($${dateParams.length + 2}))::int AS pending
      FROM public.applications a
      ${dateFilter}`,
      [...dateParams, APPROVED_STATUSES, PENDING_STATUSES]
    )

    const stats = appStatsRes.rows[0] ?? { total: 0, approved: 0, rejected: 0, pending: 0 }

    const paymentDateFilter = startDate ? `AND p.completed_at >= $1` : ''
    const paymentParams: unknown[] = startDate ? [startDate.toISOString()] : []

    const paymentRes = await query<{ total_value: string }>(
      `SELECT coalesce(sum(p.amount), 0)::numeric AS total_value
       FROM public.payments p
       WHERE p.status = 'completed' ${paymentDateFilter}`,
      paymentParams
    )

    const totalValue = parseFloat(paymentRes.rows[0]?.total_value ?? '0')

    return NextResponse.json({
      overview: {
        totalApplications: stats.total,
        approvedApplications: stats.approved,
        rejectedApplications: stats.rejected,
        pendingApplications: stats.pending,
        totalValue,
      },
    })
  } catch (error) {
    console.error('Admin reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
