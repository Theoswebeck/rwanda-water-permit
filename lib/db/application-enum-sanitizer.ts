type Payload = Record<string, unknown>

const APPLICATION_STATUS = new Set([
  'draft',
  'pending_payment',
  'submitted',
  'under_review',
  'pending_assessment',
  'pending_review',
  'pending_verification',
  'pending_final_approval',
  'approved',
  'approved_pending_permit',
  'expired',
  'rejected',
  'revision_required',
  'cancelled',
  'returned_to_assessment',
  'returned_to_review',
  'returned_to_verification',
  // Added by database/add-terminated-status.sql. Kept in the allow-set so the
  // value persists losslessly once that migration has run; if the migration has
  // NOT run yet the write path retries with LEGACY_ENUM_FALLBACKS (see below),
  // so the code is safe in both deploy orders.
  'terminated',
  // Added by database/add-closed-incomplete-status.sql. Same deploy-order
  // tolerance as 'terminated' above.
  'closed_incomplete',
])

const APPLICATION_TYPE = new Set([
  'new',
  'renewal',
  'transfer',
  'modification',
  'domestic',
  'industrial',
  'agricultural',
  'commercial',
  'municipal',
  'mining_water_use',
])

const WATER_SOURCE = new Set([
  'borehole',
  'surface_water',
  'river',
  'groundwater',
  'lake',
  'spring',
  'other',
])

const WATER_PURPOSE = new Set([
  'domestic',
  'irrigation',
  'industrial',
  'livestock',
  'fish_farming_lakes',
  'fish_farming_ponds',
  'recreation',
  'recreation_activities',
  'electricity_generation',
  'mining',
  'municipal_supply',
  'water_supply',
  'coffee_washing',
  'gaz_extraction',
  'construction_of_dam',
  'construction_of_infrastructures',
  'navigation',
  'other',
  // Added by database/migrations/add-other-concession-purpose-enum.sql. Kept in
  // the allow-set so the value persists losslessly once that migration has run;
  // if the migration has NOT run yet the write path retries with
  // LEGACY_ENUM_FALLBACKS (see below), so the code is safe in both deploy orders.
  'other_concession',
])

const WATER_RELIABILITY = new Set(['always_available', 'frequently_dry', 'seasonal_dry'])

const LAND_OWNERSHIP_STATUS = new Set([
  'own_all_land',
  'recorded_easement',
  'written_consent',
  'lease_agreement',
  'access_pending',
])

const SLA_STATUS = new Set(['on_time', 'due_soon', 'overdue'])

