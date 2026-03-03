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
    select
      p.id as permit_id,
      p.permit_number,
      coalesce(a.project_title, '') as project_title,
      st_asgeojson(a.coordinates)::jsonb as coordinates_geojson,
      p.status::text as status,
      p.issued_date::text as issued_date,
      p.expiry_date::text as expiry_date,
      p.purpose::text as water_purpose
    from public.permits p
    join public.applications a on a.id = p.application_id
    where p.status in ('active', 'expiring_soon')
      and a.coordinates is not null
    `
  )

  return data.rows
    .filter((permit) => Boolean(permit.coordinates_geojson))
    .map((permit) => {
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




