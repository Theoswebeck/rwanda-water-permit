import type { Feature, Polygon } from 'geojson';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PermitPolygon {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: Feature<Polygon>;
  status: string;
  issuedDate: string;
  expiryDate: string;
}

interface PermitPolygonData {
  permit_id: string;
  permit_number: string;
  project_title: string;
  coordinates_geojson: any;
  status: string;
  issued_date: string;
  expiry_date: string;
}

/**
 * Fetch all approved permit polygons from the database.
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
      const feature: Feature<Polygon> = {
        type: 'Feature',
        geometry: permit.coordinates_geojson as Polygon,
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
      };
    });
}


