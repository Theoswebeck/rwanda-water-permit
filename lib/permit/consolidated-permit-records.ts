type PermitSource = "permits" | "permit_registry";
type PermitStatus = "active" | "expired" | "expiring_soon" | "suspended" | "revoked";

export type ConsolidatedPermitRecord = {
  permitId: string;
  permitNumber: string;
  source: PermitSource;
  status: PermitStatus;
  waterSource: string;
  purpose: string;
  waterAllowance: number | null;
  allowanceUnit: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  catchment1: string | null;
  catchment2: string | null;
  lat: number | null;
  lng: number | null;
  applicationId: string | null;
  permitHolder: string | null;
  locationSummary: string | null;
};

export type PermitDashboardPermitRow = {
  id: string;
  application_id?: string | null;
  permit_number: string | null;
  status?: string | null;
  water_source?: string | null;
  purpose?: string | null;
  water_allowance?: number | string | null;
  allowance_unit?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  catchment_name_level_1?: string | null;
  catchment_name_level_2?: string | null;
  lat?: number | null;
  lng?: number | null;
  permit_holder?: string | null;
  location?: string | null;
};

export type PermitDashboardRegistryRow = {
  id: string;
  permit_number: string | null;
  status?: string | null;
  water_source?: string | null;
  authorized_activity?: string | null;
  volume_or_area?: string | null;
  issuance_date?: string | null;
  expiration_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  permit_holder?: string | null;
  location?: string | null;
};

function normalizePermitNumber(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function permitKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRegistryVolumeOrArea(value: string | null | undefined): { waterAllowance: number | null; allowanceUnit: string | null } {
  const raw = String(value ?? "").trim();
  if (!raw) return { waterAllowance: null, allowanceUnit: null };

  const match = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return { waterAllowance: null, allowanceUnit: null };

  const waterAllowance = toNumber(match[0]);
  const allowanceUnit = raw.replace(match[0], "").trim() || null;
  return { waterAllowance, allowanceUnit };
}

function normalizeWaterSource(value: string | null | undefined): string {
  const key = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    stream_river: "river",
    stream: "river",
    dam: "surface_water",
    swamp: "surface_water",
    reservoir: "surface_water",
    wetland: "surface_water",
    hydropower_source: "surface_water",
  };
  return aliases[key] || key || "other";
}

function normalizePurpose(value: string | null | undefined): string {
  const key = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    industry: "industrial",
    coffee_washing_station: "coffee_washing",
    electricity: "electricity_generation",
    construction: "industrial",
    recreation_activities: "recreation",
    gas_extraction: "gaz_extraction",
    aquaculture: "fish_farming_lakes",
  };
  return aliases[key] || key || "other";
}

function normalizeStatus(value: string | null | undefined, expiryDate?: string | null): PermitStatus {
  const key = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "expired") return "expired";
  if (key === "expiring_soon") return "expiring_soon";
  if (key === "suspended") return "suspended";
  if (key === "revoked") return "revoked";
  if (["active", "operational", "approved", "valid"].includes(key)) return "active";

  if (expiryDate) {
    const expiry = new Date(expiryDate);
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      return "expired";
    }
  }

  return "active";
}

function compareSourcePriority(a: ConsolidatedPermitRecord, b: ConsolidatedPermitRecord): number {
  const rank = (value: ConsolidatedPermitRecord) => (value.source === "permits" ? 0 : 1);
  const sourceDelta = rank(a) - rank(b);
  if (sourceDelta !== 0) return sourceDelta;

  const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  return bUpdated - aUpdated;
}

export function createConsolidatedPermitFromPermit(row: PermitDashboardPermitRow): ConsolidatedPermitRecord | null {
  const permitNumber = normalizePermitNumber(row.permit_number);
  if (!permitNumber) return null;

  return {
    permitId: row.id,
    permitNumber,
    source: "permits",
    status: normalizeStatus(row.status, row.expiry_date),
    waterSource: normalizeWaterSource(row.water_source),
    purpose: normalizePurpose(row.purpose),
    waterAllowance: toNumber(row.water_allowance),
    allowanceUnit: row.allowance_unit ?? null,
    issuedDate: row.issued_date ?? null,
    expiryDate: row.expiry_date ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    province: row.province ?? null,
    district: row.district ?? null,
    sector: row.sector ?? null,
    catchment1: row.catchment_name_level_1 ?? null,
    catchment2: row.catchment_name_level_2 ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    applicationId: row.application_id ?? null,
    permitHolder: row.permit_holder ?? null,
    locationSummary: row.location ?? null,
  };
}

export function createConsolidatedPermitFromRegistry(row: PermitDashboardRegistryRow): ConsolidatedPermitRecord | null {
  const permitNumber = normalizePermitNumber(row.permit_number);
  if (!permitNumber) return null;

  const parsedVolume = parseRegistryVolumeOrArea(row.volume_or_area);

  return {
    permitId: row.id,
    permitNumber,
    source: "permit_registry",
    status: normalizeStatus(row.status, row.expiration_date),
    waterSource: normalizeWaterSource(row.water_source),
    purpose: normalizePurpose(row.authorized_activity),
    waterAllowance: parsedVolume.waterAllowance,
    allowanceUnit: parsedVolume.allowanceUnit,
    issuedDate: row.issuance_date ?? null,
    expiryDate: row.expiration_date ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    province: null,
    district: null,
    sector: null,
    catchment1: null,
    catchment2: null,
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
    applicationId: null,
    permitHolder: row.permit_holder ?? null,
    locationSummary: row.location ?? null,
  };
}

export function consolidatePermitRecords(records: ConsolidatedPermitRecord[]): ConsolidatedPermitRecord[] {
  const grouped = new Map<string, ConsolidatedPermitRecord[]>();

  for (const record of records) {
    const key = permitKey(record.permitNumber);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(record);
    } else {
      grouped.set(key, [record]);
    }
  }

  return Array.from(grouped.values())
    .map((group) => [...group].sort(compareSourcePriority)[0])
    .sort((a, b) => a.permitNumber.localeCompare(b.permitNumber));
}
