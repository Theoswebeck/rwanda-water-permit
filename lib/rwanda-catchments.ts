/**
 * Official RWB river-catchment hierarchy (Level I → Level II).
 *
 * Source: "River Catchments (I&II)" — RWB official catchment list.
 * Level I catchments each carry a hydrological code (e.g. CKIV). The value
 * stored on inspections for Level I is the code-suffixed label ("Lake Kivu (CKIV)");
 * Level II is the plain sub-catchment name ("Sebeya").
 *
 * NOTE: the codes/spellings below were transcribed from the source document.
 * Verify against the official document with RWB before relying on the codes.
 */

export interface Catchment {
  /** Bare Level I name, e.g. "Lake Kivu". */
  level1: string;
  /** Hydrological code, e.g. "CKIV". */
  code: string;
  /** Stored / displayed Level I value, e.g. "Lake Kivu (CKIV)". */
  level1Label: string;
  /** Level II sub-catchment names. Empty when the Level I has none. */
  level2: string[];
}

function make(level1: string, code: string, level2: string[]): Catchment {
  return { level1, code, level1Label: `${level1} (${code})`, level2 };
}

export const RWANDA_CATCHMENTS: Catchment[] = [
  make("Lake Kivu", "CKIV", ["Sebeya", "Koko/Muregeya", "Kamiranzovu"]),
  make("Rusizi River", "CRUS", ["Rubyiro", "Ruhwa"]),
  make("Upper Nyabarongo", "NNYU", ["Mbirurume", "Mwogo", "Nyabarongo Upstream"]),
  make("Mukungwa River", "NMUK", ["Mukungwa"]),
  make("Lower Nyabarongo", "NNYL", ["Nyabugogo", "Mambu/Base"]),
  make("Akanyaru", "NAKN", ["Giswi/Agatobwe", "Gishara/Mukunguri", "Cyohoha Lake"]),
  make("Upper Akagera", "NAKU", ["Mugesera/Sake", "Rweru"]),
  make("Lower Akagera", "NAKL", []),
  make("Muvumba", "NMUV", ["Mulindi", "Warufu/Muvumba"]),
];

/** All Level I stored values, in document order. */
export const LEVEL1_OPTIONS: string[] = RWANDA_CATCHMENTS.map((c) => c.level1Label);

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Find the catchment matching a stored/legacy Level I value, tolerant of a
 * missing code, casing, and extra whitespace. Returns undefined if no match.
 *
 * Matching order: exact label → ci label → ci bare name → ci code.
 */
export function findCatchmentByLevel1(
  value: string | null | undefined
): Catchment | undefined {
  if (!value) return undefined;
  const exact = RWANDA_CATCHMENTS.find((c) => c.level1Label === value);
  if (exact) return exact;
  const n = norm(value);
  return RWANDA_CATCHMENTS.find(
    (c) =>
      norm(c.level1Label) === n ||
      norm(c.level1) === n ||
      norm(c.code) === n
  );
}

/**
 * Level II options for a given (possibly legacy) Level I value.
 * Returns [] when the Level I has no sub-catchments or is unknown/empty.
 */
export function getLevel2Options(
  level1Value: string | null | undefined
): string[] {
  return findCatchmentByLevel1(level1Value)?.level2 ?? [];
}

/** True when `level2Value` is a valid sub-catchment of `level1Value`. */
export function isValidLevel2(
  level1Value: string | null | undefined,
  level2Value: string | null | undefined
): boolean {
  if (!level2Value) return false;
  const n = norm(level2Value);
  return getLevel2Options(level1Value).some((o) => norm(o) === n);
}
