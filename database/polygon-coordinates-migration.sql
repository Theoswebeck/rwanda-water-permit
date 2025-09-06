-- Migration: Update coordinates field to support polygons instead of points
-- Date: 2024-09-02
-- Purpose: Change water source coordinates from single point to polygon (5 points required)

-- 1. Update the coordinates column to support both POINT and POLYGON geometries
-- We'll use GEOMETRY without specifying type to allow both during migration
ALTER TABLE public.applications 
ALTER COLUMN coordinates TYPE GEOMETRY(GEOMETRY, 4326);

-- Add a comment to document the change
COMMENT ON COLUMN public.applications.coordinates IS 'Water source coordinates - POLYGON preferred (5 points), POINT supported for legacy data';

-- 2. Create a function to validate polygon coordinates
CREATE OR REPLACE FUNCTION validate_water_source_polygon(geom GEOMETRY)
RETURNS BOOLEAN AS $$
BEGIN
    -- Allow NULL values
    IF geom IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Allow legacy POINT geometries
    IF ST_GeometryType(geom) = 'ST_Point' THEN
        RETURN TRUE;
    END IF;
    
    -- For POLYGON geometries, validate they have at least 5 distinct points
    IF ST_GeometryType(geom) = 'ST_Polygon' THEN
        -- Check if polygon has at least 5 points (including the closing point)
        -- A valid polygon needs minimum 4 distinct points + 1 closing point = 5 total
        RETURN ST_NPoints(geom) >= 5;
    END IF;
    
    -- Reject other geometry types
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 3. Add a check constraint to validate polygon coordinates
ALTER TABLE public.applications 
ADD CONSTRAINT chk_valid_water_source_coordinates 
CHECK (validate_water_source_polygon(coordinates));

-- 4. Create an index for spatial queries on the coordinates
CREATE INDEX IF NOT EXISTS idx_applications_coordinates_spatial 
ON public.applications USING GIST (coordinates);

-- 5. Update any existing applications with NULL coordinates to have a default empty state
-- (This is safe since coordinates were optional before)
UPDATE public.applications 
SET coordinates = NULL 
WHERE coordinates IS NULL;

-- 6. Create a helper function to convert coordinate arrays to PostGIS polygon
CREATE OR REPLACE FUNCTION create_polygon_from_coordinates(
    coord_array JSONB
) RETURNS GEOMETRY AS $$
DECLARE
    wkt_string TEXT;
    coord_item JSONB;
    lat FLOAT;
    lng FLOAT;
    point_count INTEGER := 0;
    points_array TEXT[] := '{}';
BEGIN
    -- Validate input
    IF coord_array IS NULL OR jsonb_array_length(coord_array) = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Build array of coordinate pairs
    FOR coord_item IN SELECT value FROM jsonb_array_elements(coord_array)
    LOOP
        -- Extract and validate lat/lng
        lat := (coord_item->>'latitude')::FLOAT;
        lng := (coord_item->>'longitude')::FLOAT;
        
        -- Skip invalid coordinates
        IF lat IS NULL OR lng IS NULL OR 
           lat < -90 OR lat > 90 OR 
           lng < -180 OR lng > 180 THEN
            CONTINUE;
        END IF;
        
        -- Add point to array (PostGIS uses lng lat order)
        points_array := array_append(points_array, lng::TEXT || ' ' || lat::TEXT);
        point_count := point_count + 1;
    END LOOP;
    
    -- Need exactly 5 points for our polygon requirement
    IF point_count != 5 THEN
        RETURN NULL;
    END IF;
    
    -- Close the polygon by adding the first point at the end
    points_array := array_append(points_array, points_array[1]);
    
    -- Build WKT string
    wkt_string := 'POLYGON((' || array_to_string(points_array, ',') || '))';
    
    -- Return as PostGIS geometry with SRID 4326 (WGS84)
    RETURN ST_GeomFromText(wkt_string, 4326);
    
EXCEPTION WHEN OTHERS THEN
    -- Return NULL on any error
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. Grant necessary permissions
GRANT EXECUTE ON FUNCTION validate_water_source_polygon(GEOMETRY) TO authenticated;
GRANT EXECUTE ON FUNCTION create_polygon_from_coordinates(JSONB) TO authenticated;

-- 8. Create a view to easily extract coordinate information
CREATE OR REPLACE VIEW application_coordinates_view AS
SELECT 
    id,
    application_number,
    coordinates,
    ST_GeometryType(coordinates) as geometry_type,
    CASE 
        WHEN ST_GeometryType(coordinates) = 'ST_Point' THEN
            jsonb_build_array(
                jsonb_build_object(
                    'latitude', ST_Y(coordinates)::TEXT,
                    'longitude', ST_X(coordinates)::TEXT
                )
            )
        WHEN ST_GeometryType(coordinates) = 'ST_Polygon' THEN
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'latitude', ST_Y(point)::TEXT,
                        'longitude', ST_X(point)::TEXT
                    ) ORDER BY path[1]
                )
                FROM (
                    SELECT (ST_DumpPoints(coordinates)).geom as point, 
                           (ST_DumpPoints(coordinates)).path
                ) points
                WHERE path[2] <= 5  -- Only get first 5 points
            )
        ELSE NULL
    END as coordinates_array
FROM public.applications
WHERE coordinates IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON application_coordinates_view TO authenticated;

-- 9. Add helpful comments
COMMENT ON FUNCTION create_polygon_from_coordinates(JSONB) IS 'Converts a JSON array of coordinate objects to a PostGIS POLYGON geometry';
COMMENT ON VIEW application_coordinates_view IS 'Provides easy access to application coordinates in both geometry and JSON array formats';

-- 10. Migration complete notification
DO $$
BEGIN
    RAISE NOTICE 'Polygon coordinates migration completed successfully!';
    RAISE NOTICE 'Applications table now supports both POINT and POLYGON geometries';
    RAISE NOTICE 'New applications should use POLYGON with exactly 5 coordinate points';
    RAISE NOTICE 'Legacy POINT coordinates are still supported for existing data';
END $$;
