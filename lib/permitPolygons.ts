import type { Feature, Geometry } from 'geojson';
import { query } from '@/lib/db/postgres';

export interface PermitPolygon {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: Feature<Geometry>;
  status: string;
  issuedDate: string;
  expiryDate: string;
  waterPurpose: string;
}

interface PermitPolygonData {
  permit_id: string;
  permit_number: string;
  project_title: string;
  coordinates_geojson: unknown;
  status: string;
  issued_date: string;
  expiry_date: string;
  water_purpose: string;
}

/**
 * Fetch all approved permit geometries from the database.
 * Returns permits with Point, Polygon, or MultiPolygon geometry.
 * This is intended for server/API usage.
 */
export async function fetchApprovedPermitPolygons(): Promise<PermitPolygon[]> {
  const data = await query<PermitPolygonData>(
    `
    with combined_permits as (
      select
        p.id as permit_id,
        p.permit_number::text as permit_number,
        coalesce(a.project_title, '') as project_title,
        st_asgeojson(coalesce(p.coordinates, a.coordinates))::jsonb as coordinates_geojson,
        -- A lapsed permit is never written back to 'expired', so derive it from
        -- the date the way lib/permit/registry-unified.ts does — otherwise the
        -- map paints an expired concession green and counts it as active.
        case
          when p.status::text in ('suspended', 'revoked') then p.status::text
          when p.expiry_date is not null and p.expiry_date::date < current_date then 'expired'
          else p.status::text
        end as status,
        p.issued_date::text as issued_date,
        p.expiry_date::text as expiry_date,
        p.purpose::text as water_purpose,
        0 as source_priority,
        null::timestamptz as source_updated_at
      from public.permits p
      join public.applications a on a.id = p.application_id
      where coalesce(p.coordinates, a.coordinates) is not null
        and st_isvalid(coalesce(p.coordinates, a.coordinates))

      union all

      select
        pr.id as permit_id,
        pr.permit_number::text as permit_number,
        coalesce(pr.permit_holder, pr.location, 'Permit registry entry') as project_title,
        st_asgeojson(pr.map_geometry)::jsonb as coordinates_geojson,
        case
          when pr.map_status::text in ('suspended', 'revoked') then pr.map_status::text
          when pr.expiration_date is not null and pr.expiration_date::date < current_date then 'expired'
          else pr.map_status::text
        end as status,
        coalesce(pr.issuance_date::text, current_date::text) as issued_date,
        coalesce(pr.expiration_date::text, pr.issuance_date::text, current_date::text) as expiry_date,
        coalesce(pr.map_purpose::text, 'other') as water_purpose,
        1 as source_priority,
        pr.map_updated_at as source_updated_at
      from public.permit_registry pr
      where pr.map_geometry is not null
        and st_isvalid(pr.map_geometry)
        and pr.map_status is not null
    ),
    deduped as (
      select
        cp.permit_id,
        cp.permit_number,
        cp.project_title,
        cp.coordinates_geojson,
        cp.status,
        cp.issued_date,
        cp.expiry_date,
        cp.water_purpose,
        row_number() over (
          partition by cp.permit_number
          order by cp.source_priority asc, cp.source_updated_at desc nulls last
        ) as row_rank
      from combined_permits cp
    )
    select
      permit_id,
      permit_number,
      project_title,
      coordinates_geojson,
      status,
      issued_date,
      expiry_date,
      water_purpose
    from deduped
    where row_rank = 1
    `
  )

  return data.rows
    .filter((permit: PermitPolygonData) => Boolean(permit.coordinates_geojson))
    .map((permit: PermitPolygonData) => {
      const feature: Feature<Geometry> = {
        type: 'Feature',
        geometry: permit.coordinates_geojson as Geometry,
        properties: {},
      };

      return {
        permitId: permit.permit_id,
        permitNumber: permit.permit_number,
        projectTitle: permit.project_title,
        coordinates: feature,
        status: permit.status,
        issuedDate: permit.issued_date,
        expiryDate: permit.expiry_date,
        waterPurpose: permit.water_purpose,
      };
    });
}




