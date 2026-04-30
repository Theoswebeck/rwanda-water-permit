import { query } from "@/lib/db/postgres";

export type RegistrySchema = {
  hasRegistry: boolean;
  hasDocColumns: boolean;
  hasRawDateColumns: boolean;
  hasRowIndex: boolean;
  hasDeletedAt: boolean;
  hasManuallyEditedAt: boolean;
  hasPostGIS: boolean;
  hasDocumentsTable: boolean;
};

export type RegistrySummary = {
  total: number;
  operational: number;
  expired: number;
  cancelled: number;
  expiringSoon: number;
  regimeTypes: number;
};

export type RegistryListFilters = {
  q?: string;
  regime?: string;
  status?: string;
  waterSource?: string;
  authorizedActivity?: string;
};

export type RegistryWhere = { sql: string; values: unknown[] };

export async function detectRegistrySchema(): Promise<RegistrySchema> {
  const [tablesRes, extRes] = await Promise.all([
    query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name = 'permit_registry'`
    ),
    query<{ n: string }>(
      `select count(*)::text as n from pg_extension where extname = 'postgis'`
    ),
  ]);

  const hasRegistry = tablesRes.rows.some((r: { table_name: string }) => r.table_name === "permit_registry");

  let hasDocColumns = false;
  let hasRawDateColumns = false;
  let hasRowIndex = false;
  let hasDeletedAt = false;
  let hasManuallyEditedAt = false;

  if (hasRegistry) {
    const colRes = await query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'permit_registry'
         and column_name in (
           'uploaded_doc_path','uploaded_doc_name',
           'uploaded_doc_mime_type','uploaded_doc_uploaded_at',
           'issuance_date_raw','expiration_date_raw',
           'row_index',
           'deleted_at',
           'manually_edited_at'
         )`
    );
    const cols = new Set(colRes.rows.map((r: { column_name: string }) => r.column_name));
    hasDocColumns = cols.has("uploaded_doc_path") && cols.has("uploaded_doc_name") &&
                    cols.has("uploaded_doc_mime_type") && cols.has("uploaded_doc_uploaded_at");
    hasRawDateColumns = cols.has("issuance_date_raw") && cols.has("expiration_date_raw");
    hasRowIndex = cols.has("row_index");
    hasDeletedAt = cols.has("deleted_at");
    hasManuallyEditedAt = cols.has("manually_edited_at");
  }

  const docsTableRes = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'permit_registry_documents' LIMIT 1`
  );
  const hasDocumentsTable = docsTableRes.rows.length > 0;

  return {
    hasRegistry,
    hasDocColumns,
    hasRawDateColumns,
    hasRowIndex,
    hasDeletedAt,
    hasManuallyEditedAt,
    hasPostGIS: Number(extRes.rows[0]?.n || "0") > 0,
    hasDocumentsTable,
  };
}

export function buildRegistryWhere(
  schema: RegistrySchema,
  filters: RegistryListFilters
): RegistryWhere {
  const where: string[] = [];
  const values: unknown[] = [];
  const p = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (schema.hasDeletedAt) {
    where.push("pr.deleted_at is null");
  }

  const regime = filters.regime;
  if (regime && regime !== "all") {
    where.push(`lower(coalesce(pr.regime, '')) = lower(${p(regime)})`);
  }

  const status = filters.status;
  if (status && status !== "all") {
    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus === "__ACTIVE__") {
      where.push(
        `(upper(coalesce(pr.status, '')) like '%OPERATIONAL%' or (upper(coalesce(pr.status, '')) like '%ACTIVE%' and upper(coalesce(pr.status, '')) not like '%INACTIVE%')) and upper(coalesce(pr.status, '')) not like '%NON-OPERATIONAL%' and upper(coalesce(pr.status, '')) not like '%NON OPERATIONAL%'`
      );
    } else if (normalizedStatus === "__EXPIRED__") {
      where.push(`upper(coalesce(pr.status, '')) like '%EXPIRED%'`);
    } else if (normalizedStatus === "__CANCELLED__") {
      where.push(`upper(coalesce(pr.status, '')) like '%CANCEL%' and upper(coalesce(pr.status, '')) not like '%EXPIRED%'`);
    } else if (normalizedStatus === "__ABOUT_TO_EXPIRE__") {
      where.push(
        `pr.expiration_date is not null and pr.expiration_date >= current_date and pr.expiration_date <= (current_date + interval '3 months')`
      );
    } else {
      where.push(`upper(coalesce(pr.status, '')) = ${p(normalizedStatus)}`);
    }
  }

  const q = filters.q?.trim().toLowerCase();
  if (q) {
    const term = `%${q}%`;
    const pv = p(term);
    where.push(
      `(lower(coalesce(pr.permit_holder, '')) like ${pv} or lower(coalesce(pr.permit_number, '')) like ${pv} or lower(coalesce(pr.location, '')) like ${pv} or lower(coalesce(pr.water_source, '')) like ${pv} or lower(coalesce(pr.authorized_activity, '')) like ${pv})`
    );
  }

  if (filters.waterSource && filters.waterSource !== "all") {
    where.push(`lower(coalesce(pr.water_source, '')) = lower(${p(filters.waterSource)})`);
  }

  if (filters.authorizedActivity && filters.authorizedActivity !== "all") {
    where.push(`lower(coalesce(pr.authorized_activity, '')) = lower(${p(filters.authorizedActivity)})`);
  }

  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values,
  };
}

export async function fetchRegistrySummary(
  schema: RegistrySchema,
  filters: RegistryListFilters
): Promise<RegistrySummary> {
  if (!schema.hasRegistry) {
    return { total: 0, operational: 0, expired: 0, cancelled: 0, expiringSoon: 0, regimeTypes: 0 };
  }

  const { sql: whereSql, values } = buildRegistryWhere(schema, filters);

  const summaryRes = await query<{
    total: string;
    operational: string;
    expired: string;
    cancelled: string;
    expiring_soon: string;
    regime_types: string;
  }>(
    `
    SELECT
      count(*)::text as total,
      count(*) filter (where (upper(coalesce(pr.status, '')) like '%OPERATIONAL%' or (upper(coalesce(pr.status, '')) like '%ACTIVE%' and upper(coalesce(pr.status, '')) not like '%INACTIVE%')) and upper(coalesce(pr.status, '')) not like '%NON-OPERATIONAL%' and upper(coalesce(pr.status, '')) not like '%NON OPERATIONAL%')::text as operational,
      count(*) filter (where upper(coalesce(pr.status, '')) like '%EXPIRED%')::text as expired,
      count(*) filter (where upper(coalesce(pr.status, '')) like '%CANCEL%' and upper(coalesce(pr.status, '')) not like '%EXPIRED%')::text as cancelled,
      count(*) filter (where pr.expiration_date is not null and pr.expiration_date >= current_date and pr.expiration_date <= (current_date + interval '3 months'))::text as expiring_soon,
      count(distinct nullif(trim(coalesce(pr.regime, '')), ''))::text as regime_types
    FROM public.permit_registry pr
    ${whereSql}
    `,
    values
  );

  const row = summaryRes.rows[0];
  return {
    total: Number(row?.total || "0"),
    operational: Number(row?.operational || "0"),
    expired: Number(row?.expired || "0"),
    cancelled: Number(row?.cancelled || "0"),
    expiringSoon: Number(row?.expiring_soon || "0"),
    regimeTypes: Number(row?.regime_types || "0"),
  };
}

export type RegistryDistributionRow = { key: string; label: string; count: number };

export type RegistryDistributions = {
  byWaterSource: RegistryDistributionRow[];
  byAuthorizedActivity: RegistryDistributionRow[];
  byStatusBucket: Array<{ key: "operational" | "expired" | "cancelled" | "expiring_soon"; label: string; count: number }>;
};

export async function fetchRegistryDistributions(
  schema: RegistrySchema,
  filters: RegistryListFilters
): Promise<RegistryDistributions> {
  if (!schema.hasRegistry) {
    return {
      byWaterSource: [],
      byAuthorizedActivity: [],
      byStatusBucket: [
        { key: "operational", label: "Operational", count: 0 },
        { key: "expired", label: "Expired", count: 0 },
        { key: "cancelled", label: "Cancelled", count: 0 },
        { key: "expiring_soon", label: "Expiring soon", count: 0 },
      ],
    };
  }

  const { sql: whereSql, values } = buildRegistryWhere(schema, filters);

  const [waterSourceRes, activityRes, summary] = await Promise.all([
    query<{ key: string; n: string }>(
      `
      SELECT lower(coalesce(nullif(trim(pr.water_source), ''), 'unknown')) as key,
             count(*)::text as n
      FROM public.permit_registry pr
      ${whereSql}
      GROUP BY 1
      ORDER BY count(*) DESC
      `,
      values
    ),
    query<{ key: string; n: string }>(
      `
      SELECT lower(coalesce(nullif(trim(pr.authorized_activity), ''), 'unknown')) as key,
             count(*)::text as n
      FROM public.permit_registry pr
      ${whereSql}
      GROUP BY 1
      ORDER BY count(*) DESC
      `,
      values
    ),
    fetchRegistrySummary(schema, filters),
  ]);

  return {
    byWaterSource: waterSourceRes.rows.map((r: { key: string; n: string }) => ({ key: r.key, label: r.key, count: Number(r.n) })),
    byAuthorizedActivity: activityRes.rows.map((r: { key: string; n: string }) => ({ key: r.key, label: r.key, count: Number(r.n) })),
    byStatusBucket: [
      { key: "operational", label: "Operational", count: summary.operational },
      { key: "expired", label: "Expired", count: summary.expired },
      { key: "cancelled", label: "Cancelled", count: summary.cancelled },
      { key: "expiring_soon", label: "Expiring soon", count: summary.expiringSoon },
    ],
  };
}

export type RegistryAbstraction = {
  totalPermittedM3PerDay: number;
  totalPermittedM3PerYear: number;
};

function normalizeUnit(unitRaw: string | null | undefined) {
  return (unitRaw || "").toLowerCase().replace(/\s+/g, "");
}

function convertToM3PerDay(value: number, unitRaw: string | null | undefined): number | null {
  const unit = normalizeUnit(unitRaw);
  if (!Number.isFinite(value)) return null;
  if (unit.includes("m3/day") || unit.includes("m³/day") || unit.includes("m3perday") || unit.includes("m³perday")) return value;
  if (unit.includes("m3/year") || unit.includes("m³/year") || unit.includes("m3peryear") || unit.includes("m³peryear")) return value / 365;
  if (unit.includes("m3/month") || unit.includes("m³/month") || unit.includes("m3permonth") || unit.includes("m³permonth")) return value / 30;
  if (unit.includes("l/s") || unit.includes("lps") || unit.includes("litre/second") || unit.includes("liter/second")) return value * 0.001 * 86400;
  if (unit.includes("m3/s") || unit.includes("m³/s") || unit.includes("m3persecond") || unit.includes("m³persecond")) return value * 86400;
  return null;
}

function parseRegistryVolume(value: string | null | undefined): { amount: number | null; unit: string | null } {
  const raw = String(value ?? "").trim();
  if (!raw) return { amount: null, unit: null };
  const match = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return { amount: null, unit: null };
  const cleaned = match[0].replace(/,/g, "");
  const parsed = Number(cleaned);
  return {
    amount: Number.isFinite(parsed) ? parsed : null,
    unit: raw.replace(match[0], "").trim() || null,
  };
}

export async function fetchRegistryAbstraction(
  schema: RegistrySchema,
  filters: RegistryListFilters
): Promise<RegistryAbstraction> {
  if (!schema.hasRegistry) {
    return { totalPermittedM3PerDay: 0, totalPermittedM3PerYear: 0 };
  }
  const { sql: whereSql, values } = buildRegistryWhere(schema, filters);

  const rowsRes = await query<{ volume_or_area: string | null }>(
    `SELECT pr.volume_or_area FROM public.permit_registry pr ${whereSql}`,
    values
  );

  let total = 0;
  for (const row of rowsRes.rows) {
    const parsed = parseRegistryVolume(row.volume_or_area);
    if (parsed.amount === null) continue;
    const perDay = convertToM3PerDay(parsed.amount, parsed.unit);
    if (perDay === null) continue;
    total += perDay;
  }

  return {
    totalPermittedM3PerDay: total,
    totalPermittedM3PerYear: total * 365,
  };
}

export async function countNewlyIssued(
  schema: RegistrySchema,
  filters: RegistryListFilters,
  from: Date | undefined,
  to: Date | undefined,
  period: "monthly" | "quarterly" | "annually"
): Promise<number> {
  if (!schema.hasRegistry) return 0;

  const { sql: whereSql, values } = buildRegistryWhere(schema, filters);

  let dateClause: string;
  const localValues = [...values];
  const next = (v: unknown) => {
    localValues.push(v);
    return `$${localValues.length}`;
  };

  if (from || to) {
    const parts: string[] = [];
    if (from) parts.push(`pr.issuance_date >= ${next(from.toISOString().slice(0, 10))}`);
    if (to) parts.push(`pr.issuance_date <= ${next(to.toISOString().slice(0, 10))}`);
    dateClause = parts.join(" AND ");
  } else {
    if (period === "monthly") {
      dateClause = `date_trunc('month', pr.issuance_date) = date_trunc('month', current_date)`;
    } else if (period === "quarterly") {
      dateClause = `date_trunc('quarter', pr.issuance_date) = date_trunc('quarter', current_date)`;
    } else {
      dateClause = `date_trunc('year', pr.issuance_date) = date_trunc('year', current_date)`;
    }
  }

  const sql = `SELECT count(*)::text as n FROM public.permit_registry pr ${whereSql ? `${whereSql} AND` : "WHERE"} ${dateClause}`;
  const res = await query<{ n: string }>(sql, localValues);
  return Number(res.rows[0]?.n || "0");
}
