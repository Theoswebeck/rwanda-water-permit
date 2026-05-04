export const DOCUMENT_OVERRIDE_KEYS = [
  "fullNameApplicant",
  "nationalIdNumber",
  "nameRepresentative",
  "representativeTitle",
  "representativePosition",
  "officeProvince",
  "officeDistrict",
  "officeSector",
  "officeCell",
  "officeVillage",
  "nameSourceWater",
  "waterSourceProvince",
  "waterSourceDistrict",
  "waterSourceSector",
  "waterSourceCell",
  "waterSourceVillage",
  "waterSourceLatitude",
  "waterSourceLongitude",
  "intendedActivities",
] as const;

export type DocumentOverrideKey = (typeof DOCUMENT_OVERRIDE_KEYS)[number];
export type DocumentOverrideValue = string | number | string[];
export type DocumentOverrideValues = Partial<Record<DocumentOverrideKey, DocumentOverrideValue>>;

export type DocumentOverrideEnvelope = {
  version: number;
  updatedAt?: string;
  updatedBy?: string;
  values: DocumentOverrideValues;
};

export type DocumentOverrideTextField = {
  key: DocumentOverrideKey;
  label: string;
  kind: "text" | "number";
  placeholder?: string;
};

export type DocumentOverrideMultiSelectField = {
  key: DocumentOverrideKey;
  label: string;
  kind: "multiselect";
  options: { value: string; label: string }[];
  placeholder?: string;
};

export type DocumentOverrideField =
  | DocumentOverrideTextField
  | DocumentOverrideMultiSelectField;

export type DocumentOverrideFieldGroup = {
  id: string;
  label: string;
  fields: DocumentOverrideField[];
};

/**
 * Canonical list of activity codes that the applicant can pick from on the
 * application form. Used both for validation when an assessor edits the
 * `intendedActivities` override, and for the multi-select UI in
 * DocumentValuesEditor. Mirrors the radio list in
 * `components/dashboard/application-form-new.tsx`.
 */
export const INTENDED_ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: "coffee_washing", label: "Coffee washing" },
  { value: "construction_of_dam", label: "Construction of a dam" },
  { value: "construction_of_infrastructures", label: "Construction or installation of infrastructure" },
  { value: "electricity_generation", label: "Electricity generation (Hydropower)" },
  { value: "fish_farming_lakes", label: "Fish farming in lakes" },
  { value: "fish_farming_ponds", label: "Fish farming in ponds" },
  { value: "gaz_extraction", label: "Gaz extraction" },
  { value: "industry", label: "Industry" },
  { value: "irrigation", label: "Irrigation" },
  { value: "livestock", label: "Livestock" },
  { value: "mining", label: "Mining" },
  { value: "recreation_activities", label: "Recreational activities" },
  { value: "water_supply", label: "Water supply" },
  { value: "other", label: "Other" },
];

const INTENDED_ACTIVITY_VALUE_SET = new Set<string>(
  INTENDED_ACTIVITY_OPTIONS.map((o) => o.value),
);

/**
 * Editable groups exposed in the assessor UI.
 *
 * Applicant Details (name, national ID, representative info) and Office
 * Location are intentionally NOT editable — those values must reflect the
 * applicant's submitted record. Only fields the assessor verifies on-site
 * (water source location/coordinates and intended use) are editable here.
 *
 * Note: the keys for the omitted groups remain in {@link DOCUMENT_OVERRIDE_KEYS}
 * so any historical overrides keep rendering correctly; the editor simply
 * doesn't surface them for new edits.
 */
