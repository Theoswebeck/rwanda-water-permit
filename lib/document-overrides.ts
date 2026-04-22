export const DOCUMENT_OVERRIDE_KEYS = [
  "fullNameApplicant",
  "nationalIdNumber",
  "nameRepresentative",
  "representativeTitle",
  "representativePosition",
  "officeProvince",
  "officeDistrict",
  "officeSector",
  "nameSourceWater",
  "waterSourceProvince",
  "waterSourceDistrict",
  "waterSourceSector",
  "waterSourceCell",
  "waterSourceVillage",
  "waterSourceLatitude",
  "waterSourceLongitude",
] as const;

export type DocumentOverrideKey = (typeof DOCUMENT_OVERRIDE_KEYS)[number];
export type DocumentOverrideValue = string | number;
export type DocumentOverrideValues = Partial<Record<DocumentOverrideKey, DocumentOverrideValue>>;

export type DocumentOverrideEnvelope = {
  version: number;
  updatedAt?: string;
  updatedBy?: string;
  values: DocumentOverrideValues;
};

export type DocumentOverrideField = {
  key: DocumentOverrideKey;
  label: string;
  kind: "text" | "number";
  placeholder?: string;
};

export type DocumentOverrideFieldGroup = {
  id: string;
  label: string;
  fields: DocumentOverrideField[];
};

export const DOCUMENT_OVERRIDE_FIELD_GROUPS: DocumentOverrideFieldGroup[] = [
  {
    id: "applicant",
    label: "Applicant Details",
    fields: [
      { key: "fullNameApplicant", label: "Applicant / Organization Name", kind: "text" },
      { key: "nationalIdNumber", label: "National ID / Registration ID", kind: "text" },
      { key: "nameRepresentative", label: "Representative Name", kind: "text" },
      { key: "representativeTitle", label: "Representative Title", kind: "text" },
      { key: "representativePosition", label: "Representative Position", kind: "text" },
    ],
  },
  {
    id: "office",
    label: "Office Location",
    fields: [
      { key: "officeProvince", label: "Office Province", kind: "text" },
      { key: "officeDistrict", label: "Office District", kind: "text" },
      { key: "officeSector", label: "Office Sector", kind: "text" },
    ],
  },
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
];

const DOCUMENT_OVERRIDE_KEY_SET = new Set<string>(DOCUMENT_OVERRIDE_KEYS as readonly string[]);

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
