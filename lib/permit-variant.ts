/**
 * The activities that are ALWAYS a concession (surface-area based, polygon
 * boundary) regardless of any user-selected water-use category. This is the
 * single source of truth — do not re-hardcode this list anywhere else.
 */
export const PURE_CONCESSION_ACTIVITIES = [
  "fish_farming_lakes",
  "recreation_activities",
  "port_construction",
  "gaz_extraction",
  "other_concession",
] as const;

export type PureConcessionActivity = (typeof PURE_CONCESSION_ACTIVITIES)[number];

/** True when the given activity/purpose value is a pure-concession activity. */
export function isPureConcessionActivity(activity: unknown): activity is PureConcessionActivity {
  return (
    typeof activity === "string" &&
    (PURE_CONCESSION_ACTIVITIES as readonly string[]).includes(activity)
  );
}

/**
 * Purpose values that indicate a concession permit when classifying via a
 * permit row's `purpose` column (which may hold legacy values): the pure
 * concession activities plus the legacy "recreation" purpose. Compare against
 * a normalized purpose (trimmed, lowercased, spaces/hyphens → underscores).
 */
export const CONCESSION_PURPOSE_HINTS: ReadonlySet<string> = new Set<string>([
  ...PURE_CONCESSION_ACTIVITIES,
  "recreation",
]);

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

/**
 * Activity codes recovered from `internal_notes.enumCoercions` — the durable
 * breadcrumb written by lib/db/application-enum-sanitizer.ts when a
 * water_purpose value had to be coerced to a legacy enum member because its
 * migration had not been applied yet (e.g. 'other_concession' -> 'other').
 * Without this, such a row would look like an abstraction 'other' use if its
 * activity list were ever empty.
 */
function getCoercedPurposeActivities(notes: Record<string, any> | null): string[] {
  const raw = notes?.enumCoercions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        entry.column === "water_purpose" &&
        typeof entry.from === "string",
    )
    .map((entry) => String(entry.from));
}

function getIntendedActivities(application: ApplicationLike): string[] {
  const direct = normalizeActivities(application.intended_activities);
  if (direct.length) return direct;
  const notes = getInternalNotes(application);
  if (!notes) return [];
  const fromNotes = normalizeActivities(notes.intendedActivities);
  if (fromNotes.length) return fromNotes;
  return getCoercedPurposeActivities(notes);
}

export function isConcessionApplication(application: ApplicationLike): boolean {
  const acts = getIntendedActivities(application);
  return acts.some(isPureConcessionActivity);
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