function asLowerString(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function mapApplicationType(value: unknown): string {
  const key = asLowerString(value)
  const aliases: Record<string, string> = {
    irrigation: 'agricultural',
    water_supply: 'domestic',
    aquaculture: 'agricultural',
    fish_farming_lakes: 'agricultural',
    fish_farming_ponds: 'agricultural',
    coffee_washing: 'industrial',
    industry: 'industrial',
    electricity: 'industrial',
    electricity_generation: 'industrial',
    mining: 'mining_water_use',
    construction: 'industrial',
    construction_of_dam: 'industrial',
    construction_of_infrastructures: 'industrial',
    navigation: 'commercial',
    recreation: 'commercial',
    recreation_activities: 'commercial',
    livestock: 'agricultural',
    gaz_extraction: 'commercial',
    other_concession: 'commercial',
  }
  const normalized = aliases[key] || key
  return APPLICATION_TYPE.has(normalized) ? normalized : 'domestic'
}

function mapWaterSource(value: unknown): string {
  const key = asLowerString(value)
  const aliases: Record<string, string> = {
    stream_river: 'river',
    stream: 'river',
    dam: 'surface_water',
    swamp: 'surface_water',
    reservoir: 'surface_water',
    wetland: 'surface_water',
    hydropower_source: 'surface_water',
  }
  const normalized = aliases[key] || key
  return WATER_SOURCE.has(normalized) ? normalized : 'other'
}

function mapWaterPurpose(value: unknown): string {
  const key = asLowerString(value)
  const aliases: Record<string, string> = {
    aquaculture: 'fish_farming_lakes',
    industry: 'industrial',
    electricity: 'electricity_generation',
    construction: 'industrial',
  }
  const normalized = aliases[key] || key
  return WATER_PURPOSE.has(normalized) ? normalized : 'other'
}

function mapProvince(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return 'Kigali'
  const key = raw.toLowerCase()
  const aliases: Record<string, string> = {
    kigali: 'Kigali',
    north: 'Northern',
    northern: 'Northern',
    south: 'Southern',
    southern: 'Southern',
    east: 'Eastern',
    eastern: 'Eastern',
    west: 'Western',
    western: 'Western',
  }
  return aliases[key] || 'Kigali'
}

function mapStatus(value: unknown): string {
  const key = asLowerString(value)
  return APPLICATION_STATUS.has(key) ? key : 'draft'
}

function mapWaterReliability(value: unknown): string {
  const key = asLowerString(value)
  return WATER_RELIABILITY.has(key) ? key : 'always_available'
}

function mapLandOwnershipStatus(value: unknown): string {
  const key = asLowerString(value)
  return LAND_OWNERSHIP_STATUS.has(key) ? key : 'access_pending'
}

function mapSlaStatus(value: unknown): string {
  const key = asLowerString(value)
  return SLA_STATUS.has(key) ? key : 'on_time'
}

export function sanitizeApplicationEnumPayload(payload: Payload): Payload {
  const next: Payload = { ...payload }

  if ('application_type' in next) next.application_type = mapApplicationType(next.application_type)
  if ('water_source' in next) next.water_source = mapWaterSource(next.water_source)
  if ('water_purpose' in next) next.water_purpose = mapWaterPurpose(next.water_purpose)
  if ('status' in next) next.status = mapStatus(next.status)
  if ('province' in next) next.province = mapProvince(next.province)
  if ('water_reliability' in next) next.water_reliability = mapWaterReliability(next.water_reliability)
  if ('land_ownership_status' in next) next.land_ownership_status = mapLandOwnershipStatus(next.land_ownership_status)
  if ('sla_status' in next) next.sla_status = mapSlaStatus(next.sla_status)

  return next
}

/* -------------------------------------------------------------------------
 * Migration-order tolerance (SQLSTATE 22P02 — invalid input value for enum)
 * -------------------------------------------------------------------------
 * Some enum values above ship in the application code before their SQL
 * migration has been applied to a given database. Writing such a value makes
 * Postgres raise 22P02 ("invalid input value for enum <type>: <value>"), which
 * — unlike the missing-column case (42703) — used to bubble up as a 500 and
 * BLOCK the applicant from submitting at all.
 *
 * The write paths (app/api/dashboard/applications[/[id]]/route.ts) now ask
 * getInvalidEnumFallbackFromError() for a legacy value to retry with, so:
 *   - migration NOT applied yet -> one retry with the legacy fallback (plus a
 *     warning naming the migration to run); the applicant can still submit.
 *   - migration applied         -> the new value is accepted on the first try
 *     and persists losslessly (no coercion happens at all).
 */

type LegacyEnumFallback = {
  /** applications column that carries this enum type */
  column: string
  /**
   * The COMPLETE set of payload keys that may carry this enum type. The retry
   * helper only ever rewrites a key from this list — it never scans the payload
   * for "whatever else happens to hold the rejected string", which could
   * silently rewrite an unrelated free-text field that happens to contain the
   * same word (e.g. `description: 'other'`).
   */
  carrierColumns: readonly string[]
  /** SQL file that must be applied for the new values to persist */
  migration: string
  /** new value -> legacy value to fall back to while the migration is pending */
  values: Record<string, string>
}

export const LEGACY_ENUM_FALLBACKS: Record<string, LegacyEnumFallback> = {
  water_purpose: {
    column: 'water_purpose',
    carrierColumns: ['water_purpose'],
    migration: 'database/migrations/add-other-concession-purpose-enum.sql',
    // Same coercion the sanitizer used before 'other_concession' existed.
    // NOTE: this coercion is LOSSY for classification purposes ('other' is an
    // abstraction purpose, 'other_concession' is a concession one), which is
    // why every coercion is also recorded durably in internal_notes by
    // recordEnumCoercionInPayload() below and healed by the migration's
    // backfill statement.
    values: { other_concession: 'other' },
  },
  application_status: {
    column: 'status',
    carrierColumns: ['status'],
    migration: 'database/add-terminated-status.sql (terminated) / database/add-closed-incomplete-status.sql (closed_incomplete)',
    // 'cancelled' is the closest pre-existing TERMINAL status: like 'terminated'
    // it closes the file without implying rejection or revision, and it never
    // re-opens the application to the applicant (which 'draft' would).
    // 'expired' is what the six-month sweep wrote before this status existed,
    // so it is the exact legacy equivalent for 'closed_incomplete'.
    values: { terminated: 'cancelled', closed_incomplete: 'expired' },
  },
}

const INVALID_ENUM_VALUE_PATTERN =
  /invalid input value for enum "?(?:[a-z0-9_]+"?\."?)?([a-z0-9_]+)"?:\s*"([^"]*)"/i

export type InvalidEnumFallback = {
  /** payload key to rewrite */
  column: string
  /** enum type Postgres rejected the value for */
  enumType: string
  /** value the database rejected */
  from: string
  /** legacy value to retry with */
  to: string
  /** migration that must be applied for `from` to be storable */
  migration: string
}

/**
 * Given a failed insert/update error and the payload that produced it, returns
 * the legacy value the write should be retried with, or null when the error is
 * not a recoverable invalid-enum-value error.
 */