export const DOCUMENT_OVERRIDE_FIELD_GROUPS: DocumentOverrideFieldGroup[] = [
  {
    id: "water_source",
    label: "Water Source Details",
    fields: [
      { key: "nameSourceWater", label: "River / Lake / Source Name", kind: "text" },
      { key: "waterSourceProvince", label: "Water Source Province", kind: "text" },
      { key: "waterSourceDistrict", label: "Water Source District", kind: "text" },
      { key: "waterSourceSector", label: "Water Source Sector", kind: "text" },
      { key: "waterSourceCell", label: "Water Source Cell", kind: "text" },
      { key: "waterSourceVillage", label: "Water Source Village", kind: "text" },
      { key: "waterSourceLatitude", label: "Latitude", kind: "number", placeholder: "-1.9441" },
      { key: "waterSourceLongitude", label: "Longitude", kind: "number", placeholder: "30.0619" },
    ],
  },
  {
    id: "use",
    label: "Use Purpose",
    fields: [
      {
        key: "intendedActivities",
        label: "Intended Activities",
        kind: "multiselect",
        options: INTENDED_ACTIVITY_OPTIONS,
        placeholder: "Select one or more activities",
      },
    ],
  },
];

const DOCUMENT_OVERRIDE_KEY_SET = new Set<string>(DOCUMENT_OVERRIDE_KEYS as readonly string[]);

const MULTISELECT_KEYS = new Set<DocumentOverrideKey>(["intendedActivities"]);
const MULTISELECT_OPTION_SETS: Record<string, Set<string>> = {
  intendedActivities: INTENDED_ACTIVITY_VALUE_SET,
};
const MAX_MULTISELECT_ITEMS = 10;

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseInternalNotes(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, any>) };
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, any>) };
      }
    } catch {
      // ignore parse errors; return empty object
    }
  }
  return {};
}

/**
 * Strict variant of {@link parseInternalNotes} that distinguishes between
 * "the column has no JSON object yet" (safe to start fresh from `{}`) and
 * "the column has *something*, but it isn't a JSON object" (legacy plain-text
 * note, scalar, array, malformed JSON).
 *
 * Read paths can keep using {@link parseInternalNotes} (lossy/best-effort).
 * **Write paths must use this**: returning `{}` for a non-empty unparseable
 * row would cause us to silently overwrite legacy data when we re-stringify.
 *
 * Empty/null/whitespace-only input is treated as `ok: true, value: {}`.
 */
export type StrictParseResult =
  | { ok: true; value: Record<string, any> }
  | { ok: false; reason: "non_object" | "invalid_json"; rawPreview: string };

export function parseInternalNotesStrict(raw: unknown): StrictParseResult {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: { ...(raw as Record<string, any>) } };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      reason: "non_object",
      rawPreview: String(raw).slice(0, 80),
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, value: { ...(parsed as Record<string, any>) } };
    }
    return { ok: false, reason: "non_object", rawPreview: trimmed.slice(0, 80) };
  } catch {
    return { ok: false, reason: "invalid_json", rawPreview: trimmed.slice(0, 80) };
  }
}

export function getDocumentOverrideEnvelopeFromNotes(
  notesRaw: unknown,
): DocumentOverrideEnvelope {
  const notes = parseInternalNotes(notesRaw);
  const envelopeRaw = notes.document_overrides as Record<string, unknown> | undefined;
  const valuesRaw = envelopeRaw?.values as Record<string, unknown> | undefined;
  const values: DocumentOverrideValues = {};

  if (valuesRaw && typeof valuesRaw === "object") {
    for (const key of DOCUMENT_OVERRIDE_KEYS) {
      const v = valuesRaw[key];
      if (MULTISELECT_KEYS.has(key)) {
        if (Array.isArray(v)) {
          const allowed = MULTISELECT_OPTION_SETS[key];
          const cleaned = v
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && (!allowed || allowed.has(s)));
          if (cleaned.length > 0) values[key] = cleaned.slice(0, MAX_MULTISELECT_ITEMS);
        }
        continue;
      }
      if (typeof v === "string" || typeof v === "number") values[key] = v;
    }
  }

  return {
    version:
      typeof envelopeRaw?.version === "number" && Number.isFinite(envelopeRaw.version)
        ? Math.max(0, Math.trunc(envelopeRaw.version))
        : 0,
    updatedAt: typeof envelopeRaw?.updatedAt === "string" ? envelopeRaw.updatedAt : undefined,
    updatedBy: typeof envelopeRaw?.updatedBy === "string" ? envelopeRaw.updatedBy : undefined,
    values,
  };
}

