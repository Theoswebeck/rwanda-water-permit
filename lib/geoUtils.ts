// =============================================
// Geospatial Utilities for Water Permit System
// Rwanda Water Board - Polygon Intersection Validation
// =============================================

import * as turf from '@turf/turf';
import type { 
  Feature, 
  Polygon, 
  Point, 
  GeoJsonProperties, 
  Position 
} from 'geojson';

// =============================================
// TYPES AND INTERFACES
// =============================================

export interface CoordinatePoint {
  latitude: string | number;
  longitude: string | number;
}

export interface ValidationResult {
  isValid: boolean;
  intersections: IntersectionDetail[];
  errors: string[];
  polygon?: Feature<Polygon>;
}

export interface IntersectionDetail {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  intersectionType: IntersectionType;
  intersectionArea: number; // in square meters
  overlapPercentage: number;
  intersectionGeometry?: Feature<Polygon>;
}

export type IntersectionType = 
  | 'new_contains_existing'
  | 'existing_contains_new' 
  | 'partial_overlap'
  | 'boundaries_touch'
  | 'boundaries_cross'
  | 'general_intersection';

export interface PermitPolygon {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: Feature<Polygon>;
  status: string;
  issuedDate: string;
  expiryDate: string;
}

// =============================================
// COORDINATE VALIDATION AND CONVERSION
// =============================================

/**
 * Validates that a coordinate point has valid latitude and longitude
 */
export function isValidCoordinate(coord: CoordinatePoint): boolean {
  const lat = typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude;
  const lng = typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude;
  
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
}

/**
 * Validates that coordinates are within Rwanda's approximate boundaries
 */
export function isWithinRwanda(coord: CoordinatePoint): boolean {
  const lat = typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude;
  const lng = typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude;
  
  // Rwanda approximate bounds: 
  // Latitude: -2.91 to -1.05
  // Longitude: 28.86 to 30.90
  return lat >= -2.91 && lat <= -1.05 && lng >= 28.86 && lng <= 30.90;
}

/**
 * Converts array of 5 coordinate points to a closed GeoJSON polygon
 */
export function coordinatesToGeoJSON(coordinates: CoordinatePoint[]): Feature<Polygon> | null {
  try {
    // Validate we have exactly 5 coordinates
    if (!coordinates || coordinates.length !== 5) {
      throw new Error('Exactly 5 coordinate points are required for a polygon');
    }

    // Validate each coordinate
    const validCoordinates = coordinates.filter(coord => 
      coord.latitude && coord.longitude && isValidCoordinate(coord)
    );

    if (validCoordinates.length !== 5) {
      console.warn('coordinatesToGeoJSON: Not all 5 coordinates are valid');
      return null;
    }

    // Convert to GeoJSON coordinate format [longitude, latitude]
    const geoCoords: Position[] = validCoordinates.map(coord => [
      typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude,
      typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude
    ]);

    // Close the polygon by adding the first point at the end if not already closed
    const firstPoint = geoCoords[0];
    const lastPoint = geoCoords[geoCoords.length - 1];
    if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
      geoCoords.push([firstPoint[0], firstPoint[1]]);
    }

    // Create the polygon feature
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [geoCoords]
      }
    };

    // Validate the polygon using Turf.js
    if (!turf.booleanValid(polygon)) {
      throw new Error('Generated polygon is not geometrically valid');
    }

    return polygon;
  } catch (error) {
    console.error('Error converting coordinates to GeoJSON:', error);
    return null;
  }
}

/**
 * Converts GeoJSON polygon back to coordinate points array
 */
export function geoJSONToCoordinates(polygon: Feature<Polygon>): CoordinatePoint[] {
  try {
    if (!polygon.geometry.coordinates || !polygon.geometry.coordinates[0]) {
      return [];
    }

    const coords = polygon.geometry.coordinates[0];
    // Take first 5 points (excluding the closing point)
    return coords.slice(0, 5).map(coord => ({
      longitude: coord[0].toString(),
      latitude: coord[1].toString()
    }));
  } catch (error) {
    console.error('Error converting GeoJSON to coordinates:', error);
    return [];
  }
}

/**
 * Converts GeoJSON coordinates to Leaflet-compatible format [lat, lng]
 */
export function geoJSONToLeafletCoords(polygon: Feature<Polygon>): [number, number][] {
  try {
    if (!polygon.geometry.coordinates || !polygon.geometry.coordinates[0]) {
      return [];
    }

    return polygon.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
  } catch (error) {
    console.error('Error converting to Leaflet coordinates:', error);
    return [];
  }
}

