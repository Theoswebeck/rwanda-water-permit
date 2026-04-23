/**
 * Hardened replacement for the per-page `runWithMissingColumnRetries`
 * that used to live inline in each inspection editor page.
 *
 * Behavior:
 *   - On success: returns the data immediately.
 *   - On a missing-column error reported by Postgres / PostgREST / our
 *     internal /api/internal/query guard:
 *       * If the value the editor was trying to send for that column is
 *         "empty" (null, undefined, "", [], {}), the column is silently
 *         dropped and the call retried (max 25 attempts, matching legacy
 *         behavior). This preserves partial-migration tolerance for
 *         optional fields that the user never touched.
 *       * Otherwise (non-empty content) the call THROWS with a clear
 *         user-facing message. We never silently lose user-typed
 *         content, ever.
 *
 * Returns the dropped column names in the success result so callers can
 * log them, but the success path no longer surfaces them in the UI —
 * that warning toast was a half-measure superseded by the hard-fail
 * behavior above.
 */

export interface SafePayloadRunResult<T> {
  data: T | null;
  error: unknown;
  /** Columns silently dropped because they were missing AND empty. */
  droppedColumns: string[];
}

export interface SafePayloadRetryOptions {
  /** Defaults to 25, matching legacy. */
  maxAttempts?: number;
  /**
   * Optional logger for dropped columns. Defaults to `console.warn`.
   * Set to `() => {}` in tests to silence.
   */
  onDropEmpty?: (column: string) => void;
}

/**
 * Treats the following as "empty" and therefore safe to silently drop
 * when the matching DB column does not exist:
 *
 *   - `null` / `undefined`
 *   - empty string
 *   - empty array
 *   - empty plain object
 *
 * Anything else (a non-empty string, number, boolean, populated array
 * or object) is considered user content and MUST NOT be silently lost.
 */
export function isEmptyPayloadValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Extract a missing-column name from any of the error shapes we know
 * how to recognize:
 *   - PostgREST schema cache: "Could not find the 'foo' column of 'inspections'..."
 *   - Postgres direct: 'column "foo" of relation "inspections" does not exist'
 *   - Postgres direct (short): 'column "foo" does not exist'
 *   - Our /api/internal/query guard: { code: 'UNKNOWN_COLUMN', column, table }
 */
export function extractMissingColumn(err: unknown, table = "inspections"): string | null {
  if (!err) return null;

  // Structured shape from /api/internal/query guard.
  const errAny = err as { code?: string; column?: string; table?: string };
  if (errAny.code === "UNKNOWN_COLUMN" && typeof errAny.column === "string") {
    if (!errAny.table || errAny.table === table) return errAny.column;
  }

  const msg = String((err as { message?: unknown })?.message ?? err ?? "");

  let m = msg.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
  if (m && (m[2] === table || m[2] === `public.${table}`)) return m[1];

  m = msg.match(/column ["']?([^"']+)["']? of relation ["']?([^"']+)["']? does not exist/i);
  if (m && (m[2] === table || m[2] === `public.${table}`)) return m[1];

  m = msg.match(/column ["']?([^"']+)["']? does not exist/i);
  if (m) return m[1];

  return null;
}

class InspectionPayloadColumnError extends Error {
  readonly column: string;
  constructor(column: string) {
    super(
      `Cannot save: the database is missing column \`${column}\` but you've ` +
        `entered content for it. Your changes were NOT persisted. ` +
        `Please contact an administrator to apply the latest database migrations.`,
    );
    this.name = "InspectionPayloadColumnError";
    this.column = column;
  }
}

/**
 * The minimal shape of the Supabase / shim response the helper needs to
 * inspect. Other fields (e.g. `count`, `status`) are ignored.
 */
type RunResponse = { data: unknown; error: unknown };

/**
 * Run a save against the inspections table with hardened
 * missing-column handling. See module docstring for behavior contract.
 *
 * `T` describes the shape of `data` returned by the wrapped call (e.g.
 * `{ id: string }` for an `.insert(...).select("id").single()`). The
 * helper itself doesn't validate the shape — it forwards whatever the
 * run callback returns and just narrows the static type for callers.
 */
export async function runInspectionSaveWithSafetyNet<T>(
  run: (payload: Record<string, unknown>) => Promise<RunResponse>,
  initialPayload: Record<string, unknown>,
  options: SafePayloadRetryOptions = {},
): Promise<SafePayloadRunResult<T>> {
  const maxAttempts = options.maxAttempts ?? 25;
  const onDropEmpty = options.onDropEmpty ?? ((col) => console.warn(
    `⚠️ Inspections schema missing column '${col}' but value was empty — ` +
      `silently dropping this key and retrying. Apply the latest migration to silence this warning.`,
  ));

  let current = { ...initialPayload };
  const dropped: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await run(current);
    if (!error) {
      return { data: (data as T | null) ?? null, error: null, droppedColumns: dropped };
    }

    lastError = error;
    const missing = extractMissingColumn(error);
    if (!missing || !(missing in current)) {
      // Not a missing-column error, or it's a column we already removed.
      return { data: null, error, droppedColumns: dropped };
    }

    const value = current[missing];
    if (!isEmptyPayloadValue(value)) {
      // The user typed real content into this field. Do NOT silently drop.
      throw new InspectionPayloadColumnError(missing);
    }

    onDropEmpty(missing);
    dropped.push(missing);
    const { [missing]: _omitted, ...rest } = current;
    void _omitted;
    current = rest;
  }

  return { data: null, error: lastError, droppedColumns: dropped };
}

export { InspectionPayloadColumnError };
