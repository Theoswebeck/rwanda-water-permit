import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

type Filter = {
  op: 'eq' | 'neq' | 'in' | 'ilike' | 'lt' | 'gt' | 'lte' | 'gte' | 'not' | 'or'
  column?: string
  value?: unknown
  values?: unknown[]
  notOperator?: string
}

type Order = { column: string; ascending?: boolean; nullsFirst?: boolean }

function isSafeIdent(value: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
}

function quoteIdent(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

const JSONB_COLUMNS_BY_TABLE: Record<string, Set<string>> = {
  applications: new Set([
    'affected_landowners',
    'recreation_details',
    'intersection_details',
    'intended_activities',
    'modification_changes',
  ]),
  audit_logs: new Set(['old_values', 'new_values']),
  inspections: new Set([
    'gps_data',
    'authorized_concession_boundaries',
    'actual_concession_boundaries',
    'employment_gender_breakdown',
    'ohs_gender_sensitive',
    'inspection_documents',
  ]),
  payment_transactions: new Set(['provider_response']),
  payments: new Set(['gateway_response', 'gateway_metadata']),
  permits: new Set(['conditions']),
  system_settings: new Set(['value']),
  technical_assessments: new Set(['document_verifications', 'assessment_report_data']),
  users: new Set(['alternative_contact']),
  water_use_reports: new Set([
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
  ]),
  webhook_logs: new Set(['payload', 'headers']),
}

function isJsonbColumn(table: string, column: string): boolean {
  return Boolean(JSONB_COLUMNS_BY_TABLE[table]?.has(column))
}

function toJsonbParamValue(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(value)
    }
  }
  return JSON.stringify(value)
}

function buildBaseSelect(table: string, requestedSelect?: string) {
  if (table === 'applications') {
    const wantsDocuments = requestedSelect?.includes('documents(') ?? false
    const wantsReviews = requestedSelect?.includes('reviews:') || requestedSelect?.includes('reviews(') || false
    return `
      select
        a.*,
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'company_name', u.company_name,
          'email', u.email,
          'phone', u.phone,
          'account_type', u.account_type,
          'id_number', u.id_number,
          'id_type', u.id_type,
          'company_tin', u.company_tin,
          'address', u.address
        ) as applicant
        ${wantsDocuments ? `,
        coalesce(
          (
            select json_agg(d order by d.created_at desc)
            from public.documents d
            where d.application_id = a.id
          ),
          '[]'::json
        ) as documents
        ` : ''}
        ${wantsReviews ? `,
        coalesce(
          (
            select json_agg(r order by r.created_at desc)
            from public.reviews r
            where r.application_id = a.id
          ),
          '[]'::json
        ) as reviews
        ` : ''}
      from public.applications a
      left join public.users u on u.id = a.applicant_id
    `
  }
  if (table === 'inspections') {
    if (requestedSelect?.includes('application:')) {
      return `
        select
          i.*,
          row_to_json(a) as application,
          jsonb_build_object(
            'first_name', au.first_name,
            'last_name', au.last_name,
            'company_name', au.company_name,
            'email', au.email,
            'phone', au.phone,
            'account_type', au.account_type,
            'id_number', au.id_number,
            'id_type', au.id_type,
            'company_tin', au.company_tin,
            'address', au.address
          ) as applicant,
          jsonb_build_object(
            'first_name', iu.first_name,
            'last_name', iu.last_name,
            'email', iu.email
          ) as inspector
        from public.inspections i
        left join public.applications a on a.id = i.application_id
        left join public.users au on au.id = a.applicant_id
        left join public.users iu on iu.id = i.inspector_id
      `
    }
    return `select i.* from public.inspections i`
  }
  if (table === 'permits') {
    return `
      select
        p.*,
        row_to_json(a) as application,
        jsonb_build_object(
          'first_name', u.first_name,
          'last_name', u.last_name,
          'company_name', u.company_name,
          'email', u.email,
          'phone', u.phone,
          'mobile_phone', u.mobile_phone,
          'landline_phone', u.landline_phone,
          'company_phone', u.company_phone,
          'account_type', u.account_type,
          'id_number', u.id_number,
          'id_type', u.id_type,
          'company_tin', u.company_tin,
          'address', u.address
        ) as applicant
      from public.permits p
      left join public.applications a on a.id = p.application_id
      left join public.users u on u.id = a.applicant_id
    `
  }
  if (table === 'water_use_reports') {
    const wantsRelations = requestedSelect?.includes('permit') || requestedSelect?.includes('application') || requestedSelect?.includes('applicant')
    if (wantsRelations) {
      return `
        select
          wur.*,
          row_to_json(p) as permit,
          row_to_json(a) as application,
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name,
            'company_name', u.company_name,
            'email', u.email
          ) as applicant
        from public.water_use_reports wur
        left join public.permits p on p.id = wur.permit_id
        left join public.applications a on a.id = wur.application_id
        left join public.users u on u.id = wur.applicant_id
      `
    }
    return `select wur.* from public.water_use_reports wur`
  }
  return `select t.* from public.${quoteIdent(table)} t`
}

