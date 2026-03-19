import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { buildWaterUseReportUpdateParts } from '@/lib/db/water-use-report-payload'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { isEffectiveStaffUser, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

const VALID_WORKFLOW_STATUSES = new Set([
  'draft', 'submitted', 'pending_review', 'pending_verification',
  'pending_approval', 'approved', 'rejected',
  'returned_to_assessment', 'returned_to_review', 'returned_to_verification',
])

const WORKFLOW_ONLY_FIELDS = new Set([
  'workflow_status', 'assessment_notes', 'assessment_completed_at',
  'review_notes', 'reviewed_by', 'reviewed_at',
  'verification_notes', 'verified_by', 'verified_at',
  'approval_notes', 'approved_by', 'approved_at',
  'rejection_reason', 'internal_notes',
  'assigned_assessor_id', 'assigned_reviewer_id', 'assigned_verifier_id', 'assigned_approver_id',
])

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

function pickPayload(input: Record<string, unknown>, isStaff: boolean): Record<string, unknown> {
  const blocked = new Set(['id', 'applicant_id', 'created_at'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) continue
    if (blocked.has(k)) continue
    if (!isStaff && WORKFLOW_ONLY_FIELDS.has(k)) continue
    out[k] = v
  }
  return out
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const { id } = await context.params
    const resolvedRoles = await resolveEffectiveRoles({
      userId: claims.sub,
      claimsRole: claims.role,
    })
    const isStaff = isEffectiveStaffUser(resolvedRoles.effectiveRoles)

    const where = isStaff ? `wur.id = $1` : `wur.id = $1 and wur.applicant_id = $2`
    const params = isStaff ? [id] : [id, claims.sub]

    const res = await query(
      `
      select
        wur.*,
        row_to_json(p.*) as permit,
        row_to_json(a.*) as application,
        row_to_json(u.*) as applicant
      from public.water_use_reports wur
      left join public.permits p on p.id = wur.permit_id
      left join public.applications a on a.id = wur.application_id
      left join public.users u on u.id = wur.applicant_id
      where ${where}
      limit 1
      `,
      params
    )
    const report = res.rows[0]
    if (!report) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ water-use-reports GET[id] error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }
    const { id } = await context.params
    const resolvedRoles = await resolveEffectiveRoles({
      userId: claims.sub,
      claimsRole: claims.role,
    })
    const isStaff = isEffectiveStaffUser(resolvedRoles.effectiveRoles)
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 })
    }

    const payload = pickPayload(body, isStaff)
    payload.updated_at = new Date().toISOString()

    if (payload.workflow_status && !VALID_WORKFLOW_STATUSES.has(payload.workflow_status as string)) {
      return NextResponse.json({ success: false, message: 'Invalid workflow status' }, { status: 400 })
    }
    if (payload.status && !VALID_WORKFLOW_STATUSES.has(payload.status as string)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 })
    }

    const keys = Object.keys(payload)
    if (!keys.length) {
      return NextResponse.json({ success: false, message: 'No update fields provided' }, { status: 400 })
    }

    const { sets, values } = buildWaterUseReportUpdateParts(payload)

    const where = isStaff
      ? `id = $${keys.length + 1}`
      : `id = $${keys.length + 1} and applicant_id = $${keys.length + 2}`
    const params = isStaff
      ? [...values, id]
      : [...values, id, claims.sub]

    const updated = await query(
      `
      update public.water_use_reports
      set ${sets.join(', ')}
      where ${where}
      returning *
      `,
      params
    )

    if (!updated.rowCount) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, report: updated.rows[0] || null })
  } catch (err) {
    console.error('❌ water-use-reports PATCH error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
