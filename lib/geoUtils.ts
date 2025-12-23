// =============================================
// Geospatial Utilities for Water Permit System
// Rwanda Water Board - Polygon Intersection Validation
// =============================================

import * as turf from '@turf/turf';
import type { 
  Feature, 
  Polygon, 
  MultiPolygon,
  Point, 
  GeoJsonProperties, 
  Position 
} from 'geojson';
import { RWANDA_BOUNDARY } from '@/lib/rwandaBoundary';

// =============================================
// TYPES AND INTERFACES
// =============================================

export interface CoordinatePoint {
  latitude: string | number;
  longitude: string | number;
}

function toNumber(v: string | number): number {
  return typeof v === 'string' ? parseFloat(v) : v;
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n) && !Number.isNaN(n);
}

function normalizePoint(coord: CoordinatePoint): { lat: number; lng: number } | null {
  const lat = toNumber(coord.latitude);
  const lng = toNumber(coord.longitude);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng };
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, [first[0], first[1]]];
  return ring;
}

function removeClosingPoint(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
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
  intersectionGeometry?: Feature<Polygon | MultiPolygon>;
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
 * Validates that a coordinate point is within Rwanda's national boundary
 */
export function isWithinRwanda(coord: CoordinatePoint): boolean {
  const lat = typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude;
  const lng = typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude;
  
  if (isNaN(lat) || isNaN(lng)) return false;
  try {
    const p = turf.point([lng, lat]);
    return turf.booleanPointInPolygon(p, RWANDA_BOUNDARY);
  } catch {
    return false;
  }
}

/**
 * Validates that the entire polygon is within Rwanda's national boundary.
 * This is stronger than checking just the vertices (prevents edges crossing outside the border).
 */
export function isPolygonWithinRwanda(polygon: Feature<Polygon>): boolean {
  try {
    return turf.booleanWithin(polygon, RWANDA_BOUNDARY) || turf.booleanContains(RWANDA_BOUNDARY, polygon);
  } catch {
    return false;
  }
}

/**
 * Converts an array of coordinate points (>= 3) to a closed GeoJSON polygon.
 *
 * Legacy parts of the system used to require exactly 5 points; that restriction is now lifted
 * to allow more accurate shapes and multiple polygons per application.
 */
export function coordinatesToGeoJSON(coordinates: CoordinatePoint[]): Feature<Polygon> | null {
  try {
    if (!coordinates || coordinates.length < 3) {
      throw new Error('At least 3 coordinate points are required for a polygon');
    }

    // Normalize + validate each coordinate
    const normalized = coordinates
      .map((c) => normalizePoint(c))
      .filter((c): c is { lat: number; lng: number } => Boolean(c))
      .map((c) => ({ latitude: c.lat, longitude: c.lng }));

    const validCoordinates = normalized.filter((coord) => isValidCoordinate(coord));
    if (validCoordinates.length < 3) {
      console.warn('coordinatesToGeoJSON: Fewer than 3 valid coordinates provided');
      return null;
    }

    // Convert to GeoJSON coordinate format [longitude, latitude]
    const openRing: Position[] = validCoordinates.map((coord) => [coord.longitude as number, coord.latitude as number]);
    const geoCoords = closeRing(openRing);

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
    const openRing = removeClosingPoint(coords);
    return openRing.map((coord) => ({
      longitude: coord[0].toString(),
      latitude: coord[1].toString()
    }));
  } catch (error) {
    console.error('Error converting GeoJSON to coordinates:', error);
    return [];
  }
}

/**
 * Convert an array of polygons (each polygon = array of points) into a GeoJSON geometry.
 * Returns Polygon when a single polygon is provided, otherwise returns MultiPolygon.
 */
export function polygonsToGeoJSON(
  polygons: CoordinatePoint[][]
): Feature<Polygon | MultiPolygon> | null {
  try {
    const normalizedPolys = (polygons || []).filter((p) => Array.isArray(p) && p.length >= 3);
    if (normalizedPolys.length === 0) return null;

    if (normalizedPolys.length === 1) {
      return coordinatesToGeoJSON(normalizedPolys[0]) as Feature<Polygon> | null;
    }

    const multiCoords: Position[][][] = [];

    for (const poly of normalizedPolys) {
      const feature = coordinatesToGeoJSON(poly);
      if (!feature) return null;
      multiCoords.push(feature.geometry.coordinates);
    }

    const multi = turf.multiPolygon(multiCoords) as Feature<MultiPolygon>;
    if (!turf.booleanValid(multi)) return null;
    return multi;
  } catch (error) {
    console.error('Error converting polygons to GeoJSON:', error);
    return null;
  }
}

/**
 * Extract polygon point arrays from a GeoJSON geometry stored in PostGIS (Polygon/MultiPolygon/Point).
 * - Polygon -> [points]
 * - MultiPolygon -> [points, points, ...]
 * - Point -> [[point]]
 */
export function geometryToCoordinatePolygons(geometry: any): CoordinatePoint[][] {
  try {
    if (!geometry || typeof geometry !== 'object') return [];

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates) && geometry.coordinates[0]) {
      const ring = removeClosingPoint(geometry.coordinates[0] as Position[]);
      return [
        ring.map((coord) => ({
          longitude: coord[0].toString(),
          latitude: coord[1].toString()
        }))
      ];
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      const out: CoordinatePoint[][] = [];
      for (const poly of geometry.coordinates as Position[][][]) {
        const ring = poly?.[0];
        if (!ring) continue;
        const open = removeClosingPoint(ring);
        out.push(
          open.map((coord) => ({
            longitude: coord[0].toString(),
            latitude: coord[1].toString()
          }))
        );
      }
      return out;
    }

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
      const [lng, lat] = geometry.coordinates as [number, number];
      return [[{ longitude: lng.toString(), latitude: lat.toString() }]];
    }

    return [];
  } catch (error) {
    console.error('Error extracting polygons from geometry:', error);
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

    // Check if polygon is self-intersecting
    const kinks = turf.kinks(polygon);
    if (kinks.features.length > 0) {
      errors.push('Polygon has self-intersections');
    }

    // Check polygon is fully within Rwanda boundary (robust)
    if (!isPolygonWithinRwanda(polygon)) {
      errors.push('Polygon is outside Rwanda boundaries');
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
    const intersection = turf.intersect(turf.featureCollection([polygon1, polygon2]));
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
