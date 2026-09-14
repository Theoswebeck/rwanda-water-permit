export const NON_BLOCKING_PIPELINE_STATUSES = new Set([
  'approved',
  'rejected',
  'cancelled',
  'expired',
  // A file closed for incompleteness must not block the applicant from
  // starting again — the closure notice tells them to do exactly that.
  'closed_incomplete',
  'revision_required',
  'returned_to_assessment',
  'returned_to_review',
  'returned_to_verification',
])

export function isPipelineBlockingStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return !NON_BLOCKING_PIPELINE_STATUSES.has(status)
}

export function parseNotesObject(input: unknown): Record<string, unknown> {
  if (!input) return {}
  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

export function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function asBoolean(value: unknown): boolean {
  return value === true
}

export function getApplicationPipelineKind(input: {
  application_type?: unknown
  is_renewal?: unknown
  is_modification?: unknown
  internal_notes?: unknown
}): 'renewal' | 'modification' | 'transfer' | null {
  const notes = parseNotesObject(input.internal_notes)
  const isTransfer = input.application_type === 'transfer' || notes.isTransfer === true
  if (isTransfer) return 'transfer'
  const isRenewal = asBoolean(input.is_renewal) || notes.isRenewal === true
  if (isRenewal) return 'renewal'
  const isModification = asBoolean(input.is_modification) || notes.isModification === true
  if (isModification) return 'modification'
  return null
}

export function getPermitIdFromPayload(input: {
  renewed_from_permit_id?: unknown
  internal_notes?: unknown
}): string | null {
  const direct = toTrimmedString(input.renewed_from_permit_id)
  if (direct) return direct
  const notes = parseNotesObject(input.internal_notes)
  return toTrimmedString(notes.originalPermitId)
}
