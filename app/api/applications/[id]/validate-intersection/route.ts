// =============================================
// API Route: Application Intersection Validation
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { geometryToCoordinatePolygons, coordinatesToGeoJSON, validatePolygon } from '@/lib/geoUtils';
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

    // Extract polygons from PostGIS geometry (Polygon/MultiPolygon/Point -> polygons[])
    const polygons = geometryToCoordinatePolygons(application.coordinates);
    if (!polygons || polygons.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid coordinate data',
          isValid: false,
          intersections: [],
          errors: ['Application coordinates are not in a valid polygon format']
        },
        { status: 400 }
      );
    }

    const polyFeatures = polygons
      .map((p) => coordinatesToGeoJSON(p))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));

    if (polyFeatures.length !== polygons.length) {
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

    const errors: string[] = [];
    for (let i = 0; i < polyFeatures.length; i += 1) {
      const basic = validatePolygon(polyFeatures[i]);
      errors.push(...basic.errors.map((e) => `Polygon ${i + 1}: ${e}`));
    }

    // Duplicate polygon check against other applications
    if (errors.length === 0) {
      const candidateKeys = polyFeatures.map((p) => polygonToKey(p));
      const { data: apps, error: appsError } = await admin
        .from('applications')
        .select('id, project_title, coordinates')
        .not('coordinates', 'is', null)
        .neq('id', applicationId);

      if (appsError) {
        throw new Error(`Failed to check existing applications: ${appsError.message}`);
      }

      const match = (apps || []).some((app: any) => {
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

      if (match) {
        errors.push('Duplicate polygon detected: at least one polygon already exists in another application.');
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
        type: polyFeatures[0].type,
        geometry: polyFeatures[0].geometry,
        properties: polyFeatures[0].properties
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

