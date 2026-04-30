# Management Dashboard — Permit Registry Sync & Panel Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/management` permit numbers match `/permit-registry` exactly (now and after future registry-rule changes), remove the duplicate "Pending applications by stage" panel, and move the "Inspection recommendation breakdown" card to the Compliance & Enforcement tab.

**Architecture:** Extract permit-registry counting SQL into one shared module (`lib/permit/registry-counts.ts`) used by both `/api/staff/permit-registry` (refactored, no behavior change) and a new `/api/management/dashboard` endpoint. Move `/management` from 5 client-side Supabase calls to one server endpoint round-trip. UI on `/management` updates KPI buckets to the registry vocabulary, swaps the duplicate stage panel for a "Permits by status" card, and relocates the inspection card.

**Tech Stack:** Next.js 14 App Router, TypeScript, `pg` (direct Postgres via `lib/db/postgres`), `@tanstack/react-query`, shadcn/ui (Card / Badge / Progress / Skeleton).

**Spec:** `docs/superpowers/specs/2026-04-30-management-dashboard-registry-sync-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/permit/registry-counts.ts` | **CREATE** | Single source of registry-counting SQL: WHERE clause builder, summary aggregation, list query, distributions, abstraction sums. Pure server-side module. |
| `app/api/staff/permit-registry/route.ts` | **MODIFY** | Refactor to call `lib/permit/registry-counts.ts`. Response shape unchanged, behavior unchanged. |
| `app/api/management/dashboard/route.ts` | **CREATE** | Single endpoint that returns `ManagementDashboardData`. Auth + 4 parallel queries (registry, applications, inspections, feedback). |
| `lib/management-dashboard.ts` | **REWRITE** | Becomes a thin client fetcher (calls `/api/management/dashboard`). Keeps `ManagementDashboardData` type export. |
| `hooks/useManagementDashboardQuery.ts` | **MODIFY** | Public signature unchanged. `queryFn` body now wraps the new fetcher. |
| `app/management/page.tsx` | **MODIFY** | New permit KPI row (Operational/Expired/Cancelled/Expiring soon), inline scope-note caption, replace "Pending applications by stage" with "Permits by status", move "Inspection recommendation breakdown" card to compliance tab, refresh "Quick hints" copy. |

No DB migrations. No other files touched.

---

## Task 1: Extract registry-counting SQL into a shared module

**Files:**
- Create: `lib/permit/registry-counts.ts`

- [ ] **Step 1: Create the shared module**

Create `lib/permit/registry-counts.ts` with the exact SQL fragments currently embedded in `app/api/staff/permit-registry/route.ts`. The module exports:

