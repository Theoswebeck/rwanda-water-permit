import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

async function authUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await authUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: permitId } = await context.params
    const permitRes = await query<Record<string, unknown>>(
      `
      select p.*
      from public.permits p
      join public.applications a on a.id = p.application_id
      where p.id = $1 and a.applicant_id = $2
      limit 1
      `,
      [permitId, userId]
    )
    const permit = permitRes.rows[0]
    if (!permit) {
      return NextResponse.json({ success: false, message: 'Permit not found' }, { status: 404 })
    }

    const applicationId = String(permit.application_id || '')
    const appRes = await query<Record<string, unknown>>(
      `
      select a.*, row_to_json(u.*) as applicant
      from public.applications a
      left join public.users u on u.id = a.applicant_id
      where a.id = $1
      limit 1
      `,
      [applicationId]
    )

    return NextResponse.json({
      success: true,
      permit,
      application: appRes.rows[0] || null,
    })
  } catch (err) {
    console.error('❌ dashboard permit pdf metadata error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await authUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: permitId } = await context.params
    const body = (await req.json().catch(() => null)) as { permitPdfUrl?: string } | null
    const permitPdfUrl = String(body?.permitPdfUrl || '').trim()
    if (!permitPdfUrl) {
      return NextResponse.json({ success: false, message: 'permitPdfUrl is required' }, { status: 400 })
    }

    const updateRes = await query(
      `
      update public.permits p
      set permit_pdf_url = $3, updated_at = now()
      from public.applications a
      where p.id = $1 and p.application_id = a.id and a.applicant_id = $2
      `,
      [permitId, userId, permitPdfUrl]
    )

    if (!updateRes.rowCount) {
      return NextResponse.json({ success: false, message: 'Permit not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ dashboard permit pdf update error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

