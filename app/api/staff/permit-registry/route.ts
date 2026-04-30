import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  detectRegistrySchema,
  fetchRegistrySummary,
  buildRegistryWhere,
} from "@/lib/permit/registry-counts";

const EMPTY_RESULT = {
  items: [],
  total: 0,
  summary: { total: 0, operational: 0, expired: 0, cancelled: 0, expiringSoon: 0, regimeTypes: 0 },
  pagination: { limit: 50, offset: 0, returned: 0 },
};

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