```ts
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
  status?: string; // "all" | "__ACTIVE__" | "__EXPIRED__" | "__CANCELLED__" | "__ABOUT_TO_EXPIRE__" | exact
  waterSource?: string; // "all" | exact match on permit_registry.water_source
  authorizedActivity?: string; // "all" | exact match on permit_registry.authorized_activity
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

  const hasRegistry = tablesRes.rows.some((r) => r.table_name === "permit_registry");

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
    const cols = new Set(colRes.rows.map((r) => r.column_name));
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
    byWaterSource: waterSourceRes.rows.map((r) => ({ key: r.key, label: r.key, count: Number(r.n) })),
    byAuthorizedActivity: activityRes.rows.map((r) => ({ key: r.key, label: r.key, count: Number(r.n) })),
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `lib/permit/registry-counts.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/permit/registry-counts.ts
git commit -m "feat(permit): extract registry-counting SQL into shared module"
```

---

## Task 2: Refactor `/api/staff/permit-registry` to call the shared module (no behavior change)

**Files:**
- Modify: `app/api/staff/permit-registry/route.ts`

- [ ] **Step 1: Replace the inlined `detectSchema` and summary SQL with calls to the shared module**

Open `app/api/staff/permit-registry/route.ts`. Delete the local `async function detectSchema()` block (lines 11-80) and replace its usages. Replace the inline summary SQL block (lines 167-189) with `await fetchRegistrySummary(schema, { q, regime, status })`. Keep the paginated SELECT, response shape, and ordering exactly as-is.

Concretely, the new top-of-file imports become:

```ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  detectRegistrySchema,
  fetchRegistrySummary,
  buildRegistryWhere,
} from "@/lib/permit/registry-counts";
```

The handler body becomes:

```ts
export async function GET(req: NextRequest) {
  try {
    const schema = await detectRegistrySchema();

    if (!schema.hasRegistry) {
      return NextResponse.json(EMPTY_RESULT);
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const regime = searchParams.get("regime") || "all";
    const status = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sort_by") || (schema.hasRowIndex ? "row_index" : "serial_number");
    const sortDir = searchParams.get("sort_dir") === "desc" ? "desc" : "asc";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const validSortColumns = ["serial_number", "permit_holder", "permit_number", "status", "regime", "row_index"];
    const column = validSortColumns.includes(sortBy) ? sortBy : (schema.hasRowIndex ? "row_index" : "serial_number");

    const docSelect = schema.hasDocColumns
      ? `pr.uploaded_doc_path, pr.uploaded_doc_name, pr.uploaded_doc_mime_type, pr.uploaded_doc_uploaded_at,`
      : `null::text as uploaded_doc_path, null::text as uploaded_doc_name,
         null::text as uploaded_doc_mime_type, null::timestamptz as uploaded_doc_uploaded_at,`;

    const rawDateSelect = schema.hasRawDateColumns
      ? `pr.issuance_date_raw, pr.expiration_date_raw,`
      : `null::text as issuance_date_raw, null::text as expiration_date_raw,`;

    const rowIndexSelect = schema.hasRowIndex
      ? `pr.row_index,`
      : `null::integer as row_index,`;

    const deletedAtSelect = schema.hasDeletedAt
      ? `pr.deleted_at,`
      : `null::timestamptz as deleted_at,`;

    const manuallyEditedAtSelect = schema.hasManuallyEditedAt
      ? `pr.manually_edited_at,`
      : `null::timestamptz as manually_edited_at,`;

    const docsSelect = schema.hasDocumentsTable
      ? `(
          SELECT COALESCE(json_agg(d ORDER BY d.uploaded_at ASC), '[]'::json)
          FROM public.permit_registry_documents d
          WHERE d.permit_number = pr.permit_number
        ) AS documents,`
      : `'[]'::json AS documents,`;

    const filters = { q, regime, status };
    const { sql: whereSql, values } = buildRegistryWhere(schema, filters);
    const summary = await fetchRegistrySummary(schema, filters);

    const pageValues = [...values];
    pageValues.push(offset);
    const offsetParam = `$${pageValues.length}`;
    pageValues.push(limit);
    const limitParam = `$${pageValues.length}`;

    const pageRes = await query(
      `
      SELECT
        pr.id,
        ${rowIndexSelect}
        pr.serial_number,
        pr.permit_holder,
        pr.permit_number,
        pr.regime,
        pr.water_source,
        pr.volume_or_area,
        pr.method_of_water_taking,
        pr.authorized_activity,
        pr.location,
        pr.latitude,
        pr.longitude,
        null::text as coordinates_geojson,
        pr.issuance_date,
        ${rawDateSelect}
        pr.duration,
        pr.expiration_date,
        upper(coalesce(pr.status, 'OPERATIONAL')) as status,
        pr.contact,
        ${docSelect}
        ${docsSelect}
        ${deletedAtSelect}
        ${manuallyEditedAtSelect}
        pr.created_at,
        pr.updated_at,
        'registry'::text as source_kind
      FROM public.permit_registry pr
      ${whereSql}
      ORDER BY ${column} ${sortDir} NULLS LAST
      OFFSET ${offsetParam} LIMIT ${limitParam}
      `,
      pageValues
    );

    return NextResponse.json({
      items: pageRes.rows || [],
      total: summary.total,
      summary: {
        total: summary.total,
        operational: summary.operational,
        expired: summary.expired,
        cancelled: summary.cancelled,
        expiringSoon: summary.expiringSoon,
        regimeTypes: summary.regimeTypes,
      },
      pagination: { limit, offset, returned: (pageRes.rows || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Manual smoke test (no behavior change)**

Boot dev (`make run` or `npm run dev`). Open `/permit-registry` (or any staff page that embeds `PermitRegistryList`). Confirm:
- The "Total Permits" tile and the rows render exactly as before.
- The status filter chips (Active / Expired / Cancelled / About to expire) still narrow correctly.
- Pagination still works.

If any number changes vs. the previous deploy, STOP and revert this task.

- [ ] **Step 4: Commit**

```bash
git add app/api/staff/permit-registry/route.ts
git commit -m "refactor(api): permit-registry route uses shared registry-counts module"
```

---

## Task 3: New server endpoint `/api/management/dashboard`

**Files:**
- Create: `app/api/management/dashboard/route.ts`

- [ ] **Step 1: Create the route file with auth and skeleton**

Create `app/api/management/dashboard/route.ts`. The full file (single commit at the end of this task):

```ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import {
  detectRegistrySchema,
  fetchRegistrySummary,
  fetchRegistryDistributions,
  fetchRegistryAbstraction,
  countNewlyIssued,
  type RegistryListFilters,
} from "@/lib/permit/registry-counts";
import {
  INSPECTION_RECOMMENDATION_OPTIONS,
  normalizeInspectionRecommendation,
} from "@/lib/inspection-recommendations";

const SUPERUSER_EMAILS = new Set(["nizzogentl1@gmail.com", "nshutidavy@gmail.com"]);
const ALLOWED_ROLES = ["admin", "approver", "reviewer", "verifier", "inspector", "assessor"] as const;

type Period = "monthly" | "quarterly" | "annually";

type ParsedFilters = {
  period: Period;
  from?: Date;
  to?: Date;
  province: string;
  district: string;
  sector: string;
  catchment1: string;
  catchment2: string;
  waterSource: string;
  waterPurpose: string;
};

function parseDateMaybe(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseFilters(req: NextRequest): ParsedFilters {
  const sp = req.nextUrl.searchParams;
  const period = (sp.get("period") as Period) || "monthly";
  return {
    period: ["monthly", "quarterly", "annually"].includes(period) ? period : "monthly",
    from: parseDateMaybe(sp.get("from")),
    to: parseDateMaybe(sp.get("to")),
    province: sp.get("province") || "all",
    district: sp.get("district") || "all",
    sector: sp.get("sector") || "all",
    catchment1: sp.get("catchment1") || "all",
    catchment2: sp.get("catchment2") || "all",
    waterSource: sp.get("waterSource") || "all",
    waterPurpose: sp.get("waterPurpose") || "all",
  };
}

function isMissingRelation(err: unknown, table: string): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(table.toLowerCase());
}

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }

    const resolvedRoles = await resolveEffectiveRoles({ userId, claimsRole: claims?.role });
    const userEmail = String(claims?.email ?? "").trim().toLowerCase();
    const isSuperuser = SUPERUSER_EMAILS.has(userEmail);
    if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, [...ALLOWED_ROLES])) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const filters = parseFilters(req);
    const warnings: string[] = [];

    // ── Permit registry (single source of truth, ignores geo filters) ────
    const schema = await detectRegistrySchema();
    if (!schema.hasRegistry) warnings.push("permit_registry table missing — permit metrics empty");

    const registryFilters: RegistryListFilters = {
      waterSource: filters.waterSource,
      authorizedActivity: filters.waterPurpose,
    };

    const [registrySummary, registryDist, registryAbs, newlyIssued] = await Promise.all([
      fetchRegistrySummary(schema, registryFilters),
      fetchRegistryDistributions(schema, registryFilters),
      fetchRegistryAbstraction(schema, registryFilters),
      countNewlyIssued(schema, registryFilters, filters.from, filters.to, filters.period),
    ]);

    // ── Applications (geo-filtered) ──────────────────────────────────────
    const appWhere: string[] = [`status <> 'draft'`, `status <> 'pending_payment'`];
    const appValues: unknown[] = [];
    const appPush = (v: unknown) => {
      appValues.push(v);
      return `$${appValues.length}`;
    };
    if (filters.province !== "all") appWhere.push(`province::text = ${appPush(filters.province)}`);
    if (filters.district !== "all") appWhere.push(`lower(coalesce(district, '')) = lower(${appPush(filters.district)})`);
    if (filters.sector !== "all") appWhere.push(`lower(coalesce(sector, '')) = lower(${appPush(filters.sector)})`);
    if (filters.catchment1 !== "all") appWhere.push(`lower(coalesce(catchment_name_level_1, '')) = lower(${appPush(filters.catchment1)})`);
    if (filters.catchment2 !== "all") appWhere.push(`lower(coalesce(catchment_name_level_2, '')) = lower(${appPush(filters.catchment2)})`);
    if (filters.waterSource !== "all") appWhere.push(`water_source::text = ${appPush(filters.waterSource)}`);
    if (filters.waterPurpose !== "all") appWhere.push(`water_purpose::text = ${appPush(filters.waterPurpose)}`);
    if (filters.from) appWhere.push(`coalesce(submitted_at, created_at) >= ${appPush(filters.from.toISOString())}`);
    if (filters.to) appWhere.push(`coalesce(submitted_at, created_at) <= ${appPush(filters.to.toISOString())}`);

    const appsRes = await query<{ id: string; status: string; province: string | null; district: string | null; sector: string | null }>(
      `
      select id::text, status::text, province::text, district, sector
      from public.applications
      where ${appWhere.join(" AND ")}
      `,
      appValues
    );

    const appById = new Map(appsRes.rows.map((r) => [r.id, r]));
    const appIdSet = new Set(appsRes.rows.map((r) => r.id));

    const apps = appsRes.rows;
    const totalApplications = apps.length;
    const submittedApplications = apps.filter((a) => a.status === "submitted").length;
    const pendingReviewApplications = apps.filter((a) => a.status === "pending_review").length;
    const pendingVerificationApplications = apps.filter((a) => a.status === "pending_verification").length;
    const pendingFinalApprovalApplications = apps.filter((a) => a.status === "pending_final_approval").length;
    const inProcessApplications = apps.filter((a) =>
      ["under_review", "pending_assessment", "pending_inspection"].includes(a.status)
    ).length;

    const stageRows = [
      { key: "submitted", label: "Submitted", count: submittedApplications },
      { key: "pending_assessment", label: "Pending assessment", count: apps.filter((a) => a.status === "pending_assessment").length },
      { key: "pending_review", label: "Pending review", count: pendingReviewApplications },
      { key: "pending_verification", label: "Pending verification", count: pendingVerificationApplications },
      { key: "pending_final_approval", label: "Pending final approval", count: pendingFinalApprovalApplications },
    ];

    // ── Inspections (include manual + permit_registry-owned) ─────────────
    type InspectionRow = {
      id: string;
      application_id: string | null;
      owner_kind: string | null;
      owner_id: string | null;
      status: string | null;
      completed_date: string | null;
      created_at: string;
      volume_limits_respected: boolean | null;
      location_verified: boolean | null;
      reporting_up_to_date: boolean | null;
      reports_submitted: boolean | null;
      fees_paid: boolean | null;
      fees_payment_verified: boolean | null;
      regulatory_compliance: boolean | null;
      actual_quantity: number | null;
      allowed_quantity: number | null;
      recommendations: string | null;
    };

    let inspectionsRows: InspectionRow[] = [];
    let inspectionsRecsAvailable = true;
    try {
      const insRes = await query<InspectionRow>(
        `
        select
          id::text,
          application_id::text,
          owner_kind,
          owner_id::text,
          status::text,
          completed_date::text,
          created_at::text,
          volume_limits_respected,
          location_verified,
          reporting_up_to_date,
          reports_submitted,
          fees_paid,
          fees_payment_verified,
          regulatory_compliance,
          actual_quantity,
          allowed_quantity,
          recommendations
        from public.inspections
        `
      );
      inspectionsRows = insRes.rows;
    } catch (err) {
      const msg = String((err as { message?: string }).message || "");
      if (msg.includes("recommendations") && msg.toLowerCase().includes("does not exist")) {
        inspectionsRecsAvailable = false;
        try {
          const fallback = await query<Omit<InspectionRow, "recommendations"> & { recommendations: null }>(
            `
            select
              id::text,
              application_id::text,
              owner_kind,
              owner_id::text,
              status::text,
              completed_date::text,
              created_at::text,
              volume_limits_respected,
              location_verified,
              reporting_up_to_date,
              reports_submitted,
              fees_paid,
              fees_payment_verified,
              regulatory_compliance,
              actual_quantity,
              allowed_quantity,
              null::text as recommendations
            from public.inspections
            `
          );
          inspectionsRows = fallback.rows as InspectionRow[];
        } catch (err2) {
          if (!isMissingRelation(err2, "inspections")) throw err2;
          warnings.push("inspections table missing — compliance metrics empty");
        }
      } else if (isMissingRelation(err, "inspections")) {
        warnings.push("inspections table missing — compliance metrics empty");
      } else {
        throw err;
      }
    }

    const inspectionsFiltered = inspectionsRows.filter((i) => {
      // Geo filters block inspections we cannot link to the filtered apps set,
      // EXCEPT for permit_registry-owned inspections which we still count when
      // no geo filter is active.
      const geoFilterActive =
        filters.province !== "all" ||
        filters.district !== "all" ||
        filters.sector !== "all" ||
        filters.catchment1 !== "all" ||
        filters.catchment2 !== "all";

      if (i.application_id) {
        if (!appIdSet.has(i.application_id)) return false;
      } else if (i.owner_kind === "permit_registry" || i.owner_kind === "manual_unpermitted") {
        if (geoFilterActive) return false;
      } else {
        return false;
      }

      const date = i.completed_date ? new Date(i.completed_date) : new Date(i.created_at);
      if (filters.from && date < filters.from) return false;
      if (filters.to && date > filters.to) return false;
      return true;
    });

    const completedInspections = inspectionsFiltered.filter((i) => i.status === "completed" || Boolean(i.completed_date));

    const latestByOwner = new Map<string, InspectionRow>();
    for (const i of completedInspections) {
      const ownerKey = i.application_id ?? `${i.owner_kind}:${i.owner_id}`;
      const completedAt = i.completed_date ? new Date(i.completed_date) : new Date(i.created_at);
      const prev = latestByOwner.get(ownerKey);
      if (!prev) {
        latestByOwner.set(ownerKey, i);
        continue;
      }
      const prevAt = prev.completed_date ? new Date(prev.completed_date) : new Date(prev.created_at);
      if (completedAt > prevAt) latestByOwner.set(ownerKey, i);
    }

    let fullyCompliant = 0;
    let partiallyCompliant = 0;
    let nonCompliant = 0;
    let violationsDetected = 0;
    let volumeOk = 0;
    let locationOk = 0;
    let reportingOk = 0;
    let feesOk = 0;

    const recCounts: Record<string, number> = {};
    for (const opt of INSPECTION_RECOMMENDATION_OPTIONS) recCounts[opt] = 0;

    for (const insp of latestByOwner.values()) {
      const checks = [
        insp.volume_limits_respected === true,
        insp.location_verified === true,
        insp.reporting_up_to_date === true || insp.reports_submitted === true,
        insp.fees_paid === true || insp.fees_payment_verified === true,
      ];
      const passed = checks.filter(Boolean).length;
      if (passed === checks.length) fullyCompliant += 1;
      else if (passed === 0) nonCompliant += 1;
      else partiallyCompliant += 1;

      const isViolation =
        insp.regulatory_compliance === false ||
        insp.volume_limits_respected === false ||
        insp.location_verified === false ||
        insp.reports_submitted === false ||
        insp.reporting_up_to_date === false ||
        insp.fees_paid === false ||
        insp.fees_payment_verified === false ||
        (typeof insp.actual_quantity === "number" &&
          typeof insp.allowed_quantity === "number" &&
          insp.actual_quantity > insp.allowed_quantity);
      if (isViolation) violationsDetected += 1;

      if (insp.volume_limits_respected === true) volumeOk += 1;
      if (insp.location_verified === true) locationOk += 1;
      if (insp.reporting_up_to_date === true || insp.reports_submitted === true) reportingOk += 1;
      if (insp.fees_paid === true || insp.fees_payment_verified === true) feesOk += 1;

      const normalized = normalizeInspectionRecommendation(insp.recommendations);
      if (normalized) recCounts[normalized] += 1;
    }
    if (!inspectionsRecsAvailable) warnings.push("inspections.recommendations column missing — recommendation counts will be 0");

    const denom = latestByOwner.size;
    const parameters = [
      { key: "volume_limits", label: "Volume limits", numerator: volumeOk, denominator: denom },
      { key: "abstraction_location", label: "Abstraction point location", numerator: locationOk, denominator: denom },
      { key: "meter_reporting", label: "Meter installation & reporting", numerator: reportingOk, denominator: denom },
      { key: "fee_payment", label: "Fee payment status", numerator: feesOk, denominator: denom },
    ].map((p) => ({ ...p, percentage: p.denominator > 0 ? (p.numerator / p.denominator) * 100 : 0 }));

    // ── Feedback ─────────────────────────────────────────────────────────
    type FeedbackRow = {
      id: string;
      application_id: string | null;
      rating: number | null;
      feedback_text: string | null;
      created_at: string;
      application_number: string | null;
      project_title: string | null;
      province: string | null;
      district: string | null;
      sector: string | null;
    };

    let feedbackRows: FeedbackRow[] = [];
    try {
      const fbRes = await query<FeedbackRow>(
        `
        select
          pf.id::text,
          pf.application_id::text,
          pf.rating,
          pf.feedback_text,
          pf.created_at::text,
          a.application_number,
          a.project_title,
          a.province::text,
          a.district,
          a.sector
        from public.portal_feedback pf
        left join public.applications a on a.id = pf.application_id
        where pf.feedback_type = 'terms_acceptance'
        order by pf.created_at desc
        `
      );
      feedbackRows = fbRes.rows;
    } catch (err) {
      if (isMissingRelation(err, "portal_feedback")) {
        warnings.push("portal_feedback table missing — feedback metrics empty");
      } else {
        throw err;
      }
    }

    const feedbackFiltered = feedbackRows.filter((entry) => {
      if (!entry.application_id || !appIdSet.has(entry.application_id)) return false;
      const createdAt = new Date(entry.created_at);
      if (filters.from && createdAt < filters.from) return false;
      if (filters.to && createdAt > filters.to) return false;
      return true;
    });

    const ratedFeedback = feedbackFiltered.filter((entry) => typeof entry.rating === "number" && entry.rating >= 1 && entry.rating <= 5);
    const averageRating =
      ratedFeedback.length > 0
        ? ratedFeedback.reduce((sum, e) => sum + Number(e.rating || 0), 0) / ratedFeedback.length
        : null;
    const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: feedbackFiltered.filter((entry) => entry.rating === rating).length,
    }));
    const recentFeedback = feedbackFiltered.map((entry) => ({
      id: entry.id,
      applicationId: entry.application_id,
      applicationNumber: entry.application_number,
      projectTitle: entry.project_title,
      province: entry.province,
      district: entry.district,
      sector: entry.sector,
      rating: entry.rating,
      feedbackText: entry.feedback_text,
      createdAt: entry.created_at,
    }));

    const totalForPct = registryDist.byWaterSource.reduce((s, r) => s + r.count, 0) || 1;

    return NextResponse.json({
      portfolio: {
        kpis: {
          totalApplications,
          submittedApplications,
          inProcessApplications,
          pendingReviewApplications,
          pendingVerificationApplications,
          pendingFinalApprovalApplications,
          totalPermits: registrySummary.total,
          operational: registrySummary.operational,
          expired: registrySummary.expired,
          cancelled: registrySummary.cancelled,
          expiringSoon: registrySummary.expiringSoon,
          newPermitsIssued: newlyIssued,
          // Deprecated, kept at 0 for backwards compat with the existing TS type
          active: registrySummary.operational,
          suspended: 0,
          revoked: 0,
        },
        distributions: {
          byWaterSource: registryDist.byWaterSource.map((r) => ({
            ...r,
            percentage: (r.count / totalForPct) * 100,
          })),
          byUse: registryDist.byAuthorizedActivity.map((r) => {
            const total = registryDist.byAuthorizedActivity.reduce((s, x) => s + x.count, 0) || 1;
            return { ...r, percentage: (r.count / total) * 100 };
          }),
          byStatusBucket: registryDist.byStatusBucket,
          byCatchment1: [],
          byCatchment2: [],
          byProvince: [],
          byDistrict: [],
          bySector: [],
        },
        workflow: { pendingByStage: stageRows },
      },
      abstraction: {
        totalPermittedM3PerDay: registryAbs.totalPermittedM3PerDay,
        totalPermittedM3PerYear: registryAbs.totalPermittedM3PerYear,
        pressureByCatchment: [],
      },
      compliance: {
        holders: { fullyCompliant, partiallyCompliant, nonCompliant },
        inspections: {
          conducted: completedInspections.length,
          violationsDetected,
          enforcementActionsTaken: 0,
          recommendationBreakdown: INSPECTION_RECOMMENDATION_OPTIONS.map((opt) => ({
            key: opt,
            label: opt,
            count: recCounts[opt] || 0,
          })),
        },
        parameters,
        alerts: [],
      },
      feedback: {
        totalSubmissions: feedbackFiltered.length,
        averageRating,
        ratingBreakdown,
        recent: recentFeedback,
      },
      meta: {
        permitsScopeNote:
          "Permit counts reflect the entire permit registry. Province / district / sector / catchment filters apply to applications, inspections, and feedback only.",
        warnings,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ /api/management/dashboard error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Manual smoke against staging DB**

Boot dev. With a logged-in staff session, hit:

```bash
curl -sS -b "session=<your-cookie>" 'http://localhost:3000/api/management/dashboard?period=monthly' | jq '.portfolio.kpis'
```

Expected: numbers for `totalPermits`, `operational`, `expired`, `cancelled`, `expiringSoon` come back. Cross-check with:

```bash
curl -sS -b "session=<your-cookie>" 'http://localhost:3000/api/staff/permit-registry?limit=1' | jq '.summary'
```

The five permit numbers MUST match exactly. If they don't, STOP and fix the shared module before proceeding.

- [ ] **Step 4: Commit**

```bash
git add app/api/management/dashboard/route.ts
git commit -m "feat(api): management dashboard server endpoint backed by permit registry"
```

---

## Task 4: Rewrite `lib/management-dashboard.ts` as a thin client fetcher

**Files:**
- Modify: `lib/management-dashboard.ts`

- [ ] **Step 1: Replace the entire file**

Open `lib/management-dashboard.ts`. Replace its entire contents with:

```ts
"use client";

import type { ManagementDashboardFilters } from "@/hooks/useManagementDashboardQuery";

type KeyCount = { key: string; label: string; count: number; percentage: number };
type KeyCountNoPct = { key: string; label: string; count: number };

export type ManagementDashboardData = {
  portfolio: {
    kpis: {
      totalApplications: number;
      submittedApplications: number;
      inProcessApplications: number;
      pendingReviewApplications: number;
      pendingVerificationApplications: number;
      pendingFinalApprovalApplications: number;
      totalPermits: number;
      operational: number;
      expired: number;
      cancelled: number;
      expiringSoon: number;
      newPermitsIssued: number;
      // Deprecated, retained for type compatibility (always 0 or aliased)
      active: number;
      suspended: number;
      revoked: number;
    };
    distributions: {
      byWaterSource: KeyCount[];
      byUse: KeyCount[];
      byStatusBucket: Array<{
        key: "operational" | "expired" | "cancelled" | "expiring_soon";
        label: string;
        count: number;
      }>;
      byCatchment1: KeyCountNoPct[];
      byCatchment2: KeyCountNoPct[];
      byProvince: KeyCountNoPct[];
      byDistrict: KeyCountNoPct[];
      bySector: KeyCountNoPct[];
    };
    workflow: {
      pendingByStage: KeyCountNoPct[];
    };
  };
  abstraction: {
    totalPermittedM3PerDay: number;
    totalPermittedM3PerYear: number;
    pressureByCatchment: Array<{
      key: string;
      label: string;
      permittedM3PerDay: number;
      index: number;
      flag: "ok" | "watch" | "stressed";
    }>;
  };
  compliance: {
    holders: { fullyCompliant: number; partiallyCompliant: number; nonCompliant: number };
    inspections: {
      conducted: number;
      violationsDetected: number;
      enforcementActionsTaken: number;
      recommendationBreakdown: Array<{ key: string; label: string; count: number }>;
    };
    parameters: Array<{
      key: string;
      label: string;
      numerator: number;
      denominator: number;
      percentage: number;
    }>;
    alerts: Array<{
      id: string;
      type: "over_abstraction" | "expired_permit" | "non_reporting" | "other";
      severity: "low" | "medium" | "high";
      title: string;
      subtitle: string;
    }>;
  };
  feedback: {
    totalSubmissions: number;
    averageRating: number | null;
    ratingBreakdown: Array<{ rating: number; count: number }>;
    recent: Array<{
      id: string;
      applicationId: string | null;
      applicationNumber: string | null;
      projectTitle: string | null;
      province: string | null;
      district: string | null;
      sector: string | null;
      rating: number | null;
      feedbackText: string | null;
      createdAt: string;
    }>;
  };
  meta: {
    permitsScopeNote: string;
    warnings: string[];
  };
};

function buildSearchParams(filters: ManagementDashboardFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("period", filters.period);
  if (filters.from) sp.set("from", filters.from);
  if (filters.to) sp.set("to", filters.to);
  if (filters.province !== "all") sp.set("province", String(filters.province));
  if (filters.district !== "all") sp.set("district", String(filters.district));
  if (filters.sector !== "all") sp.set("sector", String(filters.sector));
  if (filters.catchment1 !== "all") sp.set("catchment1", String(filters.catchment1));
  if (filters.catchment2 !== "all") sp.set("catchment2", String(filters.catchment2));
  if (filters.waterSource !== "all") sp.set("waterSource", String(filters.waterSource));
  if (filters.waterPurpose !== "all") sp.set("waterPurpose", String(filters.waterPurpose));
  return sp;
}

export async function getManagementDashboardData(
  filters: ManagementDashboardFilters
): Promise<ManagementDashboardData> {
  const sp = buildSearchParams(filters);
  const res = await fetch(`/api/management/dashboard?${sp.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Failed to load management dashboard (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // body wasn't JSON; fall through with default message
    }
    throw new Error(message);
  }
  return (await res.json()) as ManagementDashboardData;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: there will be errors in `app/management/page.tsx` referencing `pressureByCatchment`, `inspections.recommendationBreakdown`, etc. — those are addressed in Task 5. The file `lib/management-dashboard.ts` itself should be error-free.

- [ ] **Step 3: Commit**

```bash
git add lib/management-dashboard.ts
git commit -m "refactor(management): replace client Supabase fetch with server endpoint call"
```

---

## Task 5: Update `/management` page UI

**Files:**
- Modify: `app/management/page.tsx`

- [ ] **Step 1: Replace the permit KPI row (lines ~492-534) with the new five-bucket row + scope hint**

Find the block that starts:

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
  <Card className="shadow-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">Total permits issued</CardTitle>
```

…and replace the entire `<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">` block (5 cards) AND the `<div className="grid gap-4 md:grid-cols-2">` block immediately following it that contains "Permits by water source type" + "Pending applications by stage" with this:

```tsx
<div className="space-y-2">
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Total permits issued</CardTitle>
        <CardDescription>From permit registry</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.totalPermits ?? 0)}</div>}
      </CardContent>
    </Card>
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Operational</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.operational ?? 0)}</div>}
      </CardContent>
    </Card>
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Expired</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.expired ?? 0)}</div>}
      </CardContent>
    </Card>
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.cancelled ?? 0)}</div>}
      </CardContent>
    </Card>
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Expiring soon</CardTitle>
        <CardDescription>≤ 3 months</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.expiringSoon ?? 0)}</div>}
      </CardContent>
    </Card>
  </div>
  {data?.meta?.permitsScopeNote ? (
    <p className="text-xs text-muted-foreground">{data.meta.permitsScopeNote}</p>
  ) : null}
</div>

<div className="grid gap-4 md:grid-cols-2">
  <Card className="shadow-sm">
    <CardHeader>
      <CardTitle>Permits by water source type</CardTitle>
      <CardDescription>Distribution across major water sources</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {(data?.portfolio.distributions.byWaterSource ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">No permit data found.</div>
      ) : (
        (data?.portfolio.distributions.byWaterSource ?? []).slice(0, 8).map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{row.label}</div>
              <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
            </div>
            <div className="w-44 flex items-center gap-2">
              <Progress value={row.percentage} className="h-2" />
              <div className="text-xs text-muted-foreground w-10 text-right">{row.percentage.toFixed(0)}%</div>
            </div>
          </div>
        ))
      )}
    </CardContent>
  </Card>

  <Card className="shadow-sm">
    <CardHeader>
      <CardTitle>Permits by status</CardTitle>
      <CardDescription>Same buckets as the permit registry</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {(data?.portfolio.distributions.byStatusBucket ?? []).map((row) => {
        const total = data?.portfolio.kpis.totalPermits ?? 0;
        const percentage = total > 0 ? (row.count / total) * 100 : 0;
        return (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{row.label}</div>
              <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
            </div>
            <div className="w-44 flex items-center gap-2">
              <Progress value={percentage} className="h-2" />
              <div className="text-xs text-muted-foreground w-12 text-right">{percentage.toFixed(0)}%</div>
            </div>
          </div>
        );
      })}
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 2: Remove the "Inspection recommendation breakdown" card from the Portfolio Overview tab**

Find the second `<div className="grid gap-4 md:grid-cols-2">` block that contains:

```tsx
<Card className="shadow-sm">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <MessageSquare className="h-4 w-4" />
      Recent applicant feedback
    </CardTitle>
```

…and the right-side `<div className="space-y-4">` containing both "Feedback rating breakdown" and "Inspection recommendation breakdown" cards. Replace the right-side wrapper so it only contains the "Feedback rating breakdown" card. Remove the entire `<Card className="shadow-sm">` block whose `CardTitle` is `Inspection recommendation breakdown`.

After the edit, that section is:

```tsx
<div className="grid gap-4 md:grid-cols-2">
  <Card className="shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Recent applicant feedback
      </CardTitle>
      <CardDescription>Latest permit issuance feedback submitted by applicants</CardDescription>
    </CardHeader>
    {/* ...existing card body unchanged... */}
  </Card>

  <Card className="shadow-sm">
    <CardHeader>
      <CardTitle>Feedback rating breakdown</CardTitle>
      <CardDescription>Distribution of applicant satisfaction scores</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {(data?.feedback.ratingBreakdown ?? []).map((row) => {
        const totalFeedback = data?.feedback.totalSubmissions ?? 0;
        const percentage = totalFeedback > 0 ? (row.count / totalFeedback) * 100 : 0;
        return (
          <div key={row.rating} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="font-medium">{row.rating} star</div>
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
            </div>
            <div className="w-44 flex items-center gap-2">
              <Progress value={percentage} className="h-2" />
              <div className="text-xs text-muted-foreground w-12 text-right">{formatNumber(row.count)}</div>
            </div>
          </div>
        );
      })}
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 3: Add the "Inspection recommendation breakdown" card to the Compliance & Enforcement tab**

Find the `section === "compliance"` block. Inside it, after the "Compliance parameters" card and before the closing `</div>` of `space-y-4`, add:

```tsx
<Card className="shadow-sm">
  <CardHeader>
    <CardTitle>Inspection recommendation breakdown</CardTitle>
    <CardDescription>Distribution of latest inspection recommendations</CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    {(data?.compliance.inspections.recommendationBreakdown ?? []).map((row) => {
      const totalInspections = data?.compliance.inspections.conducted ?? 0;
      const percentage = totalInspections > 0 ? (row.count / totalInspections) * 100 : 0;
      return (
        <div key={row.key} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="font-medium">{row.label}</div>
          </div>
          <div className="w-44 flex items-center gap-2">
            <Progress value={percentage} className="h-2" />
            <div className="text-xs text-muted-foreground w-12 text-right">{formatNumber(row.count)}</div>
          </div>
        </div>
      );
    })}
  </CardContent>
</Card>
```

- [ ] **Step 4: Update "Quick hints" sidebar copy**

Find the `<Card>` whose `CardTitle` is `Quick hints` (around line 186). Replace the second bullet:

Before:
```tsx
<div>✅ Permit counts come from the consolidated permit dataset (`permits` + `permit_registry`).</div>
```

After:
```tsx
<div>✅ Permit counts come from the official permit registry — these match `/permit-registry` exactly.</div>
```

- [ ] **Step 5: Verify the page still compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero errors. If anything in the abstraction tab or compliance tab still references removed fields (it shouldn't — the type kept `pressureByCatchment` as an empty array), fix the reference.

- [ ] **Step 6: Lint check**

Run: `npx eslint app/management/page.tsx lib/management-dashboard.ts hooks/useManagementDashboardQuery.ts app/api/management/dashboard/route.ts app/api/staff/permit-registry/route.ts lib/permit/registry-counts.ts`
Expected: zero errors.

- [ ] **Step 7: Manual UI check**

Boot dev. Navigate to `/management` as a logged-in staff user.

Confirm:
1. Top KPI row (applications) renders four cards (Total / In Process / Pending Verification / Pending Approval).
2. Permit KPI row renders five cards: Total permits issued / Operational / Expired / Cancelled / Expiring soon.
3. Below the permit KPIs, a small caption reads: "Permit counts reflect the entire permit registry. Province / district / sector / catchment filters apply to applications, inspections, and feedback only."
4. The "Pending applications by stage" card is GONE.
5. In its slot, "Permits by status" card appears alongside "Permits by water source type".
6. The "Inspection recommendation breakdown" card is GONE from Portfolio Overview.
7. Click into "Compliance & Enforcement" — the inspection recommendation card now appears here, after "Compliance parameters".
8. Open `/permit-registry` in a second tab and compare the five permit numbers — they MUST match.
9. Apply a Province filter via the Filters sheet on `/management`. The permit KPIs MUST stay equal to the registry totals; only application/inspection/feedback metrics narrow.
10. Refresh, then click `Refresh` button — no console errors, the page re-fetches.

If any of those fails, STOP and fix before commit.

- [ ] **Step 8: Commit**

```bash
git add app/management/page.tsx
git commit -m "feat(management): align KPIs with permit registry, dedupe app panels, relocate inspection card"
```

---

## Task 6: End-to-end verification & branch tidy

**Files:** none (verification only)

- [ ] **Step 1: Final TypeScript check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 2: Final lint check**

Run: `npx eslint .`
Expected: zero new errors introduced by these changes (pre-existing repo-wide lints may remain).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: successful build, no `app/management` or `app/api/management/dashboard` warnings.

- [ ] **Step 4: Side-by-side parity verification (local)**

In two browser tabs, logged in as the same staff user, with no filters applied:
- Tab A: `/permit-registry` → note the summary card numbers.
- Tab B: `/management` → the five permit KPI cards must match Tab A's numbers exactly.

Then, apply a `status=__CANCELLED__` filter on Tab A and confirm `/management`'s "Cancelled" KPI equals the count Tab A shows.

- [ ] **Step 5: Git status check**

Run: `git status`
Expected: working tree clean, all six commits present:

```
git log --oneline -n 6
```

Expected output (in order, newest first):
```
<sha>  feat(management): align KPIs with permit registry, dedupe app panels, relocate inspection card
<sha>  refactor(management): replace client Supabase fetch with server endpoint call
<sha>  feat(api): management dashboard server endpoint backed by permit registry
<sha>  refactor(api): permit-registry route uses shared registry-counts module
<sha>  feat(permit): extract registry-counting SQL into shared module
```

(Five commits, not six — there is no commit for Task 6 since it is verification-only.)

---

## Self-Review Checklist (run after writing this plan)

**1. Spec coverage:**
- ✅ Goal 1 (permit numbers match registry) — Tasks 1, 2, 3.
- ✅ Goal 2 (drop duplicate stage panel, replace with status breakdown) — Task 5 Step 1.
- ✅ Goal 3 (move inspection card to Compliance) — Task 5 Steps 2 & 3.
- ✅ Goal 4 (count manual/registry-owned inspections) — Task 3 inspection block.
- ✅ Goal 5 (one server endpoint instead of 5 client calls) — Tasks 3 & 4.

**2. Placeholder scan:** none. Every step has concrete code or commands.

**3. Type consistency:** `ManagementDashboardData` shape in Task 4 matches what Task 3's endpoint returns. `byStatusBucket` keys (`operational | expired | cancelled | expiring_soon`) are consistent across module + endpoint + UI.