export function getInvalidEnumFallbackFromError(
  err: unknown,
  payload: Record<string, unknown>
): InvalidEnumFallback | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { code?: unknown }).code
  if (code !== undefined && code !== '22P02') return null

  const message = typeof (err as { message?: unknown }).message === 'string'
    ? (err as { message: string }).message
    : ''
  const match = message.match(INVALID_ENUM_VALUE_PATTERN)
  if (!match) return null

  const enumType = match[1].toLowerCase()
  const rejectedValue = match[2]

  const config = LEGACY_ENUM_FALLBACKS[enumType]
  if (!config) return null

  const fallback = config.values[rejectedValue]
  // Only coerce values we explicitly know a safe legacy equivalent for, and
  // never coerce onto the same value (that would retry forever).
  if (!fallback || fallback === rejectedValue) return null

  // Only ever rewrite a key that is declared as a carrier of THIS enum type, and
  // only when it literally holds the rejected string. Never scan the whole
  // payload — an unrelated field (a free-text note, a label) could hold the same
  // word and would otherwise be silently rewritten.
  const column = config.carrierColumns.find(
    (key) => typeof payload[key] === 'string' && payload[key] === rejectedValue
  )
  if (!column) return null

  return {
    column,
    enumType,
    from: rejectedValue,
    to: fallback,
    migration: config.migration,
  }
}

/* -------------------------------------------------------------------------
 * Durable record of a coercion (so it is never silent and always recoverable)
 * -------------------------------------------------------------------------
 * A retry with a legacy value stores a value the application did NOT intend.
 * For `water_purpose` this is not cosmetic: 'other_concession' is a
 * pure-concession activity (lib/permit-variant.ts) while its legacy fallback
 * 'other' is an abstraction purpose, so any code that falls back to the
 * water_purpose column would classify the file as the wrong permit variant.
 *
 * Two defences, both applied here:
 *   1. `intended_activities` (JSONB) is the authoritative activity list and is
 *      never enum-constrained, so we make sure it carries the true value.
 *      Every classifier (isConcessionApplication, determineReportType,
 *      isConcessionPermitRecord) reads it FIRST, so a coerced row still
 *      behaves as a concession end-to-end.
 *   2. The coercion itself is appended to `internal_notes.enumCoercions` — a
 *      durable, queryable breadcrumb (not just a server console.warn) that the
 *      migration's backfill statement uses to heal the rows afterwards.
 */

/** internal_notes key holding the durable coercion breadcrumbs. */
export const ENUM_COERCION_NOTES_KEY = 'enumCoercions'

export type EnumCoercionRecord = {
  column: string
  enumType: string
  from: string
  to: string
  migration: string
  at: string
}

function parseNotesObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Free-text (non-JSON) notes: leave them completely alone.
  }
  return null
}

function toActivityList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean)
    } catch {
      // not a JSON array
    }
  }
  return null
}

/**
 * Records a pending-migration enum coercion durably on the payload, so the
 * intended value survives the write and can be backfilled later.
 *
 * - appends `{column, enumType, from, to, migration, at}` to
 *   `internal_notes.enumCoercions` (only when internal_notes is absent, empty
 *   or a JSON object — free-text notes are never rewritten);
 * - for `water_purpose`, makes sure `intended_activities` still carries the
 *   true activity code so downstream classification is unaffected.
 *
 * Returns true when a breadcrumb was written. Never throws: a failure here must
 * not block the applicant's submission (the retry itself is the safety net).
 */
export function recordEnumCoercionInPayload(
  payload: Record<string, unknown>,
  fallback: InvalidEnumFallback,
  options: { allowCreateColumns?: boolean } = {}
): boolean {
  try {
    // (1) keep the authoritative activity list truthful
    if (fallback.enumType === 'water_purpose') {
      const hasKey = 'intended_activities' in payload
      const current = hasKey ? toActivityList(payload.intended_activities) : null
      if (hasKey && current && current.length === 0) {
        payload.intended_activities = [fallback.from]
      } else if (!hasKey && options.allowCreateColumns) {
        payload.intended_activities = [fallback.from]
      }
      // A non-empty list is left untouched: it already carries what the
      // applicant actually selected.
    }

    // (2) durable, queryable breadcrumb.
    // Only touch internal_notes when this write already carries that column
    // (or when we are creating a brand-new row): adding it to a PATCH payload
    // that did not include it would overwrite the stored notes — which also
    // hold the document-text-override envelope — with our breadcrumb alone.
    const hasNotes = 'internal_notes' in payload
    if (!hasNotes && !options.allowCreateColumns) return false
    const notes = parseNotesObject(hasNotes ? payload.internal_notes : '')
    if (!notes) return false

    const existing = Array.isArray(notes[ENUM_COERCION_NOTES_KEY])
      ? (notes[ENUM_COERCION_NOTES_KEY] as unknown[])
      : []
    const alreadyRecorded = existing.some(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as Record<string, unknown>).column === fallback.column &&
        (entry as Record<string, unknown>).from === fallback.from
    )
    if (!alreadyRecorded) {
      const record: EnumCoercionRecord = {
        column: fallback.column,
        enumType: fallback.enumType,
        from: fallback.from,
        to: fallback.to,
        migration: fallback.migration,
        at: new Date().toISOString(),
      }
      notes[ENUM_COERCION_NOTES_KEY] = [...existing, record]
    }

    // internal_notes is a TEXT column holding JSON — always store a string.
    payload.internal_notes = JSON.stringify(notes)
    return !alreadyRecorded
  } catch {
    return false
  }
}