/**
 * Minimal application shape that {@link getDocumentBaseValues} needs to read
 * underlying values for each override key. Kept narrow so this module stays
 * dependency-free.
 */
export type ApplicationForOverrides = {
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  coordinates?: unknown;
  water_body_name?: string | null;
  water_source?: string | null;
  intended_activities?: unknown;
  internal_notes?: unknown;
  applicant?: {
    account_type?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    id_number?: string | null;
  } | null;
};

export type DocumentBaseValues = Partial<Record<DocumentOverrideKey, string | string[]>>;
export type DocumentEffectiveValues = Record<DocumentOverrideKey, string | string[]>;

function trimStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function pickFirstString(...candidates: unknown[]): string {
  for (const c of candidates) {
    const t = trimStr(c);
    if (t) return t;
  }
  return "";
}

function extractLatLngFromApp(app: ApplicationForOverrides): { lat: string; lng: string } {
  const notes = parseInternalNotes(app.internal_notes);
  const tryPair = (rawLat: unknown, rawLng: unknown): { lat: string; lng: string } | null => {
    const latStr = trimStr(rawLat);
    const lngStr = trimStr(rawLng);
    const latNum = latStr ? Number.parseFloat(latStr) : NaN;
    const lngNum = lngStr ? Number.parseFloat(lngStr) : NaN;
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: String(latNum), lng: String(lngNum) };
    }
    return null;
  };
  const fromNotes = tryPair(notes.waterSourceLatitude, notes.waterSourceLongitude);
  const assessorAdjustments = notes._assessorAdjustments;
  if (assessorAdjustments && typeof assessorAdjustments === "object") {
    const fromAssessor = tryPair(
      (assessorAdjustments as any).waterSourceLatitude,
      (assessorAdjustments as any).waterSourceLongitude,
    );
    if (fromAssessor) return fromAssessor;
  }
  if (fromNotes) return fromNotes;
  const tfd = (notes as any).transferFormData;
  if (tfd && typeof tfd === "object") {
    const fromTfd = tryPair(tfd.waterSourceLatitude, tfd.waterSourceLongitude);
    if (fromTfd) return fromTfd;
  }
  const geom = app.coordinates as any;
  if (geom && geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lng, lat] = geom.coordinates;
    const fromGeom = tryPair(lat, lng);
    if (fromGeom) return fromGeom;
  }
  return { lat: "", lng: "" };
}

function extractIntendedActivitiesBase(app: ApplicationForOverrides): string[] {
  const allowed = INTENDED_ACTIVITY_VALUE_SET;
  const fromCol = Array.isArray(app.intended_activities)
    ? (app.intended_activities as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && allowed.has(s))
    : [];
  if (fromCol.length) return fromCol.slice(0, MAX_MULTISELECT_ITEMS);
  const notes = parseInternalNotes(app.internal_notes);
  const tfd = (notes as any).transferFormData;
  if (tfd && typeof tfd === "object" && Array.isArray(tfd.intendedActivities)) {
    const fromTfd = (tfd.intendedActivities as unknown[])
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && allowed.has(s));
    if (fromTfd.length) return fromTfd.slice(0, MAX_MULTISELECT_ITEMS);
  }
  return [];
}

/**
 * Underlying values for each override key, derived from application columns
 * and the *raw* internal_notes (excluding the override envelope). These are the
 * values that would render if the assessor cleared all overrides — so the editor
 * can prefill its inputs with what the assessor currently sees in the preview.
 */
