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

export function calculateDaysRemainingTo90DayDeadline(params: {
  submittedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
}): number | null {
  const submissionIso = params.submittedAt ?? params.createdAt;
  if (!submissionIso) return null;

  const submittedAtMs = new Date(submissionIso).getTime();
  if (Number.isNaN(submittedAtMs)) return null;

  const deadlineMs = submittedAtMs + 90 * MS_PER_DAY;
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