function tableAlias(table: string) {
  if (table === 'applications') return 'a'
  if (table === 'inspections') return 'i'
  if (table === 'permits') return 'p'
  if (table === 'water_use_reports') return 'wur'
  return 't'
}

function parseOrExpression(orExpr: string, alias: string, params: unknown[], startAt: number) {
  const parts = orExpr.split(',').map((s) => s.trim()).filter(Boolean)
  const sqlParts: string[] = []
  let idx = startAt
  for (const p of parts) {
    const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|ilike|gt|lt|gte|lte|is)\.(.+)$/)
    if (!m) continue
    const [, col, op, rawVal] = m
    if (!isSafeIdent(col)) continue
    const colExpr = alias ? `${alias}.${quoteIdent(col)}` : quoteIdent(col)
    if (op === 'is' && rawVal === 'null') {
      sqlParts.push(`${colExpr} is null`)
      continue
    }
    params.push(rawVal)
    const ph = `$${idx++}`
    const opSql =
      op === 'eq' ? '=' :
      op === 'neq' ? '!=' :
      op === 'ilike' ? 'ilike' :
      op === 'gt' ? '>' :
      op === 'lt' ? '<' :
      op === 'gte' ? '>=' :
      op === 'lte' ? '<=' : '='
    sqlParts.push(`${colExpr} ${opSql} ${ph}`)
  }
  return { sql: sqlParts.length ? `(${sqlParts.join(' or ')})` : '', nextIdx: idx }
}

