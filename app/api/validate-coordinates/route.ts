// =============================================
// API Route: Validate Coordinates
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  coordinatesToGeoJSON,
  polygonsToGeoJSON,
  validatePolygon,
  isWithinRwanda,
  type CoordinatePoint
} from '@/lib/geoUtils';
import { polygonToKey } from '@/lib/polygonKey';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

// =============================================
// VALIDATION SCHEMAS
// =============================================

const CoordinateSchema = z.object({
  latitude: z.union([z.string(), z.number()]).refine(
    (val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num >= -90 && num <= 90;
    },
    { message: 'Latitude must be a valid number between -90 and 90' }
  ),
  longitude: z.union([z.string(), z.number()]).refine(
    (val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num >= -180 && num <= 180;
    },
    { message: 'Longitude must be a valid number between -180 and 180' }
  )
});

const ValidationRequestSchema = z.object({
  coordinates: z.array(CoordinateSchema).length(5, {
    message: 'Exactly 5 coordinate points are required'
  }),
  applicationId: z.string().uuid().optional(),
  // kept for backwards compatibility, but ignored in the new implementation
  useServerValidation: z.boolean().optional().default(true)
});

const MultiPolygonValidationRequestSchema = z.object({
  polygons: z.array(z.array(CoordinateSchema).min(3, { message: 'Each polygon must have at least 3 points' })).min(1, {
    message: 'At least one polygon is required'
  }),
  applicationId: z.string().uuid().optional(),
  useServerValidation: z.boolean().optional().default(true)
});

// =============================================
// API HANDLERS
// =============================================

