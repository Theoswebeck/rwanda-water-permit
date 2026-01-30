import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calculate days remaining until the 90-day processing deadline.
 * 
 * The 90-day countdown starts from when the assessor clicks "Confirm Completeness and Lock",
 * NOT from when the application was submitted. This is stored in `completeness_confirmed_at`.
 * 
 * @param params.completenessConfirmedAt - Timestamp when completeness was confirmed (triggers 90-day countdown)
 * @param params.now - Optional current date for testing
 * @returns Number of days remaining (can be negative if overdue), or null if countdown hasn't started
 */
export function calculateDaysRemainingTo90DayDeadline(params: {
  completenessConfirmedAt?: string | null;
  now?: Date;
}): number | null {
  // If completeness hasn't been confirmed yet, the 90-day countdown hasn't started
  if (!params.completenessConfirmedAt) return null;

  const confirmedAtMs = new Date(params.completenessConfirmedAt).getTime();
  if (Number.isNaN(confirmedAtMs)) return null;

  const deadlineMs = confirmedAtMs + 90 * MS_PER_DAY;
  const nowMs = (params.now ?? new Date()).getTime();
  const diffMs = deadlineMs - nowMs;

  // Ceil ensures anything due later today shows as 1 day remaining, and overdue shows 0 or negative.
  return Math.ceil(diffMs / MS_PER_DAY);
}

export function sortBy90DayDeadlineClosest<T>(items: T[], getDaysRemaining: (item: T) => number | null) {
  return [...items].sort((a, b) => {
    const aDays = getDaysRemaining(a);
    const bDays = getDaysRemaining(b);

    if (aDays === null && bDays === null) return 0;
    if (aDays === null) return 1;
    if (bDays === null) return -1;

    // Lower days remaining = closer to / past deadline (overdue first)
    return aDays - bDays;
  });
}

/**
 * Sort applications by submission date in descending order (latest first).
 * 
 * @param items - Array of items to sort
 * @param getSubmissionDate - Function to extract submission date from each item
 * @returns Sorted array with newest submissions first
 */
export function sortBySubmissionDateDescending<T>(items: T[], getSubmissionDate: (item: T) => string | null | undefined) {
  return [...items].sort((a, b) => {
    const aDate = getSubmissionDate(a);
    const bDate = getSubmissionDate(b);

    // Handle null/undefined dates - push them to the end
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;

    // Sort descending (newest first)
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}
