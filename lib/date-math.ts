/**
 * Add `years` to a date, clamping to the last day of the target month when
 * the source day does not exist in the target month (e.g. Feb 29 + 1y → Feb 28).
 *
 * Handles the Feb-29 + N-year case that `Date.setFullYear()` gets wrong: the
 * browser/node Date API silently rolls Feb 29 forward to Mar 1 in non-leap
 * target years. For permit validity math we want the last day of February
 * instead (matches civil/legal convention).
 */
export function addYearsSafe(date: Date, years: number): Date {
  const y = date.getFullYear() + years;
  const m = date.getMonth();
  const d = date.getDate();
  // Day 0 of (m+1) = last day of month m. JS trick for days-in-month.
  const daysInTargetMonth = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, daysInTargetMonth));
}
