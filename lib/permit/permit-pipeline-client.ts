import { isPipelineBlockingStatus, parseNotesObject, toTrimmedString } from '@/lib/permit/application-pipeline-guard'

type Kind = 'renewal' | 'modification' | 'transfer' | 'application'

export type PermitConflictSummary = {
  applicationId: string
  applicationNumber: string | null
  status: string
  kind: Kind
}

export type PermitLike = {
  id: string
  application_id?: string | null
}

export type PipelineApplicationLike = {
  id: string
  status?: string | null
  created_at?: string | null
  application_type?: string | null
  is_renewal?: boolean | null
  is_modification?: boolean | null
  renewed_from_permit_id?: string | null
  modified_from_application_id?: string | null
  internal_notes?: unknown
  application_number?: string | null
}

function getKind(app: PipelineApplicationLike): Kind {
  if (app.application_type === 'transfer') return 'transfer'
  if (app.is_renewal) return 'renewal'
  if (app.is_modification) return 'modification'
  return 'application'
}

function transferMatchesPermit(app: PipelineApplicationLike, permitId: string): boolean {
  if (app.application_type !== 'transfer') return false
  const notes = parseNotesObject(app.internal_notes)
  const transferPermitId = toTrimmedString(notes.originalPermitId)
  return transferPermitId === permitId
}

export function buildPermitConflictIndex(
  permits: PermitLike[],
  applications: PipelineApplicationLike[]
): Record<string, PermitConflictSummary> {
  const byPermit: Record<string, PermitConflictSummary> = {}
  const sortedApps = [...applications].sort((a, b) => {
    const aTime = Date.parse(String(a.created_at || '')) || 0
    const bTime = Date.parse(String(b.created_at || '')) || 0
    return bTime - aTime
  })

  for (const permit of permits) {
    const originalApplicationId = permit.application_id || null
    const match = sortedApps.find((app) => {
      if (!isPipelineBlockingStatus(app.status || null)) return false
      if (app.renewed_from_permit_id === permit.id) return true
      if (originalApplicationId && app.modified_from_application_id === originalApplicationId) return true
      if (transferMatchesPermit(app, permit.id)) return true
      return false
    })
    if (!match) continue

    byPermit[permit.id] = {
      applicationId: match.id,
      applicationNumber: match.application_number || null,
      status: match.status || 'in progress',
      kind: getKind(match),
    }
  }

  return byPermit
}

export function formatPermitConflictMessage(conflict: PermitConflictSummary): string {
  const appRef = conflict.applicationNumber ? ` (${conflict.applicationNumber})` : ''
  return `Blocked by ongoing ${conflict.kind} application${appRef} in status "${conflict.status}".`
}
