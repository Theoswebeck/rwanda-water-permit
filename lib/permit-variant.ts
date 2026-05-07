export type PermitVariant =
  | "abstraction_individual"
  | "abstraction_organization"
  | "concession_individual"
  | "concession_organization"
  | "bulk_water_supply"
  | "fallback_generic";

type ApplicantLike = {
  account_type?: string | null;
} | null;

type ApplicationLike = {
  is_bulk?: boolean | null;
  intended_activities?: unknown;
  internal_notes?: unknown;
  applicant?: ApplicantLike;
};

function safeJsonParseObject(s: unknown): Record<string, any> | null {
  if (typeof s !== "string" || !s.trim()) return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}

function normalizeActivities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  // Supabase JSONB can arrive already parsed as array; but sometimes it may be a JSON string.
  if (typeof raw === "string") {
    // If it's a JSON object, it's not activities.
    const parsedObj = safeJsonParseObject(raw);
    if (parsedObj) return [];
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return [];
}

function getInternalNotes(application: ApplicationLike): Record<string, any> | null {
  return safeJsonParseObject(application.internal_notes);
}

function getIntendedActivities(application: ApplicationLike): string[] {
  const direct = normalizeActivities(application.intended_activities);
  if (direct.length) return direct;
  const notes = getInternalNotes(application);
  if (!notes) return [];
  return normalizeActivities(notes.intendedActivities);
}

export function isConcessionApplication(application: ApplicationLike): boolean {
  const acts = getIntendedActivities(application);
  return acts.includes("fish_farming_lakes") || acts.includes("recreation_activities");
}

export function selectPermitVariant(application: ApplicationLike): PermitVariant {
  // Bulk water supply applications always use the bulk variant
  if (application.is_bulk) return "bulk_water_supply";

  const accountType = application.applicant?.account_type ?? null;
  const isIndividual = accountType === "individual";
  const isConcession = isConcessionApplication(application);
  if (isIndividual && !isConcession) return "abstraction_individual";
  if (isIndividual && isConcession) return "concession_individual";
  if (!isIndividual && !isConcession) return "abstraction_organization";
  if (!isIndividual && isConcession) return "concession_organization";
  return "fallback_generic";
}


