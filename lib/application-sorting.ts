/**
 * Shared application sorting utilities.
 *
 * Note: This is intentionally split out from `lib/utils.ts` to avoid any bundler/module
 * resolution edge-cases and to keep app listing behavior consistent across staff views.
 */
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

