-- =============================================
-- Fix: Concession Map Missing Permits
-- Rwanda Water Resources Board - Water Permit System
-- 
-- Problem: Map was showing 3 permits instead of 4 due to:
--   1. permits.coordinates column was GEOMETRY(POLYGON, 4326) — rejected Point/MultiPolygon
--   2. SQL function only returned 'active'/'expiring_soon' status
--   3. copy_coordinates trigger only handled ST_Polygon (not ST_MultiPolygon/ST_Point)
--   4. Permits with NULL coordinates (never copied) were silently excluded
-- =============================================

-- 0. CRITICAL: Widen the permits.coordinates column type to accept any geometry
--    It was originally GEOMETRY(POLYGON, 4326) which rejects Point and MultiPolygon.
--    The applications table already uses GEOMETRY(GEOMETRY, 4326), so permits should match.
--    First drop the spatial index, alter the type, then recreate the index.
DROP INDEX IF EXISTS idx_permits_coordinates_spatial;

ALTER TABLE public.permits
ALTER COLUMN coordinates TYPE GEOMETRY(GEOMETRY, 4326)
USING coordinates::GEOMETRY(GEOMETRY, 4326);

CREATE INDEX IF NOT EXISTS idx_permits_coordinates_spatial
ON public.permits USING GIST (coordinates);

COMMENT ON COLUMN public.permits.coordinates IS 'Permit geometry copied from approved application - supports Polygon, MultiPolygon, and legacy Point';

-- 1. Update get_approved_permit_polygons() to return ALL valid permits
--    (filtering by status/date is now done at the API layer)
CREATE OR REPLACE FUNCTION get_approved_permit_polygons()
RETURNS TABLE(
    permit_id UUID,
    permit_number VARCHAR(50),
    project_title VARCHAR(255),
    coordinates_geojson JSONB,
    status permit_status,
    issued_date DATE,
    expiry_date DATE,
    water_purpose water_purpose
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.permit_number,
        a.project_title,
        ST_AsGeoJSON(p.coordinates)::JSONB as coordinates_geojson,
        p.status,
        p.issued_date,
        p.expiry_date,
        p.purpose
    FROM public.permits p
    JOIN public.applications a ON p.application_id = a.id
    WHERE p.coordinates IS NOT NULL
    AND ST_IsValid(p.coordinates)
    ORDER BY p.issued_date DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. Update copy_coordinates_to_permit() trigger to handle all geometry types
--    (ST_Polygon, ST_MultiPolygon, ST_Point)
CREATE OR REPLACE FUNCTION copy_coordinates_to_permit()
RETURNS TRIGGER AS $$
BEGIN
    -- Copy coordinates from the associated application (any valid geometry type)
    UPDATE public.permits 
    SET coordinates = (
        SELECT coordinates 
        FROM public.applications 
        WHERE id = NEW.application_id
        AND coordinates IS NOT NULL
        AND ST_IsValid(coordinates)
    )
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Backfill: Copy coordinates for permits that were missed because their
--    application had ST_MultiPolygon or ST_Point geometry (previously rejected)
UPDATE public.permits 
SET coordinates = a.coordinates
FROM public.applications a
WHERE permits.application_id = a.id
AND permits.coordinates IS NULL
AND a.coordinates IS NOT NULL
AND ST_IsValid(a.coordinates);

-- 4. Log how many permits were fixed
DO $$
DECLARE
    total_permits INTEGER;
    permits_with_coords INTEGER;
    permits_missing_coords INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_permits FROM public.permits;
    SELECT COUNT(*) INTO permits_with_coords FROM public.permits WHERE coordinates IS NOT NULL;
    permits_missing_coords := total_permits - permits_with_coords;
    
    RAISE NOTICE '✅ Migration complete:';
    RAISE NOTICE '   📊 Total permits: %', total_permits;
    RAISE NOTICE '   🗺️  Permits with coordinates: %', permits_with_coords;
    RAISE NOTICE '   ⚠️  Permits still missing coordinates: %', permits_missing_coords;
END $$;