export function getDocumentBaseValues(app: ApplicationForOverrides): DocumentBaseValues {
  const rawNotes = parseInternalNotes(app.internal_notes);
  // Re-parse with override stripped so we never accidentally leak override
  // values back into the "base" pool. (parseInternalNotes returns a shallow
  // copy, so deleting from this is safe.)
  const baseNotes: Record<string, any> = { ...rawNotes };
  delete baseNotes.document_overrides;

  const tfd = (baseNotes.transferFormData ?? null) as Record<string, unknown> | null;

  const accType = trimStr(app.applicant?.account_type);
  const isIndividual = accType === "individual";
  const firstName = trimStr(app.applicant?.first_name);
  const lastName = trimStr(app.applicant?.last_name);
  const companyName = trimStr(app.applicant?.company_name);
  const fullName = isIndividual
    ? `${firstName} ${lastName}`.trim()
    : companyName || `${firstName} ${lastName}`.trim();

  const out: DocumentBaseValues = {};

  // Applicant block — top-level notes fields (set during application form
  // submission) take precedence over user record fields, mirroring the
  // resolveOrganizationName / resolveRepresentativeName logic in the renderers.
  const baseFullName = pickFirstString(
    baseNotes.fullNameApplicant,
    isIndividual ? fullName : companyName,
    fullName,
  );
  if (baseFullName) out.fullNameApplicant = baseFullName;

  const baseNationalId = pickFirstString(baseNotes.nationalIdNumber, app.applicant?.id_number);
  if (baseNationalId) out.nationalIdNumber = baseNationalId;

  const baseRepName = pickFirstString(
    baseNotes.nameRepresentative,
    !isIndividual && (firstName || lastName) ? `${firstName} ${lastName}`.trim() : "",
  );
  if (baseRepName) out.nameRepresentative = baseRepName;

  const baseRepTitle = pickFirstString(baseNotes.representativeTitle);
  if (baseRepTitle) out.representativeTitle = baseRepTitle;

  const baseRepPosition = pickFirstString(baseNotes.representativePosition);
  if (baseRepPosition) out.representativePosition = baseRepPosition;

  // Office location block. Office cell/village have no application column
  // fallback, so they are only sourced from notes.
  const officeProvince = pickFirstString(baseNotes.officeProvince, app.province);
  if (officeProvince) out.officeProvince = officeProvince;

  const officeDistrict = pickFirstString(baseNotes.officeDistrict, app.district);
  if (officeDistrict) out.officeDistrict = officeDistrict;

  const officeSector = pickFirstString(baseNotes.officeSector, app.sector);
  if (officeSector) out.officeSector = officeSector;

  const officeCell = pickFirstString(baseNotes.officeCell);
  if (officeCell) out.officeCell = officeCell;

  const officeVillage = pickFirstString(baseNotes.officeVillage);
  if (officeVillage) out.officeVillage = officeVillage;

  // Water source block.
  const baseSourceName = pickFirstString(
    baseNotes.nameSourceWater,
    app.water_body_name,
    typeof app.water_source === "string" ? app.water_source.replaceAll("_", " ") : "",
    tfd && typeof tfd.waterPurpose === "string" ? tfd.waterPurpose : "",
  );
  if (baseSourceName) out.nameSourceWater = baseSourceName;

  const wsProvince = pickFirstString(baseNotes.waterSourceProvince, app.province);
  if (wsProvince) out.waterSourceProvince = wsProvince;
  const wsDistrict = pickFirstString(baseNotes.waterSourceDistrict, app.district);
  if (wsDistrict) out.waterSourceDistrict = wsDistrict;
  const wsSector = pickFirstString(baseNotes.waterSourceSector, app.sector);
  if (wsSector) out.waterSourceSector = wsSector;
  const wsCell = pickFirstString(baseNotes.waterSourceCell, app.cell);
  if (wsCell) out.waterSourceCell = wsCell;
  const wsVillage = pickFirstString(baseNotes.waterSourceVillage, app.village);
  if (wsVillage) out.waterSourceVillage = wsVillage;

  const { lat, lng } = extractLatLngFromApp(app);
  if (lat) out.waterSourceLatitude = lat;
  if (lng) out.waterSourceLongitude = lng;

  // Use purpose — multiselect.
  const baseActivities = extractIntendedActivitiesBase(app);
  if (baseActivities.length) out.intendedActivities = baseActivities;

  return out;
}

