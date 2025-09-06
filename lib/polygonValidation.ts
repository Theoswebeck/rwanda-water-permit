// =============================================
// Polygon Validation Service
// Rwanda Water Board - Water Permit System
// =============================================

import { supabase } from './supabase';
import {
  coordinatesToGeoJSON,
  validatePolygonIntersection,
  type CoordinatePoint,
  type ValidationResult,
  type PermitPolygon,
  type IntersectionDetail
} from './geoUtils';
import type { Feature, Polygon } from 'geojson';

// =============================================
// TYPES AND INTERFACES
// =============================================

export interface ValidationRequest {
  coordinates: CoordinatePoint[];
  applicationId?: string; // Exclude this application if updating existing
}

export interface ValidationResponse {
  isValid: boolean;
  intersections: IntersectionDetail[];
  errors: string[];
  polygon?: Feature<Polygon>;
  summary?: {
    totalIntersections: number;
    significantIntersections: number;
    totalOverlapArea: number;
    maxOverlapPercentage: number;
  };
}

export interface PermitPolygonData {
  permit_id: string;
  permit_number: string;
  project_title: string;
  coordinates_geojson: any;
  status: string;
  issued_date: string;
  expiry_date: string;
}

// =============================================
// CORE VALIDATION FUNCTIONS
// =============================================

/**
 * Fetch all approved permit polygons from the database
 */
