// =============================================
// API Route: Application Intersection Validation
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateCoordinates, updateApplicationValidation } from '@/lib/polygonValidation';
import { z } from 'zod';

// =============================================
// VALIDATION SCHEMAS
// =============================================

const ParamsSchema = z.object({
  id: z.string().uuid('Invalid application ID format')
});

const QueryParamsSchema = z.object({
  updateRecord: z.boolean().optional().default(true),
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

    console.log(`📋 Validating application ${applicationId}, updateRecord: ${updateRecord}`);

    // Fetch application coordinates
    const { data: application, error: fetchError } = await supabase
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

    console.log('✅ Application coordinates extracted, proceeding with validation');

    // Perform validation
    const validationResult = await validateCoordinates(
      {
        coordinates,
        applicationId
      },
      useServerValidation
    );

    console.log('📊 Validation completed:', {
      isValid: validationResult.isValid,
      intersectionCount: validationResult.intersections.length,
      errorCount: validationResult.errors.length
    });

    // Update application record if requested
    if (updateRecord) {
      const updateSuccess = await updateApplicationValidation(applicationId, validationResult);
      if (!updateSuccess) {
        console.warn('⚠️ Failed to update application validation status');
      } else {
        console.log('✅ Application validation status updated');
      }
    }

    // Return validation result
    return NextResponse.json({
      success: true,
      applicationId,
      applicationTitle: application.project_title,
      isValid: validationResult.isValid,
      intersections: validationResult.intersections,
      errors: validationResult.errors,
      summary: validationResult.summary,
      polygon: validationResult.polygon ? {
        type: validationResult.polygon.type,
        geometry: validationResult.polygon.geometry,
        properties: validationResult.polygon.properties
      } : null,
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