export async function POST(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: 'select' | 'insert' | 'update' | 'delete'
      table?: string
      select?: string
      options?: { count?: 'exact'; head?: boolean }
      filters?: Filter[]
      orders?: Order[]
      limit?: number
      rangeFrom?: number
      rangeTo?: number
      payload?: Record<string, unknown> | Record<string, unknown>[]
      singleMode?: 'single' | 'maybeSingle'
    }

    const action = body.action
    const table = body.table || ''
    if (!action || !isSafeIdent(table)) {
      return NextResponse.json({ error: { message: 'Invalid request' } }, { status: 400 })
    }

    const allowedTables = new Set([
      'applications',
      'users',
      'documents',
      'inspections',
      'reviews',
      'permits',
      'workflow_history',
      'audit_logs',
      'role_delegations',
      'water_use_reports',
      'payments',
      'payment_transactions',
      'permit_registry',
      'phone_verification_logs',
      'notifications',
      'staff_assignments',
      'assessment_reports',
      'contracts',
      'system_settings',
      'application_status_history',
      'application_comments',
      'application_reviews',
      'application_verifications',
      'inspection_reports',
      'transfer_requests',
      'application_documents',
      'technical_assessments',
      'portal_feedback',
      'inspection_workflow_history',
      'water_use_report_workflow_history',
    ])
    if (!allowedTables.has(table)) {
      return NextResponse.json({ error: { message: `Table not allowed: ${table}` } }, { status: 400 })
    }

    if (action === 'insert') {
      const rows = Array.isArray(body.payload) ? body.payload : [body.payload || {}]
      if (!rows.length) return NextResponse.json({ data: null, error: { message: 'Missing payload' } }, { status: 400 })
      const row = rows[0] as Record<string, unknown>
      const keys = Object.keys(row).filter(isSafeIdent)
      const vals = keys.map((k) => (isJsonbColumn(table, k) ? toJsonbParamValue(row[k]) : row[k]))
      const ph = keys.map((k, i) => (isJsonbColumn(table, k) ? `$${i + 1}::jsonb` : `$${i + 1}`))
      const sql = `insert into public.${quoteIdent(table)} (${keys.map(quoteIdent).join(', ')}) values (${ph.join(', ')}) returning *`
      const res = await query(sql, vals)
      const data = body.singleMode ? (res.rows[0] || null) : res.rows
      return NextResponse.json({ data, error: null })
    }

    const alias = tableAlias(table)
    const useAliasedColumns = action === 'select'
    const columnPrefix = useAliasedColumns ? `${alias}.` : ''
    const filters = body.filters || []
    const orders = body.orders || []
    const where: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const f of filters) {
      if (f.op === 'or' && typeof f.value === 'string') {
        const parsed = parseOrExpression(String(f.value), useAliasedColumns ? alias : '', params, idx)
        idx = parsed.nextIdx
        if (parsed.sql) where.push(parsed.sql)
        continue
      }
      if (!f.column || !isSafeIdent(f.column)) continue
      const col = `${columnPrefix}${quoteIdent(f.column)}`
      if (f.op === 'eq') {
        params.push(f.value); where.push(`${col} = $${idx++}`)
      } else if (f.op === 'neq') {
        params.push(f.value); where.push(`${col} != $${idx++}`)
      } else if (f.op === 'in') {
        params.push(f.values || []); where.push(`${col} = any($${idx++})`)
      } else if (f.op === 'ilike') {
        params.push(f.value); where.push(`${col} ilike $${idx++}`)
      } else if (f.op === 'lt') {
        params.push(f.value); where.push(`${col} < $${idx++}`)
      } else if (f.op === 'gt') {
        params.push(f.value); where.push(`${col} > $${idx++}`)
      } else if (f.op === 'lte') {
        params.push(f.value); where.push(`${col} <= $${idx++}`)
      } else if (f.op === 'gte') {
        params.push(f.value); where.push(`${col} >= $${idx++}`)
      } else if (f.op === 'not') {
        if (f.notOperator === 'is' && f.value === null) where.push(`${col} is not null`)
      }
    }

    const whereSql = where.length ? ` where ${where.join(' and ')}` : ''

    if (action === 'update') {
      const payload = (body.payload || {}) as Record<string, unknown>
      const keys = Object.keys(payload).filter(isSafeIdent)
      if (!keys.length) return NextResponse.json({ data: null, error: { message: 'Missing update payload' } }, { status: 400 })
      const setClauses: string[] = []
      const setVals: unknown[] = []
      for (const k of keys) {
        const value = isJsonbColumn(table, k) ? toJsonbParamValue(payload[k]) : payload[k]
        setVals.push(value)
        const placeholder = isJsonbColumn(table, k) ? `$${setVals.length}::jsonb` : `$${setVals.length}`
        setClauses.push(`${quoteIdent(k)} = ${placeholder}`)
      }
      const whereWithShift = where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + keys.length}`))
      const sql = `
        update public.${quoteIdent(table)}
        set ${setClauses.join(', ')}
        ${whereWithShift.length ? `where ${whereWithShift.join(' and ')}` : ''}
        returning *
      `
      const res = await query(sql, [...setVals, ...params])
      const data = body.singleMode ? (res.rows[0] || null) : res.rows
      return NextResponse.json({ data, error: null })
    }

    if (action === 'delete') {
      const sql = `delete from public.${quoteIdent(table)}${whereSql} returning *`
      const res = await query(sql, params)
      const data = body.singleMode ? (res.rows[0] || null) : res.rows
      return NextResponse.json({ data, error: null })
    }

    const baseSql = buildBaseSelect(table, body.select)
    const orderSql = orders
      .filter((o) => isSafeIdent(o.column))
      .map((o) => `${alias}.${quoteIdent(o.column)} ${o.ascending === false ? 'desc' : 'asc'}${o.nullsFirst === true ? ' nulls first' : o.nullsFirst === false ? ' nulls last' : ''}`)
      .join(', ')
    const limit = typeof body.limit === 'number' ? body.limit : undefined
    const hasRange = typeof body.rangeFrom === 'number' && typeof body.rangeTo === 'number'
    const rangeLimit = hasRange ? (body.rangeTo! - body.rangeFrom! + 1) : undefined
    const finalLimit = rangeLimit ?? limit
    const offset = hasRange ? body.rangeFrom : undefined
    const paginationSql = `${finalLimit != null ? ` limit ${Math.max(0, finalLimit)}` : ''}${offset != null ? ` offset ${Math.max(0, offset)}` : ''}`
    const sql = `${baseSql}${whereSql}${orderSql ? ` order by ${orderSql}` : ''}${paginationSql}`
    const res = await query(sql, params)

    const countRequested = body.options?.count === 'exact'
    let count: number | null = null
    if (countRequested) {
      const countSql = `select count(*)::int as c from public.${quoteIdent(table)} ${alias}${whereSql}`
      const countRes = await query<{ c: number }>(countSql, params)
      count = countRes.rows[0]?.c ?? 0
    }

    const dataRows = res.rows
    const headOnly = body.options?.head === true
    let data: unknown = headOnly ? null : dataRows
    if (!headOnly && body.singleMode === 'single') {
      if (dataRows.length !== 1) {
        return NextResponse.json({ data: null, error: { message: 'Expected single row' }, count })
      }
      data = dataRows[0]
    } else if (!headOnly && body.singleMode === 'maybeSingle') {
      data = dataRows[0] || null
    }

    return NextResponse.json({ data, error: null, count })
  } catch (error) {
    console.error('internal/query error:', error)
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
