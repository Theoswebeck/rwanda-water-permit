/**
 * Single source of truth for the permit "issuance date" shown in every
 * preview, every final PDF, and every registry sync.
 *
 * Same rule for **all** application types (new / renewal / modification /
 * transfer):
 *
 *   1. If the permit row has its own `issued_date`, use it. Once a permit
 *      has been issued the date never moves silently — that's the locked
 *      legal value the registry stores.
 *
 *   2. Else if the application's `terms_accepted_at` is set, use it. The
 *      relevant party (applicant or transferee) has signed the terms;
 *      issuance is happening now and we lock to that signing instant even
 *      if the `permits.issued_date` write is in flight.
 *
 *   3. Else use today. The permit is still in preview / pending acceptance
 *      — every render shows the current calendar day so a stale assessor
 *      preview from a previous day cannot leak through into the legal
 *      validity paragraphs or the closing date line.
 *
 * Important: this helper only deals with the **rendered** issuance date.
 * It never writes the database — the writes happen at `terms-accepted`
 * time in `app/dashboard/application/[id]/terms/page.tsx`. This module
 * exists so every read path agrees on what date to show, regardless of
 * application type.
 */

export type IssueDateInputs = {
  /**
   * `permits.issued_date` for the permit row. May be ISO date-only
   * (`YYYY-MM-DD`), full ISO timestamp, or a `Date`. Null/undefined when
   * the permit has not been issued yet.
   */
  permitIssuedDate?: string | Date | null | undefined;
  /**
   * `applications.terms_accepted_at` for the originating application. May
   * be ISO date-only, full ISO timestamp, or a `Date`. Null/undefined when
   * the relevant party has not yet accepted terms.
   */
  termsAcceptedAt?: string | Date | null | undefined;
  /**
   * Override for `Date.now()`. Tests pass a deterministic clock; production
   * callers leave this undefined.
   */
  now?: () => Date;
};

export function resolvePermitIssueDate(input: IssueDateInputs): Date {
  const lockedFromPermit = parseFlexible(input.permitIssuedDate);
  if (lockedFromPermit) return lockedFromPermit;

  const lockedFromTerms = parseFlexible(input.termsAcceptedAt);
  if (lockedFromTerms) return lockedFromTerms;

  return (input.now ?? (() => new Date()))();
}

/**
 * Parses any of the date shapes `permits.issued_date` /
 * `applications.terms_accepted_at` can take in this codebase:
 *
 *   - `Date` instance
 *   - Date-only string `YYYY-MM-DD`            (interpreted as UTC midnight)
 *   - ISO timestamp `YYYY-MM-DDTHH:MM:SS...Z`  (parsed verbatim)
 *   - US date-picker `MM/DD/YYYY`              (interpreted as UTC midnight)
 *
 * Returns null for anything else so the resolver can fall through to the
 * next layer instead of producing `Invalid Date` and rendering "NaN/NaN/NaN".
 */
function parseFlexible(value: string | Date | null | undefined): Date | null {
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
    const dt = new Date(
      Date.UTC(Number(ye), Number(mo) - 1, Number(da)),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
