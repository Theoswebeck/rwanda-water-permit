// =============================================
// API Route: Approved Permits Polygons
// Rwanda Water Board - Water Permit System
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { fetchApprovedPermitPolygons } from '@/lib/polygonValidation';
import { z } from 'zod';

// =============================================
// VALIDATION SCHEMAS
// =============================================

const QueryParamsSchema = z.object({
  status: z.enum(['active', 'expiring_soon', 'all']).optional().default('active'),
  includeExpired: z.boolean().optional().default(false),
  format: z.enum(['geojson', 'simple']).optional().default('geojson'),
  limit: z.number().min(1).max(1000).optional().default(100),
  offset: z.number().min(0).optional().default(0)
});

// =============================================
// API HANDLERS
// =============================================

/**
 * GET /api/approved-permits/polygons
 * Returns polygon data for all approved water permits
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🗺️ Approved permits polygons request received');
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      status: searchParams.get('status') || 'active',
      includeExpired: searchParams.get('includeExpired') === 'true',
      format: searchParams.get('format') || 'geojson',
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0')
    };

    console.log('📋 Query parameters:', queryParams);

    const validationResult = QueryParamsSchema.safeParse(queryParams);
    
    if (!validationResult.success) {
      console.error('❌ Query parameter validation failed:', validationResult.error.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    const { status, includeExpired, format, limit, offset } = validationResult.data;

    // Fetch approved permit polygons
    console.log('🔍 Fetching approved permit polygons from database...');
    const allPermits = await fetchApprovedPermitPolygons();

    // Filter out permits with missing coordinates
    const permitsWithCoordinates = allPermits.filter(permit => {
      if (!permit.coordinates || !permit.coordinates.geometry || !permit.coordinates.geometry.coordinates) {
        console.warn(`⚠️ Permit ${permit.permitNumber} has missing coordinates - excluding from response`);
        return false;
      }
      return true;
    });

    console.log(`📊 Filtered ${permitsWithCoordinates.length} permits with valid coordinates from ${allPermits.length} total permits`);

    // Filter permits based on parameters
    let filteredPermits = permitsWithCoordinates;

    // Filter by status
    if (status !== 'all') {
      filteredPermits = filteredPermits.filter(permit => permit.status === status);
    }

    // Filter expired permits if not included
    if (!includeExpired) {
      const today = new Date();
      filteredPermits = filteredPermits.filter(permit => {
        const expiryDate = new Date(permit.expiryDate);
        return expiryDate > today;
      });
    }

    // Apply pagination
    const totalCount = filteredPermits.length;
    const paginatedPermits = filteredPermits.slice(offset, offset + limit);

    console.log(`📊 Returning ${paginatedPermits.length} of ${totalCount} permits`);

    // Format response based on requested format
    if (format === 'simple') {
      const simpleFormat = paginatedPermits.map(permit => ({
        permitId: permit.permitId,
        permitNumber: permit.permitNumber,
        projectTitle: permit.projectTitle,
        status: permit.status,
        issuedDate: permit.issuedDate,
        expiryDate: permit.expiryDate,
        coordinates: permit.coordinates.geometry.coordinates,
        centroid: getCentroid(permit.coordinates.geometry.coordinates[0])
      }));

      return NextResponse.json({
        success: true,
        data: simpleFormat,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        },
        metadata: {
          format: 'simple',
          generatedAt: new Date().toISOString()
        }
      });
    }

    // Default GeoJSON format
    const geoJsonFeatureCollection = {
      type: 'FeatureCollection' as const,
      features: paginatedPermits.map(permit => ({
        type: 'Feature' as const,
        id: permit.permitId,
        geometry: permit.coordinates.geometry,
        properties: {
          permitId: permit.permitId,
          permitNumber: permit.permitNumber,
          projectTitle: permit.projectTitle,
          status: permit.status,
          issuedDate: permit.issuedDate,
          expiryDate: permit.expiryDate,
          isExpiring: isExpiringSoon(permit.expiryDate),
          area: calculatePolygonArea(permit.coordinates.geometry.coordinates[0])
        }
      }))
    };

    return NextResponse.json({
      success: true,
      data: geoJsonFeatureCollection,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      },
      metadata: {
        format: 'geojson',
        generatedAt: new Date().toISOString(),
        bounds: calculateBounds(paginatedPermits)
      }
    });

  } catch (error) {
    console.error('❌ Error in approved permits polygons API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch approved permit polygons',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/approved-permits/polygons
 * Refresh permit polygon cache (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Permit polygon cache refresh requested');
    
    // TODO: Add authentication check for admin role
    // For now, allowing all requests
    
    // Force refresh of permit polygons
    const permits = await fetchApprovedPermitPolygons();
    
    console.log(`✅ Refreshed ${permits.length} permit polygons`);
    
    return NextResponse.json({
      success: true,
      message: 'Permit polygon cache refreshed successfully',
      count: permits.length,
      refreshedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error refreshing permit polygon cache:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh permit polygon cache',
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
 * Calculate centroid of a polygon
 */
function getCentroid(coordinates: number[][]): [number, number] {
  let x = 0, y = 0;
  const n = coordinates.length - 1; // Exclude closing point
  
  for (let i = 0; i < n; i++) {
    x += coordinates[i][0];
    y += coordinates[i][1];
  }
  
  return [x / n, y / n];
}

/**
 * Check if permit is expiring soon (within 30 days)
 */
function isExpiringSoon(expiryDate: string): boolean {
  const expiry = new Date(expiryDate);
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  
  return expiry <= thirtyDaysFromNow && expiry > today;
}

/**
 * Calculate approximate polygon area (simple method)
 */
function calculatePolygonArea(coordinates: number[][]): number {
  let area = 0;
  const n = coordinates.length - 1; // Exclude closing point
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }
  
  return Math.abs(area / 2);
}

/**
 * Calculate bounding box for all permits
 */
function calculateBounds(permits: any[]): [number, number, number, number] | null {
  if (permits.length === 0) return null;
  
  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  
  permits.forEach(permit => {
    // Safe check for coordinates
    if (!permit.coordinates?.geometry?.coordinates?.[0]) {
      return;
    }
    
    const coordinates = permit.coordinates.geometry.coordinates[0];
    coordinates.forEach((coord: number[]) => {
      if (Array.isArray(coord) && coord.length >= 2) {
        minLng = Math.min(minLng, coord[0]);
        maxLng = Math.max(maxLng, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
      }
    });
  });
  
  // Return null if no valid coordinates were found
  if (minLng === Infinity || minLat === Infinity) {
    return null;
  }
  
  return [minLng, minLat, maxLng, maxLat];
}
