// =============================================
// Payment API - Get Payment by Application ID
// Endpoint: GET /api/payments?application_id=xxx
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

/**
 * GET /api/payments?application_id=xxx
 * Fetch existing payment for an application
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const applicationId = searchParams.get('application_id')
    const waterUseReportId = searchParams.get('water_use_report_id')

    if (!applicationId && !waterUseReportId) {
      return NextResponse.json(
        { error: 'application_id or water_use_report_id is required' },
        { status: 400 }
      )
    }

    const paymentRes = waterUseReportId
      ? await query(
          `
          select *
          from public.payments
          where water_use_report_id = $1
          order by created_at desc nulls last
          limit 1
          `,
          [waterUseReportId]
        )
      : await query(
          `
          select *
          from public.payments
          where application_id = $1
          order by created_at desc nulls last
          limit 1
          `,
          [applicationId]
        )

    return NextResponse.json({ success: true, payment: paymentRes.rows[0] ?? null }, { status: 200 })
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/payments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/payments (if needed for manual payment creation)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { application_id, amount, currency } = body

    if (!application_id || !amount) {
      return NextResponse.json(
        { error: 'application_id and amount are required' },
        { status: 400 }
      )
    }

    const token = readSessionTokenFromRequest(request)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payment = await query(
      `
      insert into public.payments (
        application_id,
        applicant_id,
        amount,
        currency,
        status,
        purpose,
        created_by,
        created_at,
        updated_at
      ) values ($1, $2, $3, $4, 'pending', 'application_fee', $2, now(), now())
      returning *
      `,
      [application_id, claims.sub, amount, currency || 'RWF']
    )

    return NextResponse.json({ payment: payment.rows[0] ?? null }, { status: 201 })
  } catch (error) {
    console.error('❌ Unexpected error in POST /api/payments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

