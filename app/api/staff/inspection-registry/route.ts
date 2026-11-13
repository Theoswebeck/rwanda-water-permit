import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { localFileExists } from "@/lib/documents/file-availability";

const EMPTY_RESULT = {
  items: [],
  total: 0,
  summary: {
    total: 0,
    complying: 0,
    notComplying: 0,
    warnings: 0,
    cancellations: 0,
    fined: 0,
    suspended: 0,
  },
  pagination: { limit: 50, offset: 0, returned: 0 },
};

type InspectionRegistrySchema = {
  hasInspectionRegistry: boolean;
  hasPermitRegistry: boolean;
  registryHasDeletedAt: boolean;
  hasDocumentsTable: boolean;
  hasSystemOverrides: boolean;
};

async function detectSchema(): Promise<InspectionRegistrySchema> {
  const res = await query<{
    has_inspection_registry: boolean;
    has_permit_registry: boolean;
    registry_has_deleted_at: boolean;
    has_documents_table: boolean;
    has_system_overrides: boolean;
  }>(
    `select
       to_regclass('public.inspection_registry') is not null as has_inspection_registry,
       to_regclass('public.permit_registry') is not null as has_permit_registry,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'permit_registry'
           and column_name = 'deleted_at'
       ) as registry_has_deleted_at,
       to_regclass('public.inspection_registry_documents') is not null as has_documents_table,
       to_regclass('public.inspection_registry_system_overrides') is not null as has_system_overrides`
  );
  const row = res.rows[0];
  return {
    hasInspectionRegistry: Boolean(row?.has_inspection_registry),
    hasPermitRegistry: Boolean(row?.has_permit_registry),
    registryHasDeletedAt: Boolean(row?.registry_has_deleted_at),
    hasDocumentsTable: Boolean(row?.has_documents_table),
    hasSystemOverrides: Boolean(row?.has_system_overrides),
  };
}

/**
 * Unified register: manually-imported inspection registry rows UNION ALL
 * finalized (approved) system inspections — same pattern as the permit
 * registry's combined_permits CTE. System rows continue the registry's
 * row numbering, and their compliance status is derived from the
 * recommended action because the inspections.compliance_status column is
 * not populated by the inspection form. Staff corrections to system rows sit
 * in inspection_registry_system_overrides and win over the system value.
 */