export async function fetchApprovedPermitPolygons(): Promise<PermitPolygon[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_approved_permit_polygons');

    if (error) {
      console.error('Error fetching approved permit polygons:', error);
      throw new Error(`Failed to fetch permit polygons: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    // Transform database response to PermitPolygon format
    return data.map((permit: PermitPolygonData) => ({
      permitId: permit.permit_id,
      permitNumber: permit.permit_number,
      projectTitle: permit.project_title,
      coordinates: permit.coordinates_geojson as Feature<Polygon>,
      status: permit.status,
      issuedDate: permit.issued_date,
      expiryDate: permit.expiry_date
    }));
  } catch (error) {
    console.error('Error in fetchApprovedPermitPolygons:', error);
    throw error;
  }
}

/**
 * Validate coordinates against existing permits (client-side validation)
 */
export async function validateCoordinatesClientSide(
  request: ValidationRequest
): Promise<ValidationResponse> {
  try {
    // Convert coordinates to GeoJSON polygon
    const polygon = coordinatesToGeoJSON(request.coordinates);
    if (!polygon) {
      return {
        isValid: false,
        intersections: [],
        errors: ['Failed to create valid polygon from coordinates']
      };
    }

    // Fetch existing approved permits
    const existingPermits = await fetchApprovedPermitPolygons();
    
    // Filter out current application if updating
    const permitsToCheck = request.applicationId
      ? existingPermits.filter(permit => permit.permitId !== request.applicationId)
      : existingPermits;

    // Perform validation
    const validation = validatePolygonIntersection(polygon, permitsToCheck);

    // Generate summary
    const significantIntersections = validation.intersections.filter(
      intersection => intersection.intersectionType !== 'boundaries_touch' && 
      intersection.overlapPercentage > 0.1
    );

    const totalOverlapArea = validation.intersections.reduce(
      (sum, intersection) => sum + intersection.intersectionArea, 0
    );

    const maxOverlapPercentage = validation.intersections.length > 0
      ? Math.max(...validation.intersections.map(i => i.overlapPercentage))
      : 0;

    return {
      isValid: validation.isValid,
      intersections: validation.intersections,
      errors: validation.errors,
      polygon: validation.polygon,
      summary: {
        totalIntersections: validation.intersections.length,
        significantIntersections: significantIntersections.length,
        totalOverlapArea: Math.round(totalOverlapArea * 100) / 100,
        maxOverlapPercentage: Math.round(maxOverlapPercentage * 100) / 100
      }
    };
  } catch (error) {
    console.error('Error in validateCoordinatesClientSide:', error);
    return {
      isValid: false,
      intersections: [],
      errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Validate coordinates against existing permits (server-side validation)
 */
export async function validateCoordinatesServerSide(
  request: ValidationRequest
): Promise<ValidationResponse> {
  try {
    // Convert coordinates to GeoJSON polygon
    const polygon = coordinatesToGeoJSON(request.coordinates);
    if (!polygon) {
      return {
        isValid: false,
        intersections: [],
        errors: ['Failed to create valid polygon from coordinates']
      };
    }

    // Call the database validation function
    const { data, error } = await supabase
      .rpc('validate_polygon_intersection', {
        new_polygon: `SRID=4326;${polygon.geometry.type.toUpperCase()}((${
          polygon.geometry.coordinates[0]
            .map(coord => `${coord[0]} ${coord[1]}`)
            .join(',')
        }))`,
        application_id: request.applicationId || null
      });

    if (error) {
      console.error('Error in server-side validation:', error);
      throw new Error(`Server validation failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        isValid: true,
        intersections: [],
        errors: [],
        polygon
      };
    }

    const result = data[0];
    const hasIntersection = result.has_intersection;
    const intersectionDetails = result.intersection_details || [];

    // Transform server response to client format
    const intersections: IntersectionDetail[] = intersectionDetails.map((detail: any) => ({
      permitId: detail.permit_id,
      permitNumber: detail.permit_number,
      projectTitle: detail.project_title,
      intersectionType: detail.intersection_type,
      intersectionArea: detail.intersection_area_m2,
      overlapPercentage: detail.overlap_percentage
    }));

    const errors = hasIntersection
      ? intersections.map(intersection => 
          `Polygon intersects with existing permit ${intersection.permitNumber} (${intersection.projectTitle}) - ${intersection.overlapPercentage}% overlap`
        )
      : [];

    return {
      isValid: !hasIntersection,
      intersections,
      errors,
      polygon,
      summary: {
        totalIntersections: intersections.length,
        significantIntersections: intersections.filter(i => i.overlapPercentage > 0.1).length,
        totalOverlapArea: intersections.reduce((sum, i) => sum + i.intersectionArea, 0),
        maxOverlapPercentage: intersections.length > 0 
          ? Math.max(...intersections.map(i => i.overlapPercentage))
          : 0
      }
    };
  } catch (error) {
    console.error('Error in validateCoordinatesServerSide:', error);
    return {
      isValid: false,
      intersections: [],
      errors: [`Server validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Comprehensive validation using both client and server-side validation
 */
export async function validateCoordinates(
  request: ValidationRequest,
  useServerValidation: boolean = true
): Promise<ValidationResponse> {
  try {
    // Always do client-side validation first for immediate feedback
    const clientValidation = await validateCoordinatesClientSide(request);
    
    // If server validation is requested and client validation passes basic checks
    if (useServerValidation && clientValidation.polygon) {
      try {
        const serverValidation = await validateCoordinatesServerSide(request);
        
        // Combine results - server validation takes precedence for intersection detection
        return {
          isValid: serverValidation.isValid && clientValidation.isValid,
          intersections: serverValidation.intersections.length > 0 
            ? serverValidation.intersections 
            : clientValidation.intersections,
          errors: [...clientValidation.errors, ...serverValidation.errors],
          polygon: clientValidation.polygon,
          summary: serverValidation.summary || clientValidation.summary
        };
      } catch (serverError) {
        console.warn('Server validation failed, falling back to client validation:', serverError);
        // Fall back to client validation if server fails
        return clientValidation;
      }
    }
    
    return clientValidation;
  } catch (error) {
    console.error('Error in comprehensive validation:', error);
    return {
      isValid: false,
      intersections: [],
      errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

// =============================================
// APPLICATION UPDATE FUNCTIONS
// =============================================

/**
 * Update application with validation results
 */
export async function updateApplicationValidation(
  applicationId: string,
  validationResult: ValidationResponse
): Promise<boolean> {
  try {
    const intersectingPermitIds = validationResult.intersections.map(i => i.permitId);
    
    const { error } = await supabase
      .from('applications')
      .update({
        intersection_validation_status: validationResult.isValid ? 'valid' : 'invalid',
        intersecting_permits: intersectingPermitIds,
        intersection_details: validationResult.intersections,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (error) {
      console.error('Error updating application validation:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateApplicationValidation:', error);
    return false;
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Get validation status for an application
 */
export async function getApplicationValidationStatus(
  applicationId: string
): Promise<{
  status: string;
  intersectingPermits: string[];
  intersectionDetails: IntersectionDetail[];
} | null> {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select('intersection_validation_status, intersecting_permits, intersection_details')
      .eq('id', applicationId)
      .single();

    if (error) {
      console.error('Error fetching application validation status:', error);
      return null;
    }

    return {
      status: data.intersection_validation_status || 'pending',
      intersectingPermits: data.intersecting_permits || [],
      intersectionDetails: data.intersection_details || []
    };
  } catch (error) {
    console.error('Error in getApplicationValidationStatus:', error);
    return null;
  }
}

/**
 * Revalidate all pending applications (useful after permit changes)
 */
export async function revalidateAllApplications(): Promise<{
  processed: number;
  validated: number;
  invalid: number;
  errors: number;
}> {
  try {
    // Get all applications with pending validation or coordinates
    const { data: applications, error } = await supabase
      .from('applications')
      .select('id, coordinates')
      .in('status', ['draft', 'submitted', 'under_review'])
      .not('coordinates', 'is', null);

    if (error) {
      throw error;
    }

    if (!applications || applications.length === 0) {
      return { processed: 0, validated: 0, invalid: 0, errors: 0 };
    }

    let validated = 0;
    let invalid = 0;
    let errors = 0;

    // Process each application
    for (const app of applications) {
      try {
        if (!app.coordinates) continue;

        // Extract coordinates from PostGIS geometry
        const coordinates = extractCoordinatesFromGeometry(app.coordinates);
        if (!coordinates || coordinates.length !== 5) continue;

        const validationResult = await validateCoordinates({
          coordinates,
          applicationId: app.id
        });

        await updateApplicationValidation(app.id, validationResult);

        if (validationResult.isValid) {
          validated++;
        } else {
          invalid++;
        }
      } catch (appError) {
        console.error(`Error validating application ${app.id}:`, appError);
        errors++;
      }
    }

    return {
      processed: applications.length,
      validated,
      invalid,
      errors
    };
  } catch (error) {
    console.error('Error in revalidateAllApplications:', error);
    throw error;
  }
}

/**
 * Extract coordinates from PostGIS geometry object
 */
function extractCoordinatesFromGeometry(geometry: any): CoordinatePoint[] | null {
  try {
    if (!geometry || !geometry.coordinates) return null;

    if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
      const coords = geometry.coordinates[0];
      return coords.slice(0, 5).map((coord: number[]) => ({
        longitude: coord[0].toString(),
        latitude: coord[1].toString()
      }));
    }

    return null;
  } catch (error) {
    console.error('Error extracting coordinates from geometry:', error);
    return null;
  }
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResponse): string {
  if (result.isValid) {
    return '✅ No intersections found - polygon is valid';
  }

  const { summary } = result;
  if (!summary) {
    return `❌ ${result.errors.length} validation error(s)`;
  }

  let message = `❌ Found ${summary.totalIntersections} intersection(s)`;
  
  if (summary.significantIntersections > 0) {
    message += ` (${summary.significantIntersections} significant)`;
  }
  
  if (summary.maxOverlapPercentage > 0) {
    message += ` - Max overlap: ${summary.maxOverlapPercentage}%`;
  }

  return message;
}

/**
 * Get intersection severity level
 */
export function getIntersectionSeverity(intersection: IntersectionDetail): 'low' | 'medium' | 'high' {
  if (intersection.intersectionType === 'boundaries_touch') return 'low';
  if (intersection.overlapPercentage < 5) return 'low';
  if (intersection.overlapPercentage < 25) return 'medium';
  return 'high';
}