/**
 * POST /api/validate-coordinates
 * Validates polygon coordinates against existing permits
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Coordinate validation request received');
    
    // Parse and validate request body
    const body = await request.json();
    console.log('📋 Request body:', JSON.stringify(body, null, 2));

    const parsedMulti = MultiPolygonValidationRequestSchema.safeParse(body);
    const parsedLegacy = ValidationRequestSchema.safeParse(body);

    if (!parsedMulti.success && !parsedLegacy.success) {
      const err = parsedMulti.success ? null : parsedMulti.error;
      const err2 = parsedLegacy.success ? null : parsedLegacy.error;
      const chosen = err || err2!;
      console.error('❌ Request validation failed:', chosen.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: chosen.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    const applicationId = (parsedMulti.success ? parsedMulti.data.applicationId : parsedLegacy.data.applicationId) || undefined;

    const polygons: CoordinatePoint[][] = parsedMulti.success
      ? (parsedMulti.data.polygons as CoordinatePoint[][])
      : [(parsedLegacy.data.coordinates as CoordinatePoint[])];

    // Vertex-level Rwanda bounds check (fast feedback). Full boundary check also happens in validatePolygon.
    const outsidePoints: Array<{ polyIdx: number; ptIdx: number; lat: number; lng: number }> = [];
    polygons.forEach((poly, polyIdx) => {
      poly.forEach((pt, ptIdx) => {
        const lat = typeof pt.latitude === 'string' ? parseFloat(pt.latitude) : (pt.latitude as number);
        const lng = typeof pt.longitude === 'string' ? parseFloat(pt.longitude) : (pt.longitude as number);
        if (!isWithinRwanda({ latitude: lat, longitude: lng })) outsidePoints.push({ polyIdx, ptIdx, lat, lng });
      });
    });

    if (outsidePoints.length > 0) {
      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: outsidePoints.map(
          (p) =>
            `Polygon ${p.polyIdx + 1} point ${p.ptIdx + 1} (${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}) is outside Rwanda boundaries`
        ),
        summary: null,
        polygon: null,
        validatedAt: new Date().toISOString()
      });
    }

    // Build per-polygon features and run basic validation.
    const polyFeatures = polygons
      .map((p) => coordinatesToGeoJSON(p))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));

    if (polyFeatures.length !== polygons.length) {
      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: ['Failed to create valid polygon from coordinates'],
        summary: null,
        polygon: null,
        validatedAt: new Date().toISOString()
      });
    }

    for (let i = 0; i < polyFeatures.length; i += 1) {
      const basic = validatePolygon(polyFeatures[i]);
      if (!basic.isValid) {
        return NextResponse.json({
          success: true,
          isValid: false,
          intersections: [],
          errors: basic.errors.map((e) => `Polygon ${i + 1}: ${e}`),
          summary: null,
          polygon: {
            type: polyFeatures[i].type,
            geometry: polyFeatures[i].geometry,
            properties: polyFeatures[i].properties
          },
          validatedAt: new Date().toISOString()
        });
      }
    }

    // Duplicate polygon check across existing applications (excluding self if applicationId provided).
    const candidateKeys = polyFeatures.map((f) => polygonToKey(f));
    const admin = createAdminClient();

    let query = admin
      .from('applications')
      .select('id, project_title, coordinates')
      .not('coordinates', 'is', null);

    if (applicationId) query = query.neq('id', applicationId);

    const { data: apps, error: appsError } = await query;
    if (appsError) throw new Error(`Failed to check existing applications: ${appsError.message}`);

    const isDuplicate = (apps || []).some((app: any) => {
      const geom = app?.coordinates;
      if (!geom) return false;

      const existingPolys: any[] = [];
      if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
        existingPolys.push(geom);
      } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        for (const poly of geom.coordinates) {
          if (poly?.[0]) existingPolys.push({ type: 'Polygon', coordinates: poly });
        }
      } else {
        return false;
      }

      return existingPolys.some((g) => {
        const feature = { type: 'Feature', properties: {}, geometry: g } as const;
        return candidateKeys.includes(polygonToKey(feature as any));
      });
    });

    if (isDuplicate) {
      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: ['Duplicate polygon detected: at least one polygon already exists in another application.'],
        summary: null,
        polygon: {
          type: polyFeatures[0].type,
          geometry: polyFeatures[0].geometry,
          properties: polyFeatures[0].properties
        },
        validatedAt: new Date().toISOString()
      });
    }

    const geometryFeature = polygonsToGeoJSON(polygons);

    return NextResponse.json({
      success: true,
      isValid: true,
      intersections: [],
      errors: [],
      summary: { ruleSet: 'rwanda_bounds_and_no_duplicate_polygon' },
      polygon: geometryFeature
        ? { type: geometryFeature.type, geometry: geometryFeature.geometry, properties: geometryFeature.properties }
        : null,
      validatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in coordinate validation API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during validation',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        isValid: false,
        intersections: [],
        errors: ['Server error occurred during validation']
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/validate-coordinates
 * Returns validation endpoint information
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/validate-coordinates',
    method: 'POST',
    description: 'Validates polygon coordinates against existing water permits',
    parameters: {
      coordinates: {
        type: 'array',
        description: 'Legacy: Array of exactly 5 coordinate points',
        example: [
          { latitude: "-1.9441", longitude: "30.0619" },
          { latitude: "-1.9451", longitude: "30.0629" },
          { latitude: "-1.9461", longitude: "30.0639" },
          { latitude: "-1.9471", longitude: "30.0649" },
          { latitude: "-1.9481", longitude: "30.0659" }
        ]
      },
      polygons: {
        type: 'array',
        description: 'New: array of polygons, each polygon is an array of coordinate points (>=3)',
        example: [
          [
            { latitude: "-1.9441", longitude: "30.0619" },
            { latitude: "-1.9451", longitude: "30.0629" },
            { latitude: "-1.9461", longitude: "30.0639" }
          ],
          [
            { latitude: "-1.9501", longitude: "30.0709" },
            { latitude: "-1.9511", longitude: "30.0719" },
            { latitude: "-1.9521", longitude: "30.0729" }
          ]
        ]
      },
      applicationId: {
        type: 'string',
        description: 'UUID of application being updated (optional)',
        example: '550e8400-e29b-41d4-a716-446655440000'
      },
      useServerValidation: {
        type: 'boolean',
        description: 'Whether to use server-side validation (default: true)',
        example: true
      }
    },
    response: {
      success: 'boolean',
      isValid: 'boolean',
      intersections: 'array of intersection details',
      errors: 'array of error messages',
      summary: 'validation summary object',
      polygon: 'GeoJSON polygon feature'
    }
  });
}
