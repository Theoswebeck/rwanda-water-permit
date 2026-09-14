/**
 * The unified Permit Registry dataset.
 *
 * "The registry" is really two sources stitched together: rows imported from
 * RWB's registry XLSX (`permit_registry`), plus permits issued by this system
 * that do not have a registry row yet (`permits` + `applications`). Every
 * surface that reports registry numbers — the staff Permit Registry table, its
 * summary cards, and the public Water Use Dashboard — must read that same
 * union, or the public total will not match the internal one.
 *
 * This module owns the union and the status buckets so there is exactly one
 * definition of both.
 */

import type { RegistrySchema } from "@/lib/permit/registry-counts";

/**
 * Permit number of a disabled test permit that must never appear in the staff
 * registry. See docs/superpowers/specs/2026-06-10-disable-test-permit-0925-design.md
 */
const EXCLUDED_TEST_PERMIT_NUMBER = "0925/RWB/2026";

export function buildUnifiedCte(schema: RegistrySchema): string {
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
        pr.issuance_date::text as issuance_date,
        ${schema.hasRawDateColumns ? `pr.issuance_date_raw, pr.expiration_date_raw,` : `null::text as issuance_date_raw, null::text as expiration_date_raw,`}
        pr.duration,
        pr.expiration_date::text as expiration_date,
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
        (
          SELECT COALESCE(MAX(row_index), 0) FROM public.permit_registry
          ${schema.hasDeletedAt ? `WHERE deleted_at IS NULL` : ``}
        ) + ROW_NUMBER() OVER (ORDER BY p.permit_number ASC, p.issued_date ASC, p.created_at ASC) AS row_index,
        null::integer as serial_number,
        coalesce(a.project_title, 'Unknown Permit Holder') as permit_holder,
        p.permit_number::text as permit_number,
        ${regimeCase} as regime,
        p.water_source::text as water_source,
        CASE
          WHEN p.water_allowance IS NOT NULL AND p.water_allowance > 0
            THEN TRIM(p.water_allowance::text) || ' ' || COALESCE(p.allowance_unit, 'm³/year')
          ELSE null
        END as volume_or_area,
        a.water_taking_method as method_of_water_taking,
        a.project_description as authorized_activity,
        concat_ws(', ', a.district, a.province::text) as location,
        ${latExpr} as latitude,
        ${lngExpr} as longitude,
        p.issued_date::text as issuance_date,
        null::text as issuance_date_raw,
        null::text as expiration_date_raw,
        CASE
          WHEN a.proposed_duration_years IS NOT NULL AND a.proposed_duration_years > 0
            THEN a.proposed_duration_years::text || ' year' || CASE WHEN a.proposed_duration_years = 1 THEN '' ELSE 's' END
          WHEN a.proposed_duration_months IS NOT NULL AND a.proposed_duration_months > 0
            THEN a.proposed_duration_months::text || ' month' || CASE WHEN a.proposed_duration_months = 1 THEN '' ELSE 's' END
          ELSE null
        END as duration,
        p.expiry_date::text as expiration_date,
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
        -- Surgical exclusion: a disabled test permit that must not appear in the
        -- staff registry. Unlike the public surfaces (which hide all non-active
        -- permits), staff legitimately need to see other suspended/revoked
        -- permits, so this is scoped to the specific permit number. See
        -- docs/superpowers/specs/2026-06-10-disable-test-permit-0925-design.md
        AND p.permit_number <> '${EXCLUDED_TEST_PERMIT_NUMBER}'
    )
  `;
}

/**
 * Status-bucket count expressions over `combined_permits pr`.
 *
 * Exported so the staff registry summary and the public dashboard's headline
 * numbers are computed by literally the same SQL — the public "1,318 / 1,253 /
 * 46 / 19" must equal what staff see, or the two pages contradict each other.
 */
export const REGISTRY_STATUS_COUNT_SQL = `
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
    AND pr.expiration_date::date >= current_date
    AND pr.expiration_date::date <= (current_date + INTERVAL '3 months')
  )::text as expiring_soon
`;

/**
 * Status expression for the lowercase `permit_status` enum columns
 * (`permits.status`, `permit_registry.map_status`).
 *
 * Nothing ever writes `expired` back to those columns when a permit lapses, so
 * every surface must derive it from the date or it will keep reporting a dead
 * permit as active. Suspended/revoked win over expiry, matching the registry
 * CTE above. Comparison is `::date < current_date` so a permit stays valid
 * through the whole of its expiry day.
 */
export function expiredAwareStatusSql(statusCol: string, expiryCol: string): string {
  return `case
          when ${statusCol}::text in ('suspended', 'revoked') then ${statusCol}::text
          when ${expiryCol} is not null and ${expiryCol}::date < current_date then 'expired'
          else ${statusCol}::text
        end`;
}
