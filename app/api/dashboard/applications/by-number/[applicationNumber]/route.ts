import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ applicationNumber: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { applicationNumber } = await context.params
    const appRes = await query(
      `
      select *
      from public.applications
      where application_number = $1 and applicant_id = $2
      limit 1
      `,
      [applicationNumber, userId]
    )
    const application = appRes.rows[0]
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    const [applicantRes, docsRes, reviewsRes, inspectionsRes, permitsRes] = await Promise.all([
      query(`select * from public.users where id = $1 limit 1`, [String(application.applicant_id)]),
      query(`select * from public.documents where application_id = $1 order by created_at desc`, [application.id]),
      query(`select * from public.reviews where application_id = $1 order by created_at desc`, [application.id]),
      query(`select * from public.inspections where application_id = $1 order by created_at desc`, [application.id]),
      query(`select * from public.permits where application_id = $1 order by created_at desc`, [application.id]),
    ])

    return NextResponse.json({
      success: true,
      application: {
        ...application,
        applicant: applicantRes.rows[0] || null,
        documents: docsRes.rows,
        reviews: reviewsRes.rows,
        inspections: inspectionsRes.rows,
        permits: permitsRes.rows,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard applications by-number GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