function buildUnifiedCte(schema: InspectionRegistrySchema): string {
  // Registry max row index, used to continue numbering for system rows.
  const maxRowExpr = schema.hasInspectionRegistry
    ? `(SELECT COALESCE(MAX(row_index), 0) FROM public.inspection_registry)`
    : `0`;

  // Resolve the inspected permit for system inspections. owner_id can go
  // stale when the permit registry is re-imported (TRUNCATE+INSERT), so fall
  // back to the permit number frozen in locked_field_overrides — the same
  // fallback the staff inspections tab uses.
  const registryJoin = schema.hasPermitRegistry
    ? `LEFT JOIN LATERAL (
        SELECT p2.permit_number, p2.permit_holder, p2.location, p2.authorized_activity
        FROM public.permit_registry p2
        WHERE (
            p2.id = i.owner_id
            OR lower(p2.permit_number) = lower(nullif(btrim(coalesce(i.locked_field_overrides->>'permitNumber', '')), ''))
          )
          ${schema.registryHasDeletedAt ? `AND p2.deleted_at IS NULL` : ``}
        ORDER BY (p2.id = i.owner_id) DESC
        LIMIT 1
      ) pr ON i.owner_kind = 'permit_registry'`
    : `LEFT JOIN LATERAL (
        SELECT null::text as permit_number, null::text as permit_holder,
               null::text as location, null::text as authorized_activity
      ) pr ON false`;

  const overridesJoin = schema.hasSystemOverrides
    ? `LEFT JOIN public.inspection_registry_system_overrides o ON o.inspection_id = i.id`
    : `LEFT JOIN LATERAL (
        SELECT null::text as permit_holder, null::text as permit_number, null::text as activity,
               null::text as district, null::text as compliance_status, null::text as observation,
               null::text as action, null::text as inspection_date_text, null::timestamptz as updated_at
      ) o ON false`;

  const registryRows = schema.hasInspectionRegistry
    ? `
      SELECT
        ir.id::text as id,
        ir.row_index,
        ir.inspection_number,
        ir.permit_holder,
        ir.permit_number,
        ir.activity,
        ir.district,
        -- A few imported rows have a blank compliance cell; derive it from the
        -- recorded action so Complying + Not complying always sums to the total.
        CASE
          WHEN nullif(btrim(coalesce(ir.compliance_status, '')), '') IS NOT NULL THEN btrim(ir.compliance_status)
          WHEN lower(coalesce(ir.action, '')) LIKE '%no action%' THEN 'Complying'
          WHEN nullif(btrim(coalesce(ir.action, '')), '') IS NOT NULL THEN 'Not complying'
          ELSE null
        END as compliance_status,
        ir.observation,
        ir.action,
        ir.inspection_date_text,
        null::text as inspection_date_iso,
        ir.created_at,
        ir.updated_at,
        'registry'::text as source_kind
      FROM public.inspection_registry ir

      UNION ALL
      `
    : ``;

  return `
    WITH combined_inspections AS (
      ${registryRows}
      SELECT
        i.id::text as id,
        ${maxRowExpr} + ROW_NUMBER() OVER (
          ORDER BY coalesce(i.completed_date, i.scheduled_date) ASC, i.created_at ASC
        ) AS row_index,
        lpad((${maxRowExpr} + ROW_NUMBER() OVER (
          ORDER BY coalesce(i.completed_date, i.scheduled_date) ASC, i.created_at ASC
        ))::text, 4, '0') || '/INSP/' || to_char(coalesce(i.completed_date, i.scheduled_date), 'YYYY') AS inspection_number,
        coalesce(
          o.permit_holder,
          pr.permit_holder,
          nullif(btrim(coalesce(i.locked_field_overrides->>'permitHolderName', '')), ''),
          i.manual_inspection_subject,
          i.operator_name,
          'Unknown'
        ) as permit_holder,
        coalesce(
          o.permit_number,
          CASE
            WHEN i.owner_kind = 'manual_unpermitted' THEN null
            ELSE coalesce(
              pr.permit_number,
              nullif(nullif(btrim(coalesce(i.locked_field_overrides->>'permitNumber', '')), ''), 'N/A')
            )
          END
        ) as permit_number,
        coalesce(o.activity, nullif(btrim(coalesce(pr.authorized_activity, '')), ''), i.activity_type) as activity,
        coalesce(o.district, pr.location) as district,
        -- Same rule as imported rows: an explicit compliance wins, else derive
        -- it from the (possibly corrected) action.
        CASE
          WHEN o.compliance_status IS NOT NULL THEN o.compliance_status
          WHEN coalesce(o.action, nullif(btrim(coalesce(i.recommendations, '')), '')) IS NULL THEN null
          WHEN lower(coalesce(o.action, i.recommendations)) LIKE '%no action%' THEN 'Complying'
          ELSE 'Not complying'
        END as compliance_status,
        coalesce(o.observation, nullif(btrim(coalesce(i.general_conclusion, '')), '')) as observation,
        coalesce(o.action, nullif(btrim(coalesce(i.recommendations, '')), '')) as action,
        coalesce(o.inspection_date_text, to_char(coalesce(i.completed_date, i.scheduled_date), 'FMDD Mon YYYY')) as inspection_date_text,
        coalesce(i.completed_date, i.scheduled_date)::date::text as inspection_date_iso,
        i.created_at,
        -- The edit concurrency token; the PATCH route recomputes it the same way.
        greatest(i.updated_at, o.updated_at) as updated_at,
        'system'::text as source_kind
      FROM public.inspections i
      ${registryJoin}
      ${overridesJoin}
      WHERE i.workflow_status = 'approved'
    )
  `;
}

type Filters = {
  q: string;
  compliance: string;
  action: string;
  observations: string;
  source: string;
};