// =============================================
// POLYGON VALIDATION AND ANALYSIS
// =============================================

/**
 * Validates if a polygon meets basic geometric requirements
 */
export function validatePolygon(polygon: Feature<Polygon>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Check if polygon exists
    if (!polygon || !polygon.geometry) {
      errors.push('Polygon geometry is missing');
      return { isValid: false, errors };
    }

    // Check if polygon is geometrically valid
    if (!turf.booleanValid(polygon)) {
      errors.push('Polygon geometry is not valid');
    }

    // Check for minimum area (e.g., 100 square meters)
    const area = turf.area(polygon);
    if (area < 100) {
      errors.push('Polygon area is too small (minimum 100 m²)');
    }

    // Check for maximum area (e.g., 10 square kilometers)
    if (area > 10000000) {
      errors.push('Polygon area is too large (maximum 10 km²)');
    }

    // Check if polygon is self-intersecting
    const kinks = turf.kinks(polygon);
    if (kinks.features.length > 0) {
      errors.push('Polygon has self-intersections');
    }

    // Check if all coordinates are within Rwanda
    const coords = polygon.geometry.coordinates[0];
    for (let i = 0; i < coords.length - 1; i++) {
      const coord = { longitude: coords[i][0], latitude: coords[i][1] };
      if (!isWithinRwanda(coord)) {
        errors.push(`Coordinate ${i + 1} is outside Rwanda boundaries`);
        break;
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, errors };
  }
}

/**
 * Calculate polygon area in square meters
 */
export function getPolygonArea(polygon: Feature<Polygon>): number {
  try {
    return turf.area(polygon);
  } catch (error) {
    console.error('Error calculating polygon area:', error);
    return 0;
  }
}

/**
 * Get polygon centroid
 */
export function getPolygonCentroid(polygon: Feature<Polygon>): Feature<Point> | null {
  try {
    return turf.centroid(polygon);
  } catch (error) {
    console.error('Error calculating polygon centroid:', error);
    return null;
  }
}

/**
 * Get polygon bounding box
 */
export function getPolygonBounds(polygon: Feature<Polygon>): number[] | null {
  try {
    return turf.bbox(polygon);
  } catch (error) {
    console.error('Error calculating polygon bounds:', error);
    return null;
  }
}

// =============================================
// INTERSECTION DETECTION AND ANALYSIS
// =============================================

/**
 * Check if two polygons intersect and return detailed information
 */
export function analyzePolygonIntersection(
  polygon1: Feature<Polygon>, 
  polygon2: Feature<Polygon>
): IntersectionDetail | null {
  try {
    // Check for any intersection
    if (!turf.booleanIntersects(polygon1, polygon2)) {
      return null;
    }

    // Determine intersection type
    let intersectionType: IntersectionType = 'general_intersection';
    
    if (turf.booleanContains(polygon1, polygon2)) {
      intersectionType = 'new_contains_existing';
    } else if (turf.booleanContains(polygon2, polygon1)) {
      intersectionType = 'existing_contains_new';
    } else if (turf.booleanOverlap(polygon1, polygon2)) {
      intersectionType = 'partial_overlap';
    } else if (turf.booleanCrosses(polygon1, polygon2)) {
      intersectionType = 'boundaries_cross';
    } else if (turf.booleanTouches(polygon1, polygon2)) {
      intersectionType = 'boundaries_touch';
    }

    // Calculate intersection geometry and area
    const intersection = turf.intersect(polygon1, polygon2);
    const intersectionArea = intersection ? turf.area(intersection) : 0;
    
    // Calculate overlap percentage (relative to smaller polygon)
    const area1 = turf.area(polygon1);
    const area2 = turf.area(polygon2);
    const smallerArea = Math.min(area1, area2);
    const overlapPercentage = smallerArea > 0 ? (intersectionArea / smallerArea) * 100 : 0;

    return {
      permitId: '', // Will be filled by caller
      permitNumber: '', // Will be filled by caller
      projectTitle: '', // Will be filled by caller
      intersectionType,
      intersectionArea: Math.round(intersectionArea * 100) / 100,
      overlapPercentage: Math.round(overlapPercentage * 100) / 100,
      intersectionGeometry: intersection || undefined
    };
  } catch (error) {
    console.error('Error analyzing polygon intersection:', error);
    return null;
  }
}

/**
 * Validate a new polygon against an array of existing permit polygons
 */
