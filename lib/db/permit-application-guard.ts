import { query } from '@/lib/db/postgres'
import {
  getApplicationPipelineKind,
  getPermitIdFromPayload,
  isPipelineBlockingStatus,
  parseNotesObject,
  toTrimmedString,
} from '@/lib/permit/application-pipeline-guard'

type PipelineKind = 'renewal' | 'modification' | 'transfer'

type LinkedApplicationRow = {
  id: string
  status: string | null
  application_type: string | null
  is_renewal: boolean | null
  is_modification: boolean | null
  application_number: string | null
  created_at: string | null
}

type PermitOriginalApplicationRow = {
  id: string
  application_id: string | null
}

type CheckParams = {
  payload: Record<string, unknown>
  applicantId: string
  excludeApplicationId?: string | null
}

export type PermitPipelineConflict = {
  hasConflict: boolean
  permitId: string | null
  conflictApplication?: {
    id: string
    status: string
    kind: PipelineKind | 'application'
    applicationNumber: string | null
  }
  message?: string
}

function isUuid(input: string | null): input is string {
  if (!input) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)
}

function getPipelineKindFromRow(row: LinkedApplicationRow): PipelineKind | 'application' {
  if (row.application_type === 'transfer') return 'transfer'
  if (row.is_renewal) return 'renewal'
  if (row.is_modification) return 'modification'
  return 'application'
}

async function resolvePermitIdFromPayload(payload: Record<string, unknown>): Promise<string | null> {
  const directPermitId = getPermitIdFromPayload(payload)
  if (isUuid(directPermitId)) return directPermitId

  const notes = parseNotesObject(payload.internal_notes)
  const originalPermitNumber = toTrimmedString(notes.originalPermitNumber)
  if (originalPermitNumber) {
    const permitByNumber = await query<{ id: string }>(
      `
      select id
      from public.permits
      where permit_number = $1
      limit 1
      `,
      [originalPermitNumber]
    )
    if (permitByNumber.rows[0]?.id) return permitByNumber.rows[0].id
  }

  const modifiedFromApplicationId = toTrimmedString(payload.modified_from_application_id)
  if (isUuid(modifiedFromApplicationId)) {
    const permitByOriginalApplication = await query<{ id: string }>(
      `
      select id
      from public.permits
      where application_id = $1
      limit 1
      `,
      [modifiedFromApplicationId]
    )
    if (permitByOriginalApplication.rows[0]?.id) return permitByOriginalApplication.rows[0].id
  }

  return null
}

function buildConflictMessage(row: LinkedApplicationRow): string {
  const linkedKind = getPipelineKindFromRow(row)
  const linkedTypeLabel = linkedKind === 'application' ? 'application' : linkedKind
  const statusLabel = row.status || 'in progress'
  const appRef = row.application_number ? ` (${row.application_number})` : ''

  return `This permit already has an ongoing ${linkedTypeLabel} application${appRef} in status "${statusLabel}". Only one ongoing renewal/modification/transfer is allowed per permit. Please finish the existing application first, or wait until it reaches approved/rejected/cancelled/expired.`
}

export async function checkPermitPipelineConflict({
  payload,
  applicantId,
  excludeApplicationId = null,
}: CheckParams): Promise<PermitPipelineConflict> {
  const kind = getApplicationPipelineKind(payload)
  if (!kind) {
    return { hasConflict: false, permitId: null }
  }

  const permitId = await resolvePermitIdFromPayload(payload)
  if (!isUuid(permitId)) {
    // If permit is not linked in-system we cannot enforce permit-level exclusivity.
    return { hasConflict: false, permitId: null }
  }

  const permitRes = await query<PermitOriginalApplicationRow>(
    `
    select p.id, p.application_id
    from public.permits p
    join public.applications owner_app on owner_app.id = p.application_id
    where p.id = $1
      and owner_app.applicant_id = $2
    limit 1
    `,
    [permitId, applicantId]
  )
  const permitRow = permitRes.rows[0]
  if (!permitRow?.id) {
    return { hasConflict: false, permitId }
  }

  const linkedAppsRes = await query<LinkedApplicationRow>(
    `
    select
      a.id,
      a.status,
      a.application_type,
      a.is_renewal,
      a.is_modification,
      a.application_number,
      a.created_at
    from public.applications a
    where (
      a.renewed_from_permit_id = $1
      or ($2::uuid is not null and a.modified_from_application_id = $2::uuid)
      or (
        a.application_type = 'transfer'
        and a.internal_notes::text ilike $3
      )
    )
    and ($4::uuid is null or a.id <> $4::uuid)
    order by a.created_at desc
    `,
    [permitId, permitRow.application_id, `%"originalPermitId":"${permitId}"%`, excludeApplicationId]
  )

  const conflict = linkedAppsRes.rows.find((row) => isPipelineBlockingStatus(row.status))
  if (!conflict) {
    return { hasConflict: false, permitId }
  }

  return {
    hasConflict: true,
    permitId,
    conflictApplication: {
      id: conflict.id,
      status: conflict.status || 'in progress',
      kind: getPipelineKindFromRow(conflict),
      applicationNumber: conflict.application_number,
    },
    message: buildConflictMessage(conflict),
  }
}