function buildWhere(filters: Filters, values: unknown[]): string {
  const where: string[] = [];
  const p = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.q) {
    const pv = p(`%${filters.q}%`);
    where.push(
      `(lower(coalesce(ci.permit_holder, '')) like ${pv}
        or lower(coalesce(ci.permit_number, '')) like ${pv}
        or lower(coalesce(ci.inspection_number, '')) like ${pv}
        or lower(coalesce(ci.activity, '')) like ${pv}
        or lower(coalesce(ci.district, '')) like ${pv}
        or lower(coalesce(ci.action, '')) like ${pv}
        or lower(coalesce(ci.observation, '')) like ${pv})`
    );
  }

  if (filters.compliance === "complying") {
    where.push(`lower(coalesce(ci.compliance_status, '')) = 'complying'`);
  } else if (filters.compliance === "not_complying") {
    where.push(`lower(coalesce(ci.compliance_status, '')) like 'not%'`);
  }

  if (filters.action === "no_action") {
    where.push(`lower(coalesce(ci.action, '')) like '%no action%'`);
  } else if (filters.action === "warning") {
    where.push(`(lower(coalesce(ci.action, '')) like '%warning%' or lower(coalesce(ci.action, '')) like '%reminder%')`);
  } else if (filters.action === "cancellation") {
    where.push(`lower(coalesce(ci.action, '')) like '%cancel%'`);
  } else if (filters.action === "fined") {
    where.push(`lower(coalesce(ci.action, '')) like '%fine%'`);
  } else if (filters.action === "suspension") {
    where.push(`lower(coalesce(ci.action, '')) like '%suspen%'`);
  }

  if (filters.observations === "with") {
    where.push(`ci.observation IS NOT NULL`);
  }

  if (filters.source === "registry" || filters.source === "system") {
    where.push(`ci.source_kind = ${p(filters.source)}`);
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

export async function GET(req: NextRequest) {
  try {
    const schema = await detectSchema();

    const { searchParams } = new URL(req.url);
    const filters: Filters = {
      q: searchParams.get("q")?.trim().toLowerCase() || "",
      compliance: searchParams.get("compliance") || "all",
      action: searchParams.get("action") || "all",
      observations: searchParams.get("observations") || "all",
      source: searchParams.get("source") || "all",
    };
    const sortBy = searchParams.get("sort_by") || "row_index";
    const sortDir = searchParams.get("sort_dir") === "desc" ? "desc" : "asc";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const validSortColumns = [
      "row_index",
      "inspection_number",
      "permit_holder",
      "permit_number",
      "compliance_status",
      "action",
    ];
    const column = validSortColumns.includes(sortBy) ? sortBy : "row_index";

    const cte = buildUnifiedCte(schema);

    // Summary panels reflect the searched dataset (q + source) but not the
    // panel filters themselves, so clicking a panel doesn't zero out the others.
    const summaryValues: unknown[] = [];
    const summaryWhere = buildWhere(
      { ...filters, compliance: "all", action: "all", observations: "all" },
      summaryValues
    );
    const summaryRes = await query<{
      total: string;
      complying: string;
      not_complying: string;
      warnings: string;
      cancellations: string;
      fined: string;
      suspended: string;
    }>(
      `${cte}
      SELECT
        count(*)::text as total,
        count(*) FILTER (WHERE lower(coalesce(ci.compliance_status, '')) = 'complying')::text as complying,
        count(*) FILTER (WHERE lower(coalesce(ci.compliance_status, '')) like 'not%')::text as not_complying,
        count(*) FILTER (WHERE lower(coalesce(ci.action, '')) like '%warning%' or lower(coalesce(ci.action, '')) like '%reminder%')::text as warnings,
        count(*) FILTER (WHERE lower(coalesce(ci.action, '')) like '%cancel%')::text as cancellations,
        count(*) FILTER (WHERE lower(coalesce(ci.action, '')) like '%fine%')::text as fined,
        count(*) FILTER (WHERE lower(coalesce(ci.action, '')) like '%suspen%')::text as suspended
      FROM combined_inspections ci
      ${summaryWhere}`,
      summaryValues
    );

    const values: unknown[] = [];
    const whereSql = buildWhere(filters, values);

    const countRes = await query<{ n: string }>(
      `${cte} SELECT count(*)::text as n FROM combined_inspections ci ${whereSql}`,
      values
    );
    const filteredTotal = Number(countRes.rows[0]?.n || 0);

    const pageValues = [...values];
    pageValues.push(offset);
    const offsetParam = `$${pageValues.length}`;
    pageValues.push(limit);
    const limitParam = `$${pageValues.length}`;

    const docsSelect = schema.hasDocumentsTable
      ? `(
          SELECT COALESCE(json_agg(json_build_object(
            'id', d.id, 'doc_name', d.doc_name, 'doc_path', d.doc_path,
            'doc_mime_type', d.doc_mime_type, 'uploaded_by', d.uploaded_by, 'uploaded_at', d.uploaded_at
          ) ORDER BY d.uploaded_at ASC), '[]'::json)
          FROM public.inspection_registry_documents d
          WHERE d.inspection_id = ci.id::uuid
        ) AS documents`
      : `'[]'::json AS documents`;

    const pageRes = await query(
      `${cte}
      SELECT
        ci.id,
        ci.row_index,
        ci.inspection_number,
        ci.permit_holder,
        ci.permit_number,
        ci.activity,
        ci.district,
        ci.compliance_status,
        ci.observation,
        ci.action,
        ci.inspection_date_text,
        ci.inspection_date_iso,
        ci.created_at,
        ci.updated_at,
        ci.source_kind,
        ${docsSelect}
      FROM combined_inspections ci
      ${whereSql}
      ORDER BY ${column} ${sortDir} NULLS LAST
      OFFSET ${offsetParam} LIMIT ${limitParam}`,
      pageValues
    );

    const summary = summaryRes.rows[0];
    return NextResponse.json({
      // Flag documents whose file is gone from disk; doc_path stays server-side.
      items: await Promise.all(
        (pageRes.rows || []).map(async (row: Record<string, unknown>) => ({
          ...row,
          documents: await Promise.all(
            (Array.isArray(row.documents) ? row.documents : []).map(
              async ({ doc_path, ...doc }: { doc_path: string } & Record<string, unknown>) => ({
                ...doc,
                file_available: await localFileExists(doc_path),
              })
            )
          ),
        }))
      ),
      total: filteredTotal,
      summary: {
        total: Number(summary?.total || 0),
        complying: Number(summary?.complying || 0),
        notComplying: Number(summary?.not_complying || 0),
        warnings: Number(summary?.warnings || 0),
        cancellations: Number(summary?.cancellations || 0),
        fined: Number(summary?.fined || 0),
        suspended: Number(summary?.suspended || 0),
      },
      pagination: { limit, offset, returned: (pageRes.rows || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("inspection-registry GET failed:", msg);
    return NextResponse.json({ ...EMPTY_RESULT, error: msg }, { status: 500 });
  }
}
