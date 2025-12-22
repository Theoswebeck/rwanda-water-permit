import type { Feature, Polygon } from 'geojson';
import type { CoordinatePoint, IntersectionDetail } from './geoUtils';

export interface ValidationRequest {
  coordinates: CoordinatePoint[];
  applicationId?: string;
}

export interface ValidationResponse {
  isValid: boolean;
  intersections: IntersectionDetail[];
  errors: string[];
  polygon?: Feature<Polygon> | null;
  summary?: any;
}

/**
 * Client-side validation wrapper.
 *
 * The authoritative validation lives in `/api/validate-coordinates` so we can:
 * - avoid leaking sensitive DB logic to the client
 * - avoid RPC issues like ambiguous column references
 * - validate against ALL existing applications (service role)
 */
export async function validateCoordinates(
  request: ValidationRequest,
  _useServerValidation: boolean = true
): Promise<ValidationResponse> {
  try {
    const res = await fetch('/api/validate-coordinates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        useServerValidation: true
      })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      return {
        isValid: false,
        intersections: [],
        errors: [data?.error || data?.message || 'Validation request failed'],
        polygon: null
      };
    }

    return {
      isValid: Boolean(data.isValid),
      intersections: Array.isArray(data.intersections) ? data.intersections : [],
      errors: Array.isArray(data.errors) ? data.errors : [],
      polygon: data.polygon || null,
      summary: data.summary
    };
  } catch (error) {
    return {
      isValid: false,
      intersections: [],
      errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      polygon: null
    };
  }
}
