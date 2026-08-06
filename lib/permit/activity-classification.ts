/**
 * Canonical classification of the Permit Registry's free-text
 * `authorized_activity` column.
 *
 * The registry is populated from an XLSX maintained by hand, so the column
 * holds 120+ spellings of a much smaller set of real activities
 * ("water supply" / "Water Supply" / "Domestic water supply",
 * "Coffee washing station" / "Coffee Wahing Station" / "CWS", …). Both the
 * internal registry's Activity filter/column and the public Water Use
 * Dashboard's "Permits per Activity" tab need those collapsed onto one stable
 * set of categories.
 *
 * This module is the single source of truth for that mapping. It exposes:
 *   - `classifyActivity()`   — the TypeScript classifier, and
 *   - `activityCodeSqlExpression()` — the *same* rules rendered as a Postgres
 *     CASE expression, so filtering/sorting/aggregating can happen in SQL over
 *     the whole registry instead of only the rows on the current page.
 *
 * Both are generated from `ACTIVITY_RULES` below. Never hand-write one without
 * the other — the tests in `scripts/test-activity-classification.mjs` assert
 * that the two agree on every value currently in the registry.
 */

export const ACTIVITY_NOT_SPECIFIED = "not_specified";
export const ACTIVITY_OTHER = "other";

/** Canonical activity codes, in the order they should appear in a dropdown. */
export const ACTIVITY_CATEGORY_CODES = [
  "irrigation",
  "water_supply",
  "coffee_washing",
  "mining",
  "fish_farming",
  "industrial",
  "electricity_generation",
  "recreation",
  "livestock",
  "navigation",
  "port_construction",
  "construction_of_dam",
  "construction_of_infrastructures",
  "gaz_extraction",
  ACTIVITY_OTHER,
  ACTIVITY_NOT_SPECIFIED,
] as const;

export type ActivityCategoryCode = (typeof ACTIVITY_CATEGORY_CODES)[number];

/** Display labels. Kept aligned with `ACTIVITY_LABELS` in assessment-report-utils. */
export const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  irrigation: "Irrigation",
  water_supply: "Water Supply",
  coffee_washing: "Coffee Washing",
  mining: "Mining",
  fish_farming: "Fish Farming",
  industrial: "Industry",
  electricity_generation: "Electricity Generation (Hydropower)",
  recreation: "Recreational Activities",
  livestock: "Livestock",
  navigation: "Navigation",
  port_construction: "Port Construction",
  construction_of_dam: "Construction of Dam",
  construction_of_infrastructures: "Construction of Infrastructure",
  gaz_extraction: "Gas Extraction",
  [ACTIVITY_OTHER]: "Other",
  [ACTIVITY_NOT_SPECIFIED]: "Not Specified",
};

export function getActivityCategoryLabel(code: string | null | undefined): string {
  if (!code) return ACTIVITY_CATEGORY_LABELS[ACTIVITY_NOT_SPECIFIED];
  return ACTIVITY_CATEGORY_LABELS[code] || ACTIVITY_CATEGORY_LABELS[ACTIVITY_OTHER];
}

interface ActivityRule {
  code: ActivityCategoryCode;
  /** Plain substrings (already lower-case, spaces only). */
  contains?: string[];
  /** Whole-word matches — avoids "port" matching "transport". */
  words?: string[];
}

/**
 * ORDER MATTERS — the first matching rule wins.
 *
 * A few orderings are deliberate and load-bearing:
 *   - bottling before mining, so "Bottled Mineral water" is Industry, not Mining
 *   - irrigation before recreation, so "Irrigating the golf course" is Irrigation
 *   - recreation before fish farming, so "Recreational fishing" is Recreation
 *   - livestock before water supply, so "Livestock water supply" is Livestock
 *   - hydropower before dam, so "Construction of Hydropower" is Electricity
 */
export const ACTIVITY_RULES: ActivityRule[] = [
  { code: "coffee_washing", contains: ["coffee", "coffe washing"], words: ["cws"] },
  { code: "gaz_extraction", contains: ["gas extraction", "natural gas"] },
  // Water bottling is an industrial use; it must outrank the "mineral" keyword.
  { code: "industrial", contains: ["bottl"] },
  {
    code: "electricity_generation",
    contains: [
      "hydropower",
      "hydro power",
      "electricity",
      "power production",
      "power generation",
      "power plant",
    ],
  },
  { code: "construction_of_dam", words: ["dam"] },
  { code: "port_construction", words: ["port"] },
  { code: "navigation", contains: ["navigation"], words: ["boat"] },
  { code: "irrigation", contains: ["irrigat"] },
  {
    code: "recreation",
    contains: ["recreation", "golf", "hotel", "tourism", "resort", "swimming"],
  },
  { code: "fish_farming", contains: ["fish", "aquaculture", "hatchery"] },
  {
    code: "mining",
    contains: ["mining", "mineral", "quarry", "drilling"],
    words: ["ores", "mine"],
  },
  { code: "livestock", contains: ["livestock", "chicken", "cattle", "poultry"] },
  {
    code: "water_supply",
    contains: [
      "water supply",
      "watersupply",
      "domestic",
      "potable",
      "drinking",
      "municipal",
      "residential",
      "water use",
    ],
  },
  {
    code: "industrial",
    contains: ["industr", "processing", "manufactur", "abattoir", "dairy", "factory"],
    words: ["plant"],
  },
  {
    code: "construction_of_infrastructures",
    contains: ["construction", "airport", "infrastructure"],
  },
];

