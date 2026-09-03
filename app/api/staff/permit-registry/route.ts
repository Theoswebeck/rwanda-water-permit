import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  detectRegistrySchema,
  buildRegistryWhere,
  REGISTRY_ACTIVITY_CODE_SQL,
  REGISTRY_ACTIVITY_LABEL_SQL,
} from "@/lib/permit/registry-counts";
import { buildUnifiedCte, REGISTRY_STATUS_COUNT_SQL } from "@/lib/permit/registry-unified";
import { resolveCatchment } from "@/lib/permit/catchment-resolution";

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
    const activity = searchParams.get("activity") || "all";
    const status = searchParams.get("status") || "all";
    const catchment = searchParams.get("catchment") || "all";
    const district = searchParams.get("district") || "all";
    const sortBy = searchParams.get("sort_by") || (schema.hasRowIndex ? "row_index" : "serial_number");
    const sortDir = searchParams.get("sort_dir") === "desc" ? "desc" : "asc";
    // parseInt("abc") is NaN, which Postgres rejects as an invalid bigint — fall
    // back to the defaults rather than 500ing on a malformed query string.
    const parsedLimit = parseInt(searchParams.get("limit") || "200", 10);
    const parsedOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 200;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const validSortColumns = ["serial_number", "permit_holder", "permit_number", "status", "regime", "row_index"];
    // "activity" sorts on the derived label rather than a stored column, so the
    // order matches the text shown in the column.
    const orderByExpr = sortBy === "activity"
      ? REGISTRY_ACTIVITY_LABEL_SQL
      : validSortColumns.includes(sortBy)
        ? sortBy
        : (schema.hasRowIndex ? "row_index" : "serial_number");

    const cte = buildUnifiedCte(schema);

    // Catchment / district are not stored columns — they're derived per row by
    // the same resolver the Water Use Dashboard uses (coordinates → polygon,
    // location text → district), so both screens agree. Resolve matching ids
    // here, then filter in SQL so pagination, sorting and summary stay exact.
    // ponytail: full scan of ~1.4k rows per filtered request; precompute a
    // stored column if the registry ever grows by orders of magnitude.
    let permitIds: string[] | undefined;
    if (catchment !== "all" || district !== "all") {
      const rowsRes = await query<{
        id: string;
        latitude: number | null;
        longitude: number | null;
        location: string | null;
      }>(`${cte} SELECT pr.id, pr.latitude, pr.longitude, pr.location FROM combined_permits pr`);
      // "__UNSPECIFIED__" selects rows the resolver can't place (no usable
      // coordinates / unparseable location).
      const wantDistrict = district.trim().toLowerCase();
      permitIds = rowsRes.rows
        .filter((row) => {
          const resolved = resolveCatchment(row);
          if (catchment === "__UNSPECIFIED__") {
            if (resolved.code !== null) return false;
          } else if (catchment !== "all" && resolved.code !== catchment) {
            return false;
          }
          if (district === "__UNSPECIFIED__") {
            if (resolved.district !== null) return false;
          } else if (district !== "all" && (resolved.district ?? "").toLowerCase() !== wantDistrict) {
            return false;
          }
          return true;
        })
        .map((row) => row.id);
    }

    // deleted_at is already filtered inside the CTE — don't add it again in WHERE.
    const schemaForWhere = { ...schema, hasDeletedAt: false };
    const filters = { q, regime, status, activityCode: activity, permitIds };
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
        ${REGISTRY_STATUS_COUNT_SQL},
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
        ${REGISTRY_ACTIVITY_CODE_SQL} as activity_code,
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
      ORDER BY ${orderByExpr} ${sortDir} NULLS LAST
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
