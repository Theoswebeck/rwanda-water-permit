import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

type JsonRecord = Record<string, unknown>

type ModificationRow = {
  id: string
  applicant_id: string
  is_modification: boolean | null
  modified_from_application_id: string | null
  application_type: string | null
  internal_notes: string | null
  water_source: string | null
  water_purpose: string | null
  usage_unit: string | null
  province: string | null
  district: string | null
  sector: string | null
  cell: string | null
  village: string | null
  location_description: string | null
  water_body_name: string | null
  water_taking_method: string | null
  intended_activities: unknown
  max_yearly_volume_m3: number | string | null
  estimated_usage_volume: number | string | null
  concession_area: number | string | null
  assessor_recommended_volume_m3: number | string | null
  proposed_duration_years: number | null
  approval_conditions: string | null
}

type ApplicationRefRow = {
  id: string
  applicant_id: string
  internal_notes: string | null
}

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

function parseJsonObject(input: unknown): JsonRecord | null {
  if (typeof input !== 'string' || !input.trim()) return null
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonRecord
    }
    return null
  } catch {
    return null
  }
}

function pickPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

function pickDurationYears(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 15) {
      return Math.round(value)
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 15) {
        return Math.round(parsed)
      }
    }
  }
  return null
}

function pickCoordinate(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null
  return Number(parsed.toFixed(8))
}

function normalizePolygonPoints(value: unknown): Array<{ latitude: number; longitude: number }> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const points: Array<{ latitude: number; longitude: number }> = []
  for (const point of value) {
    if (!point || typeof point !== 'object') return null
    const raw = point as JsonRecord
    const latitude = pickCoordinate(raw.latitude, -90, 90)
    const longitude = pickCoordinate(raw.longitude, -180, 180)
    if (latitude == null || longitude == null) return null
    points.push({ latitude, longitude })
  }
  return points
}

function normalizeActivities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      return []
    }
  }
  return []
}

function isConcessionApplication(activitiesRaw: unknown, notes: JsonRecord | null): boolean {
  const direct = normalizeActivities(activitiesRaw)
  const notesActivities = normalizeActivities(notes?.intendedActivities)
  const activities = direct.length ? direct : notesActivities
  return activities.includes('fish_farming_lakes') || activities.includes('recreation_activities') || activities.includes('port_construction')
}