/**
 * Combined values per override key: override envelope wins, then base value,
 * else "" (or [] for multiselect). Use this to prefill the editor inputs so
 * the assessor sees what the permit currently renders.
 */
export function getEffectiveDocumentValues(app: ApplicationForOverrides): DocumentEffectiveValues {
  const overrides = getDocumentOverrideEnvelopeFromNotes(app.internal_notes).values;
  const base = getDocumentBaseValues(app);
  const out = {} as DocumentEffectiveValues;
  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    if (MULTISELECT_KEYS.has(key)) {
      const ov = overrides[key];
      if (Array.isArray(ov) && ov.length > 0) {
        out[key] = ov.map(String);
        continue;
      }
      const bv = base[key];
      out[key] = Array.isArray(bv) ? bv.map(String) : [];
      continue;
    }
    const ov = overrides[key];
    if (typeof ov === "string" && ov.trim()) {
      out[key] = ov;
      continue;
    }
    if (typeof ov === "number" && Number.isFinite(ov)) {
      out[key] = String(ov);
      continue;
    }
    const bv = base[key];
    if (typeof bv === "string" && bv) {
      out[key] = bv;
      continue;
    }
    out[key] = "";
  }
  return out;
}

export function getEffectiveInternalNotes(notesRaw: unknown): Record<string, any> {
  const notes = parseInternalNotes(notesRaw);
  const envelope = getDocumentOverrideEnvelopeFromNotes(notes);
  if (!envelope || !envelope.values) return notes;

  for (const key of DOCUMENT_OVERRIDE_KEYS) {
    const v = envelope.values[key];
    if (v !== undefined) notes[key] = v;
  }

  return notes;
}

export function sanitizeDocumentOverridePatch(input: Record<string, unknown>): {
  values: DocumentOverrideValues;
  errors: string[];
} {
  const values: DocumentOverrideValues = {};
  const errors: string[] = [];

  for (const [key, raw] of Object.entries(input)) {
    if (!DOCUMENT_OVERRIDE_KEY_SET.has(key)) {
      errors.push(`Unsupported field: ${key}`);
      continue;
    }
    const typedKey = key as DocumentOverrideKey;

    if (raw === null || raw === undefined) continue;

    if (MULTISELECT_KEYS.has(typedKey)) {
      if (!Array.isArray(raw)) {
        errors.push(`Invalid value for ${key} (expected array)`);
        continue;
      }
      const allowed = MULTISELECT_OPTION_SETS[typedKey];
      const cleaned: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (allowed && !allowed.has(trimmed)) continue;
        if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
      }
      if (cleaned.length === 0) {
        // Treat empty array as "clear override" — store as empty array so renderer falls back to column.
        values[typedKey] = [];
        continue;
      }
      if (cleaned.length > MAX_MULTISELECT_ITEMS) {
        errors.push(`${key} has too many items (max ${MAX_MULTISELECT_ITEMS})`);
        continue;
      }
      values[typedKey] = cleaned;
      continue;
    }

    if (typedKey === "waterSourceLatitude" || typedKey === "waterSourceLongitude") {
      const num = toFiniteNumber(raw);
      if (num === null) {
        errors.push(`Invalid number for ${key}`);
        continue;
      }
      if (typedKey === "waterSourceLatitude" && (num < -90 || num > 90)) {
        errors.push("Latitude must be between -90 and 90");
        continue;
      }
      if (typedKey === "waterSourceLongitude" && (num < -180 || num > 180)) {
        errors.push("Longitude must be between -180 and 180");
        continue;
      }
      values[typedKey] = Number(num.toFixed(8));
      continue;
    }

    if (typeof raw !== "string") {
      errors.push(`Invalid text value for ${key}`);
      continue;
    }
    const next = raw.trim();
    if (!next) continue;
    if (next.length > 120) {
      errors.push(`${key} is too long (max 120 characters)`);
      continue;
    }
    values[typedKey] = next;
  }

  return { values, errors };
}
