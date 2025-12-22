// =============================================
// API Route: Application Intersection Validation
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { coordinatesToGeoJSON, validatePolygon } from '@/lib/geoUtils';
import { polygonToKey } from '@/lib/polygonKey';
import { z } from 'zod';

// =============================================
// VALIDATION SCHEMAS
// =============================================

const ParamsSchema = z.object({
  id: z.string().uuid('Invalid application ID format')
});

const QueryParamsSchema = z.object({
  updateRecord: z.boolean().optional().default(true),
  // kept for backwards compatibility, but ignored in the new implementation
  useServerValidation: z.boolean().optional().default(true)
});

// =============================================
// API HANDLERS
// =============================================

/**
 * POST /api/applications/[id]/validate-intersection
 * Validates an existing application's coordinates against permits
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🔍 Application intersection validation request received');
    
    // Validate parameters
    const paramsValidation = ParamsSchema.safeParse(params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid application ID',
          details: paramsValidation.error.errors
        },
        { status: 400 }
      );
    }

    const { id: applicationId } = paramsValidation.data;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      updateRecord: searchParams.get('updateRecord') !== 'false',
      useServerValidation: searchParams.get('useServerValidation') !== 'false'
    };

    const queryValidation = QueryParamsSchema.safeParse(queryParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: queryValidation.error.errors
        },
        { status: 400 }
      );
    }

    const { updateRecord, useServerValidation } = queryValidation.data;
    void useServerValidation;

    console.log(`📋 Validating application ${applicationId}, updateRecord: ${updateRecord}`);

    const admin = createAdminClient();

    // Fetch application coordinates
    const { data: application, error: fetchError } = await admin
      .from('applications')
      .select('id, coordinates, status, project_title')
      .eq('id', applicationId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching application:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: 'Application not found',
          message: fetchError.message
        },
        { status: 404 }
      );
    }

    if (!application.coordinates) {
      return NextResponse.json(
        {
          success: false,
          error: 'Application has no coordinates to validate',
          isValid: false,
          intersections: [],
          errors: ['No coordinates found for this application']
        },
        { status: 400 }
      );
    }

    // Extract coordinates from PostGIS geometry
    const coordinates = extractCoordinatesFromGeometry(application.coordinates);
    if (!coordinates || coordinates.length !== 5) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid coordinate data',
          isValid: false,
          intersections: [],
          errors: ['Application coordinates are not in the expected 5-point polygon format']
        },
        { status: 400 }
      );
    }

    const polygon = coordinatesToGeoJSON(coordinates);
    if (!polygon) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid coordinate data',
          isValid: false,
          intersections: [],
          errors: ['Failed to create valid polygon from stored coordinates']
        },
        { status: 400 }
      );
    }

    const basic = validatePolygon(polygon);
    const errors: string[] = [...basic.errors];

    // Duplicate polygon check against other applications
    if (basic.isValid) {
      const candidateKey = polygonToKey(polygon);
      const { data: apps, error: appsError } = await admin
        .from('applications')
        .select('id, project_title, coordinates')
        .not('coordinates', 'is', null)
        .neq('id', applicationId);

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
        errors.push('Duplicate polygon detected: this polygon already exists in another application.');
      }
    }

    const isValid = errors.length === 0;

    console.log('📊 Validation completed:', {
      isValid,
      errorCount: errors.length
    });

    // Update application record if requested (reuse existing columns for status)
    if (updateRecord) {
      const { error: updateError } = await admin
        .from('applications')
        .update({
          intersection_validation_status: isValid ? 'valid' : 'invalid',
          intersecting_permits: [],
          intersection_details: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) {
        console.warn('⚠️ Failed to update application validation status:', updateError.message);
      } else {
        console.log('✅ Application validation status updated');
      }
    }

    // Return validation result
    return NextResponse.json({
      success: true,
      applicationId,
      applicationTitle: application.project_title,
      isValid,
      intersections: [],
      errors,
      summary: { ruleSet: 'rwanda_bounds_and_no_duplicate_polygon' },
      polygon: {
        type: polygon.type,
        geometry: polygon.geometry,
        properties: polygon.properties
      },
      validatedAt: new Date().toISOString(),
      recordUpdated: updateRecord
    });

  } catch (error) {
    console.error('❌ Error in application intersection validation API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during validation',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/applications/[id]/validate-intersection
 * Get current validation status for an application
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('📊 Application validation status request received');
    
    // Validate parameters
    const paramsValidation = ParamsSchema.safeParse(params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid application ID',
          details: paramsValidation.error.errors
        },
        { status: 400 }
      );
    }

    const { id: applicationId } = paramsValidation.data;

    // Fetch application validation status
    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select(`
        id,
        project_title,
        status,
        coordinates,
        intersection_validation_status,
        intersecting_permits,
        intersection_details,
        updated_at
      `)
      .eq('id', applicationId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching application:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: 'Application not found',
          message: fetchError.message
        },
        { status: 404 }
      );
    }

    // Format response
    const hasCoordinates = !!application.coordinates;
    const validationStatus = application.intersection_validation_status || 'pending';
    const intersectingPermits = application.intersecting_permits || [];
    const intersectionDetails = application.intersection_details || [];

    return NextResponse.json({
      success: true,
      applicationId,
      applicationTitle: application.project_title,
      applicationStatus: application.status,
      hasCoordinates,
      validation: {
        status: validationStatus,
        isValid: validationStatus === 'valid',
        intersectingPermitIds: intersectingPermits,
        intersectionDetails: intersectionDetails,
        lastValidated: application.updated_at,
        needsRevalidation: validationStatus === 'pending'
      },
      actions: {
        canValidate: hasCoordinates,
        canRevalidate: hasCoordinates && validationStatus !== 'pending',
        validationEndpoint: `/api/applications/${applicationId}/validate-intersection`
      }
    });

  } catch (error) {
    console.error('❌ Error fetching application validation status:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch validation status',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Extract coordinates from PostGIS geometry object
 */
function extractCoordinatesFromGeometry(geometry: any): Array<{latitude: string; longitude: string}> | null {
  try {
    if (!geometry || !geometry.coordinates) return null;

    if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
      const coords = geometry.coordinates[0];
      return coords.slice(0, 5).map((coord: number[]) => ({
        longitude: coord[0].toString(),
        latitude: coord[1].toString()
      }));
    }

    // Handle legacy Point format
    if (geometry.type === 'Point' && geometry.coordinates.length >= 2) {
      return [
        {
          longitude: geometry.coordinates[0].toString(),
          latitude: geometry.coordinates[1].toString()
        },
        { longitude: '', latitude: '' },
        { longitude: '', latitude: '' },
        { longitude: '', latitude: '' },
        { longitude: '', latitude: '' }
      ];
    }

    return null;
  } catch (error) {
    console.error('Error extracting coordinates from geometry:', error);
    return null;
  }
}