function resolveOriginalApplicationId(mod: ModificationRow, notes: JsonRecord | null): string | null {
  if (mod.modified_from_application_id && mod.modified_from_application_id.trim()) {
    return mod.modified_from_application_id.trim()
  }
  const fromNotes = notes?.originalApplicationId
  if (typeof fromNotes === 'string' && fromNotes.trim()) return fromNotes.trim()
  return null
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID()
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    const actorUserId = claims?.sub
    if (!actorUserId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { modificationApplicationId?: unknown }
    const modificationApplicationId = typeof body.modificationApplicationId === 'string' ? body.modificationApplicationId.trim() : ''
    if (!modificationApplicationId) {
      return NextResponse.json({ success: false, message: 'modificationApplicationId is required' }, { status: 400 })
    }

    const modRes = await query<ModificationRow>(
      `
      select
        id,
        applicant_id,
        is_modification,
        modified_from_application_id,
        application_type::text as application_type,
        internal_notes::text as internal_notes,
        water_source::text as water_source,
        water_purpose::text as water_purpose,
        usage_unit,
        province::text as province,
        district,
        sector,
        cell,
        village,
        location_description,
        water_body_name,
        water_taking_method,
        intended_activities,
        max_yearly_volume_m3,
        estimated_usage_volume,
        concession_area,
        assessor_recommended_volume_m3,
        proposed_duration_years,
        approval_conditions
      from public.applications
      where id = $1
      limit 1
      `,
      [modificationApplicationId]
    )
    const modificationApplication = modRes.rows[0]
    if (!modificationApplication) {
      return NextResponse.json({ success: false, message: 'Modification application not found' }, { status: 404 })
    }
    if (modificationApplication.is_modification !== true) {
      return NextResponse.json({ success: false, message: 'Application is not a modification request' }, { status: 400 })
    }

    const actorEmail = String(claims?.email || '').trim().toLowerCase()
    const resolvedRoles = await resolveEffectiveRoles({
      userId: actorUserId,
      claimsRole: claims?.role,
    })
    const isStaffActor = hasAnyRole(resolvedRoles.effectiveRoles, ['admin', 'approver']) || SUPERUSER_EMAILS.has(actorEmail)
    if (!isStaffActor && actorUserId !== modificationApplication.applicant_id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const modNotes = parseJsonObject(modificationApplication.internal_notes)
    const originalApplicationId = resolveOriginalApplicationId(modificationApplication, modNotes)
    if (!originalApplicationId) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No linked underlying application to update',
      })
    }

    const originalRes = await query<ApplicationRefRow>(
      `
      select id, applicant_id, internal_notes::text as internal_notes
      from public.applications
      where id = $1
      limit 1
      `,
      [originalApplicationId]
    )
    const originalApplication = originalRes.rows[0]
    if (!originalApplication) {
      return NextResponse.json({ success: false, message: 'Underlying application not found' }, { status: 404 })
    }

    if (!isStaffActor && originalApplication.applicant_id !== actorUserId) {
      return NextResponse.json({ success: false, message: 'Forbidden for underlying application' }, { status: 403 })
    }

    const assessorAdjustments =
      modNotes && typeof modNotes._assessorAdjustments === 'object' && modNotes._assessorAdjustments !== null
        ? (modNotes._assessorAdjustments as JsonRecord)
        : null

    const resolvedDurationYears = pickDurationYears(
      assessorAdjustments?.permitLengthYears,
      modificationApplication.proposed_duration_years,
      modNotes?.permitLengthYears
    )
    const resolvedVolume = pickPositiveNumber(
      assessorAdjustments?.recommendedVolumeM3,
      modificationApplication.assessor_recommended_volume_m3,
      modificationApplication.max_yearly_volume_m3,
      modificationApplication.estimated_usage_volume,
      modificationApplication.concession_area
    )
    const adjustedLatitude = pickCoordinate(assessorAdjustments?.waterSourceLatitude, -90, 90)
    const adjustedLongitude = pickCoordinate(assessorAdjustments?.waterSourceLongitude, -180, 180)
    const adjustedPolygonPoints = normalizePolygonPoints(assessorAdjustments?.waterSourcePolygonPoints)
    const isConcession = isConcessionApplication(modificationApplication.intended_activities, modNotes)

    const originalNotes = parseJsonObject(originalApplication.internal_notes) || {}
    const mergedNotes: JsonRecord = { ...originalNotes }
    if (modNotes) {
      const propagatedKeys = [
        'permitLengthYears',
        'waterAbstractionDetails',
        'abstractionMethod',
        'waterSourceLatitude',
        'waterSourceLongitude',
        'waterSourceProvince',
        'waterSourceDistrict',
        'waterSourceSector',
        'waterSourceCell',
        'waterSourceVillage',
        'intendedActivities',
        'concessionArea',
        'fishLakeAreaHectares',
        'fishPondsDiscardWaterQuantityM3PerDay',
      ] as const
      for (const key of propagatedKeys) {
        if (modNotes[key] !== undefined) {
          mergedNotes[key] = modNotes[key]
        }
      }
    }

    if (resolvedDurationYears != null) {
      mergedNotes.permitLengthYears = resolvedDurationYears
    }
    mergedNotes._assessorAdjustments = {
      ...(typeof mergedNotes._assessorAdjustments === 'object' && mergedNotes._assessorAdjustments !== null
        ? (mergedNotes._assessorAdjustments as JsonRecord)
        : {}),
      ...(resolvedDurationYears != null ? { permitLengthYears: resolvedDurationYears } : {}),
      ...(resolvedVolume != null ? { recommendedVolumeM3: resolvedVolume } : {}),
      ...(adjustedLatitude != null && adjustedLongitude != null
        ? { waterSourceLatitude: adjustedLatitude, waterSourceLongitude: adjustedLongitude }
        : {}),
      ...(adjustedPolygonPoints != null ? { waterSourcePolygonPoints: adjustedPolygonPoints } : {}),
    }

    const mergedNotesText = JSON.stringify(mergedNotes)

    await query(
      `
      update public.applications
      set
        water_source = coalesce($2::public.water_source_type, water_source),
        water_purpose = coalesce($3::public.water_purpose, water_purpose),
        usage_unit = coalesce(nullif($4, ''), usage_unit),
        province = coalesce($5::public.province_type, province),
        district = coalesce(nullif($6, ''), district),
        sector = coalesce(nullif($7, ''), sector),
        cell = coalesce(nullif($8, ''), cell),
        village = coalesce(nullif($9, ''), village),
        location_description = coalesce(nullif($10, ''), location_description),
        water_body_name = coalesce(nullif($11, ''), water_body_name),
        water_taking_method = coalesce(nullif($12, ''), water_taking_method),
        intended_activities = coalesce($13::jsonb, intended_activities),
        proposed_duration_years = coalesce($14::integer, proposed_duration_years),
        assessor_recommended_volume_m3 = coalesce($15::numeric, assessor_recommended_volume_m3),
        max_yearly_volume_m3 = case
          when $16::boolean then max_yearly_volume_m3
          else coalesce($15::numeric, max_yearly_volume_m3)
        end,
        estimated_usage_volume = case
          when $16::boolean then estimated_usage_volume
          else coalesce($15::numeric, estimated_usage_volume)
        end,
        concession_area = case
          when $16::boolean then coalesce($15::numeric, concession_area)
          else concession_area
        end,
        approval_conditions = case
          when coalesce($17, '') <> '' then $17
          else approval_conditions
        end,
        internal_notes = $18,
        updated_at = now()
      where id = $1
      `,
      [
        originalApplicationId,
        modificationApplication.water_source,
        modificationApplication.water_purpose,
        modificationApplication.usage_unit,
        modificationApplication.province,
        modificationApplication.district,
        modificationApplication.sector,
        modificationApplication.cell,
        modificationApplication.village,
        modificationApplication.location_description,
        modificationApplication.water_body_name,
        modificationApplication.water_taking_method,
        modificationApplication.intended_activities ? JSON.stringify(modificationApplication.intended_activities) : null,
        resolvedDurationYears,
        resolvedVolume,
        isConcession,
        modificationApplication.approval_conditions,
        mergedNotesText,
      ]
    )

    console.log('✅ [modifications/propagate-approved-values] propagated approved values', {
      traceId,
      modificationApplicationId,
      originalApplicationId,
      resolvedDurationYears,
      resolvedVolume,
      isConcession,
    })

    return NextResponse.json({
      success: true,
      originalApplicationId,
      resolvedDurationYears,
      resolvedVolume,
      isConcession,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    console.error('❌ [modifications/propagate-approved-values] failed', { traceId, error: message })
    return NextResponse.json({ success: false, message: 'Failed to propagate approved modification values' }, { status: 500 })
  }
}
