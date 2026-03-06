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
])

const APPLICATION_TYPE = new Set([
  'domestic',
  'industrial',
  'agricultural',
  'commercial',
  'municipal',
  'mining_water_use',
  'transfer',
  'modification',
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
  'aquaculture',
  'fish_farming_lakes',
  'fish_farming_ponds',
  'recreation',
  'electricity_generation',
  'mining',
  'municipal_supply',
  'other',
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
    gaz_extraction: 'industrial',
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
    water_supply: 'domestic',
    industry: 'industrial',
    coffee_washing: 'industrial',
    electricity: 'electricity_generation',
    construction: 'industrial',
    construction_of_dam: 'industrial',
    construction_of_infrastructures: 'industrial',
    navigation: 'recreation',
    recreation_activities: 'recreation',
    gaz_extraction: 'industrial',
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
