import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

type PermitRow = Record<string, unknown> & {
  id: string
  permit_number: string
  issued_date: string
  expiry_date: string
  status: string
  purpose: string
  permit_pdf_url?: string | null
  modification_count?: number | null
  is_modification?: boolean | null
  last_modified_at?: string | null
  application_id: string
  app_id?: string | null
  app_application_number?: string | null
  app_project_title?: string | null
  app_intended_activities?: string[] | null
  app_province?: string | null
  app_district?: string | null
  app_sector?: string | null
  app_cell?: string | null
  app_village?: string | null
  app_water_body_name?: string | null
  app_max_daily_volume_m3?: number | null
  app_max_yearly_volume_m3?: number | null
  app_concession_area?: number | null
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const includeApplication = req.nextUrl.searchParams.get('includeApplication') !== 'false'

    const result = await query<PermitRow>(
      `
      select
        p.*,
        a.id as app_id,
        a.application_number as app_application_number,
        a.project_title as app_project_title,
        a.intended_activities as app_intended_activities,
        a.province as app_province,
        a.district as app_district,
        a.sector as app_sector,
        a.cell as app_cell,
        a.village as app_village,
        a.water_body_name as app_water_body_name,
        a.max_daily_volume_m3 as app_max_daily_volume_m3,
        a.max_yearly_volume_m3 as app_max_yearly_volume_m3,
        a.concession_area as app_concession_area
      from public.permits p
      join public.applications a on a.id = p.application_id
      where a.applicant_id = $1
      order by p.issued_date desc
      `,
      [userId]
    )

    const permits = result.rows.map((row) => {
      if (!includeApplication) return row
      return {
        ...row,
        application: row.app_id
          ? {
              id: row.app_id,
              application_number: row.app_application_number || null,
              project_title: row.app_project_title || null,
              intended_activities: row.app_intended_activities || null,
              province: row.app_province || '',
              district: row.app_district || '',
              sector: row.app_sector || '',
              cell: row.app_cell || '',
              village: row.app_village || undefined,
              water_body_name: row.app_water_body_name || undefined,
              max_daily_volume_m3: row.app_max_daily_volume_m3 || undefined,
              max_yearly_volume_m3: row.app_max_yearly_volume_m3 || undefined,
              concession_area: row.app_concession_area || undefined,
            }
          : null,
      }
    })

    return NextResponse.json({ success: true, permits })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard permits GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

