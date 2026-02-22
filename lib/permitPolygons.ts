import type { Feature, Geometry } from 'geojson';
import { createAdminClient } from '@/lib/supabase/admin';

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
  coordinates_geojson: any;
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
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_approved_permit_polygons');
  if (error) {
    throw new Error(`Failed to fetch permit polygons: ${error.message}`);
  }
  if (!data) return [];

  return (data as PermitPolygonData[])
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




