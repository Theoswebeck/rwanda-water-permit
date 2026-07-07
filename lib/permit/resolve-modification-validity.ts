/**
 * Single source of truth for a **modification** permit's validity window.
 *
 * A modification amends a permit's *terms* (volume, water source, purpose,
 * conditions) — it never resets the validity window. The permit keeps its
 * original `issued_date` and `expiry_date`. This is the opposite of a
 * renewal, which deliberately starts a fresh N-year window from today.
 *
 * The original dates can live in several places depending on how the permit
 * was captured. Callers pass every candidate source they can find, in
 * priority order, and this helper returns the first one that carries a real
 * expiry date:
 *
 *   1. `public.permits` row            (linked / digital permits)
 *   2. `public.permit_registry` row    (the authoritative registry)
 *   3. `notes.permitReference.registrySnapshot` (captured at creation)
 *   4. legacy `notes.transferFormData` dates
 *
 * Crucially, a *duration in years* is NOT a valid source — feeding a duration
 * back through `issueDate + N years` is exactly the "treated like a new
 * permit" bug this helper exists to prevent. If no source has an expiry the
 * helper returns `{ issuedDate: null, expiryDate: null }` so the caller makes
 * a deliberate fallback decision rather than silently drifting to today.
 *
 * This module is intentionally dependency-free so it can be unit-tested in
 * isolation (see scripts/test-modification-validity.mjs).
 */

export type RawPermitDate = string | Date | null | undefined;

export type ValiditySource = {
  issued?: RawPermitDate;
  expiry?: RawPermitDate;
};

export type ResolvedValidity = {
  issuedDate: Date | null;
  expiryDate: Date | null;
};

/**
 * Parse any of the date shapes this codebase stores:
 *   - `Date` instance
 *   - date-only `YYYY-MM-DD`            (interpreted as UTC midnight)
 *   - ISO timestamp `YYYY-MM-DDTHH:MM:SSZ`
 *   - US date-picker `MM/DD/YYYY`       (interpreted as UTC midnight)
 * Returns null for anything unparseable.
 */
export function parsePermitDate(value: RawPermitDate): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (usDate) {
    const [, mo, da, ye] = usDate;
    const dt = new Date(Date.UTC(Number(ye), Number(mo) - 1, Number(da)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // Reject strings with no 4-digit year so obvious non-dates fall through
  // instead of producing an Invalid Date. (A leading YYYY-MM-DD always
  // contains a 4-digit run, so this single test also covers that case.)
  if (!/\d{4}/.test(trimmed)) {
    return null;
  }

  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Return the original validity window for a modification. `issuedDate` and
 * `expiryDate` are resolved independently: each takes the value from the
 * highest-priority source that carries a parseable date for that field. This
 * matters when the sources are complementary — e.g. the linked permit row has
 * the issue date but a later registry snapshot is the one holding the expiry;
 * we keep both rather than discarding the earlier issue date. All sources
 * describe the same original permit, so mixing fields across them is safe.
 * Returns nulls for any field no source can supply.
 */
export function resolveModificationValidity(
  sources: ValiditySource[],
): ResolvedValidity {
  let issuedDate: Date | null = null;
  let expiryDate: Date | null = null;
  for (const source of sources) {
    if (!issuedDate) issuedDate = parsePermitDate(source.issued);
    if (!expiryDate) expiryDate = parsePermitDate(source.expiry);
    if (issuedDate && expiryDate) break;
  }
  return { issuedDate, expiryDate };
}
