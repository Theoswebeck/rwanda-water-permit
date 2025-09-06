// =============================================
// API Route: Validate Coordinates
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { validateCoordinates, type ValidationRequest } from '@/lib/polygonValidation';
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

    const { coordinates, applicationId, useServerValidation } = validationResult.data;

    // Validate coordinates are within Rwanda bounds
    const rwandaBounds = {
      minLat: -2.91,
      maxLat: -1.05,
      minLng: 28.86,
      maxLng: 30.90
    };

    for (let i = 0; i < coordinates.length; i++) {
      const lat = typeof coordinates[i].latitude === 'string' 
        ? parseFloat(coordinates[i].latitude as string) 
        : coordinates[i].latitude as number;
      const lng = typeof coordinates[i].longitude === 'string' 
        ? parseFloat(coordinates[i].longitude as string) 
        : coordinates[i].longitude as number;

      if (lat < rwandaBounds.minLat || lat > rwandaBounds.maxLat ||
          lng < rwandaBounds.minLng || lng > rwandaBounds.maxLng) {
        console.warn(`⚠️ Coordinate ${i + 1} outside Rwanda bounds: ${lat}, ${lng}`);
        return NextResponse.json(
          {
            success: false,
            error: `Coordinate ${i + 1} is outside Rwanda boundaries`,
            isValid: false,
            intersections: [],
            errors: [`Coordinate ${i + 1} (${lat.toFixed(6)}, ${lng.toFixed(6)}) is outside Rwanda boundaries`]
          },
          { status: 400 }
        );
      }
    }

    console.log('✅ Request validation passed, proceeding with polygon validation');

    // Perform polygon intersection validation
    const validationRequest: ValidationRequest = {
      coordinates,
      applicationId
    };

    const result = await validateCoordinates(validationRequest, useServerValidation);

    console.log('📊 Validation result:', {
      isValid: result.isValid,
      intersectionCount: result.intersections.length,
      errorCount: result.errors.length,
      hasPolygon: !!result.polygon
    });

    // Return successful validation result
    return NextResponse.json({
      success: true,
      isValid: result.isValid,
      intersections: result.intersections,
      errors: result.errors,
      summary: result.summary,
      polygon: result.polygon ? {
        type: result.polygon.type,
        geometry: result.polygon.geometry,
        properties: result.polygon.properties
      } : null,
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
    },
    rwandaBounds: {
      latitude: { min: -2.91, max: -1.05 },
      longitude: { min: 28.86, max: 30.90 }
    }
  });
}
