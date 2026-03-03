const WATER_USE_REPORT_JSONB_COLUMNS = new Set<string>([
  'section3',
  'section3_quarterly',
  'section4',
  'section5_monitoring',
  'section5_incidents',
  'section6_employment',
  'section6_ohs',
  'section7',
  'section8',
  'section9_declaration',
])

function toDbValue(column: string, value: unknown): unknown {
  if (!WATER_USE_REPORT_JSONB_COLUMNS.has(column)) return value
  return JSON.stringify(value ?? null)
}

export function buildWaterUseReportInsertParts(payload: Record<string, unknown>): {
  columns: string[]
  placeholders: string[]
  values: unknown[]
} {
  const columns = Object.keys(payload)
  const placeholders: string[] = []
  const values: unknown[] = []

  columns.forEach((column, index) => {
    const isJsonbColumn = WATER_USE_REPORT_JSONB_COLUMNS.has(column)
    placeholders.push(isJsonbColumn ? `$${index + 1}::jsonb` : `$${index + 1}`)
    values.push(toDbValue(column, payload[column]))
  })

  return { columns, placeholders, values }
}

export function buildWaterUseReportUpdateParts(payload: Record<string, unknown>): {
  sets: string[]
  values: unknown[]
} {
  const keys = Object.keys(payload)
  const sets: string[] = []
  const values: unknown[] = []

  keys.forEach((key, index) => {
    const isJsonbColumn = WATER_USE_REPORT_JSONB_COLUMNS.has(key)
    sets.push(isJsonbColumn ? `${key} = $${index + 1}::jsonb` : `${key} = $${index + 1}`)
    values.push(toDbValue(key, payload[key]))
  })

  return { sets, values }
}
