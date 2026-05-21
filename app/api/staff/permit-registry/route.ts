import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  detectRegistrySchema,
  buildRegistryWhere,
  type RegistrySchema,
} from "@/lib/permit/registry-counts";

const EMPTY_RESULT = {
  items: [],
  total: 0,
  summary: { total: 0, operational: 0, expired: 0, cancelled: 0, expiringSoon: 0, regimeTypes: 0 },
  pagination: { limit: 50, offset: 0, returned: 0 },
};

function buildUnifiedCte(schema: RegistrySchema): string {
  const regimeCase = schema.hasPostGIS
    ? `CASE WHEN geometrytype(coalesce(p.coordinates, a.coordinates)) IN ('POLYGON', 'MULTIPOLYGON') THEN 'Concession' ELSE 'Authorization' END`
    : `'Authorization'::text`;

  const latExpr = schema.hasPostGIS
    ? `CASE WHEN coalesce(p.coordinates, a.coordinates) IS NULL THEN NULL ELSE st_y(st_centroid(coalesce(p.coordinates, a.coordinates))) END`
    : `NULL::float8`;

  const lngExpr = schema.hasPostGIS
    ? `CASE WHEN coalesce(p.coordinates, a.coordinates) IS NULL THEN NULL ELSE st_x(st_centroid(coalesce(p.coordinates, a.coordinates))) END`
    : `NULL::float8`;

  const registryDeletedFilter = schema.hasDeletedAt ? `WHERE pr.deleted_at IS NULL` : ``;

  // Exclude system permits whose number already appears in the registry (either
  // exact match or case-insensitive) so we never show duplicates.
  const notInRegistry = schema.hasDeletedAt
    ? `NOT EXISTS (
        SELECT 1 FROM public.permit_registry prx
        WHERE lower(prx.permit_number) = lower(p.permit_number::text)
          AND prx.deleted_at IS NULL
      )`
    : `NOT EXISTS (
        SELECT 1 FROM public.permit_registry prx
        WHERE lower(prx.permit_number) = lower(p.permit_number::text)
      )`;

  return `
    WITH combined_permits AS (
      -- Rows from the manually-imported permit registry
      SELECT
        pr.id,
        ${schema.hasRowIndex ? `pr.row_index,` : `null::integer as row_index,`}
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
        pr.issuance_date,
        ${schema.hasRawDateColumns ? `pr.issuance_date_raw, pr.expiration_date_raw,` : `null::text as issuance_date_raw, null::text as expiration_date_raw,`}
        pr.duration,
        pr.expiration_date,
        upper(coalesce(pr.status, 'OPERATIONAL')) as status,
        pr.contact,
        ${schema.hasDocColumns
          ? `pr.uploaded_doc_path, pr.uploaded_doc_name, pr.uploaded_doc_mime_type, pr.uploaded_doc_uploaded_at,`
          : `null::text as uploaded_doc_path, null::text as uploaded_doc_name, null::text as uploaded_doc_mime_type, null::timestamptz as uploaded_doc_uploaded_at,`}
        ${schema.hasDeletedAt ? `pr.deleted_at,` : `null::timestamptz as deleted_at,`}
        ${schema.hasManuallyEditedAt ? `pr.manually_edited_at,` : `null::timestamptz as manually_edited_at,`}
        pr.created_at,
        pr.updated_at,
        'registry'::text as source_kind
      FROM public.permit_registry pr
      ${registryDeletedFilter}

      UNION ALL

      -- System-generated permits that have no registry entry yet
      SELECT
        p.id,
        null::integer as row_index,
        null::integer as serial_number,
        coalesce(a.project_title, 'Unknown Permit Holder') as permit_holder,
        p.permit_number::text as permit_number,
        ${regimeCase} as regime,
        p.water_source::text as water_source,
        null::text as volume_or_area,
        null::text as method_of_water_taking,
        a.project_description as authorized_activity,
        concat_ws(', ', a.district, a.province::text) as location,
        ${latExpr} as latitude,
        ${lngExpr} as longitude,
        p.issued_date as issuance_date,
        null::text as issuance_date_raw,
        null::text as expiration_date_raw,
        null::text as duration,
        p.expiry_date as expiration_date,
        CASE
          WHEN p.status = 'expired'::permit_status     THEN 'EXPIRED'
          WHEN p.status = 'expiring_soon'::permit_status THEN 'EXPIRING_SOON'
          WHEN p.status = 'suspended'::permit_status   THEN 'SUSPENDED'
          WHEN p.status = 'revoked'::permit_status     THEN 'REVOKED'
          ELSE 'OPERATIONAL'
        END as status,
        null::text as contact,
        null::text as uploaded_doc_path,
        null::text as uploaded_doc_name,
        null::text as uploaded_doc_mime_type,
        null::timestamptz as uploaded_doc_uploaded_at,
        null::timestamptz as deleted_at,
        null::timestamptz as manually_edited_at,
        p.created_at,
        p.updated_at,
        'permit'::text as source_kind
      FROM public.permits p
      JOIN public.applications a ON a.id = p.application_id
      WHERE p.permit_number IS NOT NULL
        AND ${notInRegistry}
    )
  `;
}

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

    const cte = buildUnifiedCte(schema);

    // deleted_at is already filtered inside the CTE — don't add it again in WHERE.
    const schemaForWhere = { ...schema, hasDeletedAt: false };
    const filters = { q, regime, status };
    const { sql: whereSql, values } = buildRegistryWhere(schemaForWhere, filters);

    // Compute summary counts from the unified dataset.
    const summaryRes = await query<{
      total: string;
      operational: string;
      expired: string;
      cancelled: string;
      expiring_soon: string;
      regime_types: string;
    }>(
      `${cte}
      SELECT
        count(*)::text as total,
        count(*) FILTER (WHERE
          (upper(coalesce(pr.status, '')) LIKE '%OPERATIONAL%'
           OR (upper(coalesce(pr.status, '')) LIKE '%ACTIVE%'
               AND upper(coalesce(pr.status, '')) NOT LIKE '%INACTIVE%'))
          AND upper(coalesce(pr.status, '')) NOT LIKE '%NON-OPERATIONAL%'
          AND upper(coalesce(pr.status, '')) NOT LIKE '%NON OPERATIONAL%'
        )::text as operational,
        count(*) FILTER (WHERE upper(coalesce(pr.status, '')) LIKE '%EXPIRED%')::text as expired,
        count(*) FILTER (WHERE upper(coalesce(pr.status, '')) LIKE '%CANCEL%'
          AND upper(coalesce(pr.status, '')) NOT LIKE '%EXPIRED%')::text as cancelled,
        count(*) FILTER (WHERE
          pr.expiration_date IS NOT NULL
          AND pr.expiration_date >= current_date
          AND pr.expiration_date <= (current_date + INTERVAL '3 months')
        )::text as expiring_soon,
        count(DISTINCT nullif(trim(coalesce(pr.regime, '')), ''))::text as regime_types
      FROM combined_permits pr
      ${whereSql}`,
      values
    );

    const docsSelect = schema.hasDocumentsTable
      ? `(
          SELECT COALESCE(json_agg(d ORDER BY d.uploaded_at ASC), '[]'::json)
          FROM public.permit_registry_documents d
          WHERE d.permit_number = pr.permit_number
        ) AS documents,`
      : `'[]'::json AS documents,`;

    const pageValues = [...values];
    pageValues.push(offset);
    const offsetParam = `$${pageValues.length}`;
    pageValues.push(limit);
    const limitParam = `$${pageValues.length}`;

    const pageRes = await query(
      `${cte}
      SELECT
        pr.id,
        pr.row_index,
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
        pr.issuance_date_raw,
        pr.duration,
        pr.expiration_date,
        pr.expiration_date_raw,
        pr.status,
        pr.contact,
        pr.uploaded_doc_path,
        pr.uploaded_doc_name,
        pr.uploaded_doc_mime_type,
        pr.uploaded_doc_uploaded_at,
        pr.deleted_at,
        pr.manually_edited_at,
        ${docsSelect}
        pr.created_at,
        pr.updated_at,
        pr.source_kind
      FROM combined_permits pr
      ${whereSql}
      ORDER BY ${column} ${sortDir} NULLS LAST
      OFFSET ${offsetParam} LIMIT ${limitParam}`,
      pageValues
    );

    const summary = summaryRes.rows[0];
    return NextResponse.json({
      items: pageRes.rows || [],
      total: Number(summary?.total || 0),
      summary: {
        total: Number(summary?.total || 0),
        operational: Number(summary?.operational || 0),
        expired: Number(summary?.expired || 0),
        cancelled: Number(summary?.cancelled || 0),
        expiringSoon: Number(summary?.expiring_soon || 0),
        regimeTypes: Number(summary?.regime_types || 0),
      },
      pagination: { limit, offset, returned: (pageRes.rows || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
