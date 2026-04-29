import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

const EMPTY_RESULT = {
  items: [],
  total: 0,
  summary: { total: 0, operational: 0, expired: 0, cancelled: 0, expiringSoon: 0, regimeTypes: 0 },
  pagination: { limit: 50, offset: 0, returned: 0 },
};

async function detectSchema(): Promise<{
  hasRegistry: boolean;
  hasDocColumns: boolean;
  hasRawDateColumns: boolean;
  hasRowIndex: boolean;
  hasDeletedAt: boolean;
  hasManuallyEditedAt: boolean;
  hasPostGIS: boolean;
  hasDocumentsTable: boolean;
}> {
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

export async function GET(req: NextRequest) {
  try {
    const schema = await detectSchema();

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

    // Build dynamic SELECT columns
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

    // Build WHERE filters
    const where: string[] = [];
    const values: unknown[] = [];
    const p = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (schema.hasDeletedAt) {
      where.push("pr.deleted_at is null");
    }
    if (regime && regime !== "all") where.push(`lower(coalesce(pr.regime, '')) = lower(${p(regime)})`);
    if (status && status !== "all") {
      const normalizedStatus = status.toUpperCase();
      if (normalizedStatus === "__ACTIVE__") {
        where.push(`(upper(coalesce(pr.status, '')) like '%OPERATIONAL%' or (upper(coalesce(pr.status, '')) like '%ACTIVE%' and upper(coalesce(pr.status, '')) not like '%INACTIVE%')) and upper(coalesce(pr.status, '')) not like '%NON-OPERATIONAL%' and upper(coalesce(pr.status, '')) not like '%NON OPERATIONAL%'`);
      } else if (normalizedStatus === "__EXPIRED__") {
        where.push(`upper(coalesce(pr.status, '')) like '%EXPIRED%'`);
      } else if (normalizedStatus === "__CANCELLED__") {
        where.push(`upper(coalesce(pr.status, '')) like '%CANCEL%' and upper(coalesce(pr.status, '')) not like '%EXPIRED%'`);
      } else if (normalizedStatus === "__ABOUT_TO_EXPIRE__") {
        where.push(`pr.expiration_date is not null and pr.expiration_date >= current_date and pr.expiration_date <= (current_date + interval '3 months')`);
      } else {
        where.push(`upper(coalesce(pr.status, '')) = ${p(normalizedStatus)}`);
      }
    }
    if (q) {
      const term = `%${q}%`;
      const pv = p(term);
      where.push(
        `(lower(coalesce(pr.permit_holder, '')) like ${pv} or lower(coalesce(pr.permit_number, '')) like ${pv} or lower(coalesce(pr.location, '')) like ${pv} or lower(coalesce(pr.water_source, '')) like ${pv} or lower(coalesce(pr.authorized_activity, '')) like ${pv})`
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Summary query
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

    // Paginated data query
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

    const summaryRow = summaryRes.rows[0];
    const count = Number(summaryRow?.total || "0");

    return NextResponse.json({
      items: pageRes.rows || [],
      total: count,
      summary: {
        total: count,
        operational: Number(summaryRow?.operational || "0"),
        expired: Number(summaryRow?.expired || "0"),
        cancelled: Number(summaryRow?.cancelled || "0"),
        expiringSoon: Number(summaryRow?.expiring_soon || "0"),
        regimeTypes: Number(summaryRow?.regime_types || "0"),
      },
      pagination: { limit, offset, returned: (pageRes.rows || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
