import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

type AppItem = {
  id: string
  application_number: string | null
  project_title: string | null
  status: string | null
  application_type: string | null
  created_at: string | null
  submitted_at: string | null
  is_renewal: boolean | null
  is_modification: boolean | null
}

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

    const permitRes = await query<{ application_id: string }>(
      `
      select p.application_id
      from public.permits p
      join public.applications a on a.id = p.application_id
      where p.id = $1 and a.applicant_id = $2
      limit 1
      `,
      [permitId, userId]
    )
    const originalApplicationId = permitRes.rows[0]?.application_id
    if (!originalApplicationId) {
      return NextResponse.json({ success: true, applications: [] })
    }

    const listRes = await query<AppItem>(
      `
      select
        id,
        application_number,
        project_title,
        status,
        application_type,
        created_at,
        submitted_at,
        is_renewal,
        is_modification
      from public.applications
      where
        id = $1
        or modified_from_application_id = $1
        or renewed_from_permit_id = $2
      order by created_at desc
      `,
      [originalApplicationId, permitId]
    )

    const transferRes = await query<AppItem>(
      `
      select
        id,
        application_number,
        project_title,
        status,
        application_type,
        created_at,
        submitted_at,
        is_renewal,
        is_modification
      from public.applications
      where
        (application_type = 'transfer' or (internal_notes is not null and internal_notes::text like '%"isTransfer":true%'))
        and internal_notes::text ilike $1
      order by created_at desc
      `,
      [`%"originalPermitId":"${permitId}"%`]
    )

    const all = [...listRes.rows, ...transferRes.rows]
    const dedup = Array.from(new Map(all.map((a) => [a.id, a])).values())

    const applications = dedup.map((a) => ({
      ...a,
      kind:
        a.id === originalApplicationId
          ? 'original'
          : a.application_type === 'transfer'
            ? 'transfer'
            : a.is_renewal
              ? 'renewal'
              : 'modification',
    }))

    return NextResponse.json({ success: true, applications })
  } catch (err) {
    console.error('❌ dashboard permit applications error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

