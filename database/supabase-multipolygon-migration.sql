-- Supabase Migration: Update application coordinates to support MultiPolygon + variable points
-- Run this in Supabase SQL Editor
-- Date: 2025-12-23

-- 1) Drop dependent view(s)
DROP VIEW IF EXISTS application_coordinates_view;

-- 2) Ensure coordinates column supports Polygon/MultiPolygon/Point (already GEOMETRY(GEOMETRY,4326) in most envs)
ALTER TABLE public.applications
ALTER COLUMN coordinates TYPE GEOMETRY(GEOMETRY, 4326);

COMMENT ON COLUMN public.applications.coordinates IS
'Water source / activity geometry - Polygon/MultiPolygon preferred (>=3 points per polygon), Point supported for legacy data';

-- 3) Validation function: allow POINT (legacy), POLYGON, MULTIPOLYGON
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

  -- For POLYGON geometries, validate they have at least 4 points (3 distinct + closing point)
  IF ST_GeometryType(geom) = 'ST_Polygon' THEN
    RETURN ST_NPoints(geom) >= 4;
  END IF;

  -- For MULTIPOLYGON geometries, ensure every polygon has at least 4 points
  IF ST_GeometryType(geom) = 'ST_MultiPolygon' THEN
    RETURN (
      SELECT COALESCE(BOOL_AND(ST_NPoints(d.geom) >= 4), FALSE)
      FROM (SELECT (ST_Dump(geom)).geom) AS d
    );
  END IF;

  -- Reject other geometry types
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 4) Replace constraint
ALTER TABLE public.applications
DROP CONSTRAINT IF EXISTS chk_valid_water_source_coordinates;

ALTER TABLE public.applications
ADD CONSTRAINT chk_valid_water_source_coordinates
CHECK (validate_water_source_polygon(coordinates));

-- 5) Spatial index
CREATE INDEX IF NOT EXISTS idx_applications_coordinates_spatial
ON public.applications USING GIST (coordinates);

-- 6) Updated view: expose both single-list and multi-list formats
CREATE OR REPLACE VIEW application_coordinates_view AS
SELECT
  id,
  application_number,
  coordinates,
  ST_GeometryType(coordinates) AS geometry_type,

  -- Back-compat: a single flat list (Point -> 1 point, Polygon -> ring points excluding close point, MultiPolygon -> FIRST polygon ring)
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
            'latitude', ST_Y(p.geom)::TEXT,
            'longitude', ST_X(p.geom)::TEXT
          ) ORDER BY p.path[1]
        )
        FROM (
          SELECT (ST_DumpPoints(coordinates)).geom, (ST_DumpPoints(coordinates)).path
        ) AS p
        WHERE p.path[2] = 1
          AND p.path[1] < ST_NPoints(coordinates) -- exclude closing point
      )
    WHEN ST_GeometryType(coordinates) = 'ST_MultiPolygon' THEN
      (
        WITH first_poly AS (
          SELECT (ST_Dump(coordinates)).geom AS geom
          LIMIT 1
        )
        SELECT jsonb_agg(
          jsonb_build_object(
            'latitude', ST_Y(p.geom)::TEXT,
            'longitude', ST_X(p.geom)::TEXT
          ) ORDER BY p.path[1]
        )
        FROM first_poly fp,
        LATERAL (
          SELECT (ST_DumpPoints(fp.geom)).geom, (ST_DumpPoints(fp.geom)).path
        ) AS p
        WHERE p.path[2] = 1
          AND p.path[1] < ST_NPoints(fp.geom) -- exclude closing point
      )
    ELSE NULL
  END AS coordinates_array,

  -- New: polygons array-of-arrays
  CASE
    WHEN ST_GeometryType(coordinates) = 'ST_Point' THEN
      jsonb_build_array(
        jsonb_build_array(
          jsonb_build_object(
            'latitude', ST_Y(coordinates)::TEXT,
            'longitude', ST_X(coordinates)::TEXT
          )
        )
      )
    WHEN ST_GeometryType(coordinates) = 'ST_Polygon' THEN
      jsonb_build_array(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'latitude', ST_Y(p.geom)::TEXT,
              'longitude', ST_X(p.geom)::TEXT
            ) ORDER BY p.path[1]
          )
          FROM (
            SELECT (ST_DumpPoints(coordinates)).geom, (ST_DumpPoints(coordinates)).path
          ) AS p
          WHERE p.path[2] = 1
            AND p.path[1] < ST_NPoints(coordinates)
        )
      )
    WHEN ST_GeometryType(coordinates) = 'ST_MultiPolygon' THEN
      (
        SELECT jsonb_agg(poly_points ORDER BY poly_idx)
        FROM (
          SELECT
            d.path[1] AS poly_idx,
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'latitude', ST_Y(p.geom)::TEXT,
                  'longitude', ST_X(p.geom)::TEXT
                ) ORDER BY p.path[1]
              )
              FROM (
                SELECT (ST_DumpPoints(d.geom)).geom, (ST_DumpPoints(d.geom)).path
              ) AS p
              WHERE p.path[2] = 1
                AND p.path[1] < ST_NPoints(d.geom)
            ) AS poly_points
          FROM (SELECT (ST_Dump(coordinates)).geom, (ST_Dump(coordinates)).path) AS d
        ) polys
      )
    ELSE NULL
  END AS polygons_array

FROM public.applications
WHERE coordinates IS NOT NULL;

GRANT SELECT ON application_coordinates_view TO authenticated, anon;

-- 7) Permissions for validation function
GRANT EXECUTE ON FUNCTION validate_water_source_polygon(GEOMETRY) TO authenticated, anon;


