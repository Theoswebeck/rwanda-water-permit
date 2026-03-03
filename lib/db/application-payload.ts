const APPLICATION_JSONB_COLUMNS = new Set<string>([
  'affected_landowners',
  'recreation_details',
  'intersection_details',
  'intended_activities',
  'modification_changes',
])

function toDbValue(column: string, value: unknown): unknown {
  if (!APPLICATION_JSONB_COLUMNS.has(column)) return value
  return JSON.stringify(value ?? null)
}

export function buildApplicationInsertParts(payload: Record<string, unknown>): {
  columns: string[]
  placeholders: string[]
  values: unknown[]
} {
  const columns = Object.keys(payload)
  const placeholders: string[] = []
  const values: unknown[] = []

  columns.forEach((column, index) => {
    const isJsonbColumn = APPLICATION_JSONB_COLUMNS.has(column)
    placeholders.push(isJsonbColumn ? `$${index + 1}::jsonb` : `$${index + 1}`)
    values.push(toDbValue(column, payload[column]))
  })

  return { columns, placeholders, values }
}

export function buildApplicationUpdateParts(payload: Record<string, unknown>): {
  sets: string[]
  values: unknown[]
} {
  const keys = Object.keys(payload)
  const sets: string[] = []
  const values: unknown[] = []

  keys.forEach((key, index) => {
    const isJsonbColumn = APPLICATION_JSONB_COLUMNS.has(key)
    sets.push(isJsonbColumn ? `${key} = $${index + 1}::jsonb` : `${key} = $${index + 1}`)
    values.push(toDbValue(key, payload[key]))
  })

  return { sets, values }
}
