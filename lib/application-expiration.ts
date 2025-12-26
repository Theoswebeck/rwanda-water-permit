import type { Application } from '@/types/database'

export type ExpirationDecision = {
  isExpired: boolean
  submittedAt: Date | null
  expiresAt: Date | null
}

function addMonthsUTC(date: Date, months: number) {
  // JS Date month math is well-defined; we just need to do it in a stable way.
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // If the target month doesn't have the same day (e.g., Jan 31 + 1 month),
  // Date will roll into the next month. Clamp back to last day of target month.
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0)
  }
  return d
}

export function getApplicationExpiration(params: {
  submitted_at?: Application['submitted_at'] | null
  hasPermit: boolean
  now?: Date
}): ExpirationDecision {
  const now = params.now ?? new Date()
  const submittedAt = params.submitted_at ? new Date(params.submitted_at) : null

  if (!submittedAt || Number.isNaN(submittedAt.getTime())) {
    return { isExpired: false, submittedAt: null, expiresAt: null }
  }

  const expiresAt = addMonthsUTC(submittedAt, 6)
  const isExpired = !params.hasPermit && now.getTime() > expiresAt.getTime()
  return { isExpired, submittedAt, expiresAt }
}




