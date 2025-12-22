// =============================================
// API Route: Validate Coordinates
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { coordinatesToGeoJSON, validatePolygon, isWithinRwanda, type CoordinatePoint } from '@/lib/geoUtils';
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
    
    const validationResult = ValidationRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('❌ Request validation failed:', validationResult.error.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    const { coordinates, applicationId } = validationResult.data;

    const outsidePoints: Array<{ idx: number; lat: number; lng: number }> = [];

    for (let i = 0; i < coordinates.length; i++) {
      const lat = typeof coordinates[i].latitude === 'string'
        ? parseFloat(coordinates[i].latitude as string)
        : coordinates[i].latitude as number;
      const lng = typeof coordinates[i].longitude === 'string'
        ? parseFloat(coordinates[i].longitude as string)
        : coordinates[i].longitude as number;

      if (!isWithinRwanda({ latitude: lat, longitude: lng })) {
        outsidePoints.push({ idx: i + 1, lat, lng });
      }
    }

    if (outsidePoints.length > 0) {
      outsidePoints.forEach((p) => {
        console.warn(`⚠️ Coordinate ${p.idx} outside Rwanda boundary: ${p.lat}, ${p.lng}`);
      });

      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: outsidePoints.map(
          (p) => `Coordinate ${p.idx} (${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}) is outside Rwanda boundaries`
        ),
        summary: null,
        polygon: null,
        validatedAt: new Date().toISOString()
      });
    }

    console.log('✅ Request validation passed, proceeding with polygon validation');

    const polygon = coordinatesToGeoJSON(coordinates as CoordinatePoint[]);
    if (!polygon) {
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

    // Basic polygon validity (geometry + within Rwanda) – no area constraints.
    const basic = validatePolygon(polygon);
    if (!basic.isValid) {
      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: basic.errors,
        summary: null,
        polygon: {
          type: polygon.type,
          geometry: polygon.geometry,
          properties: polygon.properties
        },
        validatedAt: new Date().toISOString()
      });
    }

    // Duplicate polygon check across existing applications (excluding self if applicationId provided).
    const candidateKey = polygonToKey(polygon);
    const admin = createAdminClient();

    let query = admin
      .from('applications')
      .select('id, project_title, coordinates')
      .not('coordinates', 'is', null);

    if (applicationId) {
      query = query.neq('id', applicationId);
    }

    const { data: apps, error: appsError } = await query;
    if (appsError) {
      throw new Error(`Failed to check existing applications: ${appsError.message}`);
    }

    const match = (apps || []).find((app: any) => {
      const geom = app?.coordinates;
      if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) return false;
      const feature = {
        type: 'Feature',
        properties: {},
        geometry: geom
      } as const;
      return polygonToKey(feature) === candidateKey;
    });

    if (match) {
      return NextResponse.json({
        success: true,
        isValid: false,
        intersections: [],
        errors: ['Duplicate polygon detected: this polygon already exists in another application.'],
        summary: null,
        polygon: {
          type: polygon.type,
          geometry: polygon.geometry,
          properties: polygon.properties
        },
        validatedAt: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      isValid: true,
      intersections: [],
      errors: [],
      summary: {
        ruleSet: 'rwanda_bounds_and_no_duplicate_polygon'
      },
      polygon: {
        type: polygon.type,
        geometry: polygon.geometry,
        properties: polygon.properties
      },
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
        description: 'Array of exactly 5 coordinate points',
        example: [
          { latitude: "-1.9441", longitude: "30.0619" },
          { latitude: "-1.9451", longitude: "30.0629" },
          { latitude: "-1.9461", longitude: "30.0639" },
          { latitude: "-1.9471", longitude: "30.0649" },
          { latitude: "-1.9481", longitude: "30.0659" }
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
