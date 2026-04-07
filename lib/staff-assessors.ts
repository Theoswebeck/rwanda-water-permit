export type StaffAssessorOption = {
  id: string
  first_name: string
  last_name: string
  role: string
  email: string
}

type AssessorOptionsResponse = {
  success?: boolean
  message?: string
  data?: StaffAssessorOption[]
}

export async function fetchAssessorOptions(): Promise<StaffAssessorOption[]> {
  const response = await fetch('/api/staff/assessors/options', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  const payload = (await response.json().catch(() => null)) as AssessorOptionsResponse | null
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Failed to load assessors')
  }

  if (!Array.isArray(payload.data)) return []

  return payload.data
    .filter((row): row is Partial<StaffAssessorOption> & { id: string } => typeof row?.id === 'string' && row.id.length > 0)
    .map((row) => ({
      id: row.id,
      first_name: String(row.first_name ?? ''),
      last_name: String(row.last_name ?? ''),
      role: String(row.role ?? ''),
      email: String(row.email ?? ''),
    }))
}
