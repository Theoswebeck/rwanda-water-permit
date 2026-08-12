/**
 * Shared application sorting utilities.
 *
 * Note: This is intentionally split out from `lib/utils.ts` to avoid any bundler/module
 * resolution edge-cases and to keep app listing behavior consistent across staff views.
 */
/**
 * Latest (re)submission date for an application.
 *
 * When an application is returned for revision and the applicant resubmits,
 * `resubmitted_at` records that latest submission while `submitted_at` keeps
 * the original one (it drives the 6-month expiration window and audit trail).
 * All listing/detail displays and date sorting must use this helper so staff
 * always see the most recent submission. Tolerates the `resubmitted_at`
 * column not existing yet (falls back to submitted_at, then created_at).
 */
export function getEffectiveSubmissionDate(app: {
  resubmitted_at?: string | null
  submitted_at?: string | null
  created_at?: string | null
}): string | null | undefined {
  return app.resubmitted_at || app.submitted_at || app.created_at
}

export function sortBySubmissionDateDescending<T>(
  items: T[],
  getSubmissionDate: (item: T) => string | null | undefined
): T[] {
  return [...items].sort((a, b) => {
    const aDate = getSubmissionDate(a)
    const bDate = getSubmissionDate(b)

    // Handle null/undefined dates - push them to the end
    if (!aDate && !bDate) return 0
    if (!aDate) return 1
    if (!bDate) return -1

    // Sort descending (newest first)
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
}

