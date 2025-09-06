-- Supabase Migration: Update coordinates to support polygons
-- Run this in Supabase SQL Editor
-- Date: 2024-09-02

-- 1. Drop any existing views that depend on the coordinates column
DROP VIEW IF EXISTS application_coordinates_view;

-- 2. Update the coordinates column to support both POINT and POLYGON geometries
ALTER TABLE public.applications 
ALTER COLUMN coordinates TYPE GEOMETRY(GEOMETRY, 4326);

-- 3. Create validation function
CREATE OR REPLACE FUNCTION validate_water_source_polygon(geom GEOMETRY)
RETURNS BOOLEAN AS $$
BEGIN
    IF geom IS NULL THEN RETURN TRUE; END IF;
    IF ST_GeometryType(geom) = 'ST_Point' THEN RETURN TRUE; END IF;
    IF ST_GeometryType(geom) = 'ST_Polygon' THEN
        RETURN ST_NPoints(geom) >= 5;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 4. Drop existing constraint if it exists and add new one
ALTER TABLE public.applications 
DROP CONSTRAINT IF EXISTS chk_valid_water_source_coordinates;

ALTER TABLE public.applications 
ADD CONSTRAINT chk_valid_water_source_coordinates 
CHECK (validate_water_source_polygon(coordinates));

-- 5. Create spatial index
CREATE INDEX IF NOT EXISTS idx_applications_coordinates_spatial 
ON public.applications USING GIST (coordinates);

-- 6. Helper function for coordinate conversion
CREATE OR REPLACE FUNCTION create_polygon_from_coordinates(coord_array JSONB)
RETURNS GEOMETRY AS $$
DECLARE
    wkt_string TEXT;
    coord_item JSONB;
    lat FLOAT;
    lng FLOAT;
    point_count INTEGER := 0;
    points_array TEXT[] := '{}';
BEGIN
    IF coord_array IS NULL OR jsonb_array_length(coord_array) = 0 THEN
        RETURN NULL;
    END IF;
    
    FOR coord_item IN SELECT value FROM jsonb_array_elements(coord_array)
    LOOP
        lat := (coord_item->>'latitude')::FLOAT;
        lng := (coord_item->>'longitude')::FLOAT;
        
        IF lat IS NULL OR lng IS NULL OR 
           lat < -90 OR lat > 90 OR 
           lng < -180 OR lng > 180 THEN
            CONTINUE;
        END IF;
        
        points_array := array_append(points_array, lng::TEXT || ' ' || lat::TEXT);
        point_count := point_count + 1;
    END LOOP;
    
    IF point_count != 5 THEN
        RETURN NULL;
    END IF;
    
    points_array := array_append(points_array, points_array[1]);
    wkt_string := 'POLYGON((' || array_to_string(points_array, ',') || '))';
    
    RETURN ST_GeomFromText(wkt_string, 4326);
    
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION validate_water_source_polygon(GEOMETRY) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_polygon_from_coordinates(JSONB) TO authenticated, anon;

-- 8. Create coordinate extraction view
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
                WHERE path[2] <= 5
            )
        ELSE NULL
    END as coordinates_array
FROM public.applications
WHERE coordinates IS NOT NULL;

GRANT SELECT ON application_coordinates_view TO authenticated, anon;