/** Delimiters that separate a primary activity from its qualifiers. */
const PRIMARY_SPLIT = /\(|,|;|\/|&|:|\s+and\s+/;

/** lower-case, underscores/dashes to spaces, whitespace collapsed. */
export function normalizeActivityText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleMatches(rule: ActivityRule, text: string): boolean {
  for (const needle of rule.contains ?? []) {
    if (text.includes(needle)) return true;
  }
  for (const word of rule.words ?? []) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return true;
  }
  return false;
}

/**
 * Map a raw registry activity string onto a canonical category code.
 *
 * Matching runs twice: first against the primary segment (the text before the
 * first qualifier — "Industrial (processing wooden electricity pole)" is an
 * industrial use, not an electricity one), then against the whole string so
 * nothing is lost when the primary segment carries no signal.
 */
export function classifyActivity(raw: string | null | undefined): ActivityCategoryCode {
  const normalized = normalizeActivityText(raw);
  if (!normalized) return ACTIVITY_NOT_SPECIFIED;

  const primary = (normalized.split(PRIMARY_SPLIT)[0] || "").trim();

  if (primary) {
    for (const rule of ACTIVITY_RULES) {
      if (ruleMatches(rule, primary)) return rule.code;
    }
  }
  for (const rule of ACTIVITY_RULES) {
    if (ruleMatches(rule, normalized)) return rule.code;
  }
  return ACTIVITY_OTHER;
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Postgres POSIX regex for one rule, mirroring `ruleMatches`. */
function rulePattern(rule: ActivityRule): string {
  const parts: string[] = [];
  for (const needle of rule.contains ?? []) {
    parts.push(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  for (const word of rule.words ?? []) {
    parts.push(`\\y${word}\\y`);
  }
  return parts.join("|");
}

/**
 * Build the Postgres expression that yields the canonical activity code for a
 * column holding raw registry activity text.
 *
 * `column` is interpolated directly, so only ever pass a trusted, code-defined
 * column reference (e.g. `pr.authorized_activity`) — never user input.
 */
export function activityCodeSqlExpression(column: string): string {
  const normalized = `regexp_replace(regexp_replace(lower(coalesce(${column}, '')), '[_-]+', ' ', 'g'), '\\s+', ' ', 'g')`;
  const trimmed = `btrim(${normalized})`;
  const primary = `btrim((regexp_split_to_array(${trimmed}, '\\(|,|;|/|&|:|\\s+and\\s+'))[1])`;

  const whens: string[] = [];
  for (const rule of ACTIVITY_RULES) {
    whens.push(`WHEN ${primary} ~ ${sqlLiteral(rulePattern(rule))} THEN ${sqlLiteral(rule.code)}`);
  }
  for (const rule of ACTIVITY_RULES) {
    whens.push(`WHEN ${trimmed} ~ ${sqlLiteral(rulePattern(rule))} THEN ${sqlLiteral(rule.code)}`);
  }

  return `CASE
      WHEN ${trimmed} = '' THEN ${sqlLiteral(ACTIVITY_NOT_SPECIFIED)}
      ${whens.join("\n      ")}
      ELSE ${sqlLiteral(ACTIVITY_OTHER)}
    END`;
}

/**
 * Postgres expression yielding the *display label* for a row's activity.
 *
 * Sorting has to happen on the label, not the code: the code `gaz_extraction`
 * displays as "Gas Extraction" and `industrial` as "Industry", so ordering by
 * code would show staff a column that looks unsorted.
 */
export function activityLabelSqlExpression(column: string): string {
  const codeExpr = activityCodeSqlExpression(column);
  const whens = ACTIVITY_CATEGORY_CODES.map(
    (code) => `WHEN ${sqlLiteral(code)} THEN ${sqlLiteral(getActivityCategoryLabel(code))}`
  );
  return `CASE (${codeExpr})
      ${whens.join("\n      ")}
      ELSE ${sqlLiteral(ACTIVITY_CATEGORY_LABELS[ACTIVITY_OTHER])}
    END`;
}

/** Options for the Activity dropdown, in display order. */
export function activityFilterOptions(): Array<{ value: string; label: string }> {
  return ACTIVITY_CATEGORY_CODES.map((code) => ({
    value: code,
    label: getActivityCategoryLabel(code),
  }));
}