export function validatePolygonIntersection(
  newPolygon: Feature<Polygon>,
  existingPermits: PermitPolygon[]
): ValidationResult {
  const errors: string[] = [];
  const intersections: IntersectionDetail[] = [];

  try {
    // First validate the new polygon itself
    const polygonValidation = validatePolygon(newPolygon);
    if (!polygonValidation.isValid) {
      errors.push(...polygonValidation.errors);
    }

    // Check intersections with existing permits
    for (const permit of existingPermits) {
      const intersectionDetail = analyzePolygonIntersection(newPolygon, permit.coordinates);
      
      if (intersectionDetail) {
        // Fill in permit details
        intersectionDetail.permitId = permit.permitId;
        intersectionDetail.permitNumber = permit.permitNumber;
        intersectionDetail.projectTitle = permit.projectTitle;
        
        intersections.push(intersectionDetail);
        
        // Add error message for significant intersections
        if (intersectionDetail.intersectionType !== 'boundaries_touch' && 
            intersectionDetail.overlapPercentage > 0.1) {
          errors.push(
            `Polygon intersects with existing permit ${permit.permitNumber} (${permit.projectTitle}) - ` +
            `${intersectionDetail.overlapPercentage.toFixed(1)}% overlap`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      intersections,
      errors,
      polygon: newPolygon
    };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      intersections,
      errors,
      polygon: newPolygon
    };
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Generate a simplified polygon for display purposes
 */
export function simplifyPolygon(polygon: Feature<Polygon>, tolerance: number = 0.0001): Feature<Polygon> {
  try {
    return turf.simplify(polygon, { tolerance, highQuality: true });
  } catch (error) {
    console.error('Error simplifying polygon:', error);
    return polygon;
  }
}

/**
 * Buffer a polygon by a specified distance (in meters)
 */
export function bufferPolygon(polygon: Feature<Polygon>, distance: number): Feature<Polygon> | null {
  try {
    const buffered = turf.buffer(polygon, distance, { units: 'meters' });
    return buffered as Feature<Polygon>;
  } catch (error) {
    console.error('Error buffering polygon:', error);
    return null;
  }
}

/**
 * Check if a point is within a polygon
 */
export function isPointInPolygon(point: [number, number], polygon: Feature<Polygon>): boolean {
  try {
    const pointFeature = turf.point(point);
    return turf.booleanPointInPolygon(pointFeature, polygon);
  } catch (error) {
    console.error('Error checking point in polygon:', error);
    return false;
  }
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(point1: [number, number], point2: [number, number]): number {
  try {
    const from = turf.point(point1);
    const to = turf.point(point2);
    return turf.distance(from, to, { units: 'meters' });
  } catch (error) {
    console.error('Error calculating distance:', error);
    return 0;
  }
}

/**
 * Format area for display
 */
export function formatArea(areaInSquareMeters: number): string {
  if (areaInSquareMeters < 1000) {
    return `${Math.round(areaInSquareMeters)} m²`;
  } else if (areaInSquareMeters < 1000000) {
    return `${(areaInSquareMeters / 1000).toFixed(1)} km²`;
  } else {
    return `${(areaInSquareMeters / 1000000).toFixed(2)} km²`;
  }
}

/**
 * Format coordinates for display
 */
export function formatCoordinate(coord: number, type: 'lat' | 'lng'): string {
  const direction = type === 'lat' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
  return `${Math.abs(coord).toFixed(6)}°${direction}`;
}

/**
 * Generate polygon summary for display
 */
export function getPolygonSummary(polygon: Feature<Polygon>): {
  area: string;
  centroid: string;
  bounds: string;
  coordinates: string;
} {
  try {
    const area = formatArea(getPolygonArea(polygon));
    const centroid = getPolygonCentroid(polygon);
    const bounds = getPolygonBounds(polygon);
    
    const centroidStr = centroid 
      ? `${formatCoordinate(centroid.geometry.coordinates[1], 'lat')}, ${formatCoordinate(centroid.geometry.coordinates[0], 'lng')}`
      : 'Unknown';
    
    const boundsStr = bounds 
      ? `${formatCoordinate(bounds[1], 'lat')} to ${formatCoordinate(bounds[3], 'lat')}, ${formatCoordinate(bounds[0], 'lng')} to ${formatCoordinate(bounds[2], 'lng')}`
      : 'Unknown';
    
    const coordCount = polygon.geometry.coordinates[0].length - 1; // Exclude closing point
    
    return {
      area,
      centroid: centroidStr,
      bounds: boundsStr,
      coordinates: `${coordCount} points`
    };
  } catch (error) {
    console.error('Error generating polygon summary:', error);
    return {
      area: 'Unknown',
      centroid: 'Unknown',
      bounds: 'Unknown',
      coordinates: 'Unknown'
    };
  }
}
