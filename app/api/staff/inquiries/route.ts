import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import { ensureInquiriesSchema, type InquiryRecord } from '@/lib/inquiries/schema'

export const runtime = 'nodejs'

const ALLOWED_STAFF_ROLES = new Set([
  'admin',
  'reviewer',
  'assessor',
  'inspector',
  'approver',
  'verifier',
])

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const claims = await verifySessionToken(token)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
    }

    const resolved = await resolveEffectiveRoles({ userId: String(claims.sub), claimsRole: claims.role })
    const effectiveRoles = resolved.effectiveRoles.map((r) => String(r).toLowerCase())
    const primaryRole = String(resolved.baseRole || claims.role || '').toLowerCase()
    const hasStaffAccess = effectiveRoles.some((r) => ALLOWED_STAFF_ROLES.has(r)) || ALLOWED_STAFF_ROLES.has(primaryRole)
    if (!hasStaffAccess) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    await ensureInquiriesSchema()

    const { searchParams } = new URL(req.url)
    const statusFilter = (searchParams.get('status') || 'all').trim().toLowerCase()
    const scope = (searchParams.get('scope') || 'default').trim().toLowerCase()
    const q = (searchParams.get('q') || '').trim()

    const isTriageRole =
      effectiveRoles.includes('admin') ||
      effectiveRoles.includes('reviewer') ||
      effectiveRoles.includes('approver') ||
      primaryRole === 'admin' ||
      primaryRole === 'reviewer' ||
      primaryRole === 'approver'

    const conditions: string[] = []
    const params: unknown[] = []

    // Assessors and Inspectors see inquiries assigned to them (or their role) by default,
    // unless they explicitly switch to scope=all.
    if (!isTriageRole && scope !== 'all') {
      params.push(String(claims.sub))
      const userIdx = params.length
      const roleList = Array.from(new Set([primaryRole, ...effectiveRoles].filter((r) => r === 'assessor' || r === 'inspector')))
      if (roleList.length > 0) {
        params.push(roleList)
        conditions.push(`(i.assigned_to_user_id = $${userIdx} OR (i.assigned_to_user_id IS NULL AND i.assigned_role = ANY($${params.length}::text[])))`)
      } else {
        conditions.push(`i.assigned_to_user_id = $${userIdx}`)
      }
    } else if (scope === 'mine') {
      params.push(String(claims.sub))
      conditions.push(`i.assigned_to_user_id = $${params.length}`)
    } else if (scope === 'unassigned') {
      conditions.push(`i.assigned_to_user_id IS NULL`)
    }

    if (statusFilter !== 'all') {
      params.push(statusFilter)
      conditions.push(`i.status = $${params.length}`)
    }

    if (q) {
      params.push(`%${q}%`)
      const qIdx = params.length
      conditions.push(
        `(i.inquiry_number ILIKE $${qIdx} OR i.sender_name ILIKE $${qIdx} OR i.sender_email ILIKE $${qIdx} OR i.subject ILIKE $${qIdx})`
      )
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const inquiriesRes = await query<InquiryRecord>(
      `
      SELECT
        i.*,
        u.email AS assigned_to_email,
        NULLIF(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS assigned_to_name,
        (SELECT count(*)::int FROM public.inquiry_messages m WHERE m.inquiry_id = i.id) AS message_count,
        (
          SELECT m.message
          FROM public.inquiry_messages m
          WHERE m.inquiry_id = i.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message
      FROM public.inquiries i
      LEFT JOIN public.users u ON u.id = i.assigned_to_user_id
      ${whereClause}
      ORDER BY
        CASE WHEN i.status = 'open' THEN 0 WHEN i.status IN ('assigned', 'in_progress') THEN 1 ELSE 2 END,
        i.updated_at DESC
      LIMIT 200
      `,
      params
    )

    // Load active Assessors, Inspectors, and Reviewers for assignment dropdowns
    const staffRes = await query<{
      id: string
      first_name: string | null
      last_name: string | null
      email: string
      role: string
    }>(
      `
      SELECT id, first_name, last_name, email, role::text AS role
      FROM public.users
      WHERE lower(role::text) IN ('assessor', 'inspector', 'reviewer')
        AND coalesce(status::text, 'active') = 'active'
      ORDER BY role::text ASC, first_name ASC NULLS LAST, email ASC
      `
    )

    return NextResponse.json({
      success: true,
      inquiries: inquiriesRes.rows,
      staffOptions: staffRes.rows,
      viewerRole: primaryRole,
      canAssign: isTriageRole,
    })
  } catch (error) {
    console.error('❌ GET /api/staff/inquiries error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to load inquiries.' },
      { status: 500 }
    )
  }
}

