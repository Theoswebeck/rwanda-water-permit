-- =============================================
-- Polygon Intersection Validation Migration
-- Rwanda Water Board - Water Permit System
-- =============================================

-- 1. Add coordinates column to permits table to store approved permit polygons
ALTER TABLE public.permits 
ADD COLUMN IF NOT EXISTS coordinates GEOMETRY(POLYGON, 4326);

-- 2. Create spatial index for fast intersection queries on permits
CREATE INDEX IF NOT EXISTS idx_permits_coordinates_spatial 
ON public.permits USING GIST (coordinates);

-- 3. Add intersection validation tracking fields to applications
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS intersection_validation_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS intersecting_permits UUID[],
ADD COLUMN IF NOT EXISTS intersection_details JSONB;

-- 4. Create index for intersection validation status
CREATE INDEX IF NOT EXISTS idx_applications_intersection_status 
ON public.applications(intersection_validation_status);

-- 5. Function to validate polygon intersections against existing permits
CREATE OR REPLACE FUNCTION validate_polygon_intersection(
    new_polygon GEOMETRY,
    application_id UUID DEFAULT NULL
) RETURNS TABLE(
    has_intersection BOOLEAN,
    intersecting_permit_ids UUID[],
    intersection_details JSONB
) AS $$
DECLARE
    intersection_found BOOLEAN := FALSE;
    permit_ids UUID[] := '{}';
    details JSONB := '[]'::JSONB;
    permit_record RECORD;
    intersection_geom GEOMETRY;
    intersection_area DOUBLE PRECISION;
    new_area DOUBLE PRECISION;
    permit_area DOUBLE PRECISION;
    overlap_percentage DOUBLE PRECISION;
BEGIN
    -- Skip validation if new_polygon is NULL
    IF new_polygon IS NULL THEN
        RETURN QUERY SELECT FALSE, '{}'::UUID[], '[]'::JSONB;
        RETURN;
    END IF;
    
    -- Calculate area of new polygon
    new_area := ST_Area(ST_Transform(new_polygon, 32736)); -- UTM Zone 36S for Rwanda
    
    -- Check against all active permits with coordinates
    FOR permit_record IN 
        SELECT p.id, p.permit_number, p.coordinates, a.project_title, a.applicant_id
        FROM public.permits p
        JOIN public.applications a ON p.application_id = a.id
        WHERE p.status = 'active' 
        AND p.coordinates IS NOT NULL
        AND ST_IsValid(p.coordinates)
        AND (application_id IS NULL OR p.application_id != application_id) -- Exclude self if updating
    LOOP
        -- Check if polygons intersect
        IF ST_Intersects(new_polygon, permit_record.coordinates) THEN
            intersection_found := TRUE;
            permit_ids := array_append(permit_ids, permit_record.id);
            
            -- Calculate intersection details
            intersection_geom := ST_Intersection(new_polygon, permit_record.coordinates);
            intersection_area := ST_Area(ST_Transform(intersection_geom, 32736));
            permit_area := ST_Area(ST_Transform(permit_record.coordinates, 32736));
            overlap_percentage := ROUND((intersection_area / LEAST(new_area, permit_area) * 100)::numeric, 2);
            
            -- Build intersection detail object
            details := details || jsonb_build_object(
                'permit_id', permit_record.id,
                'permit_number', permit_record.permit_number,
                'project_title', permit_record.project_title,
                'intersection_area_m2', ROUND(intersection_area::numeric, 2),
                'overlap_percentage', overlap_percentage,
                'intersection_type', CASE 
                    WHEN ST_Contains(new_polygon, permit_record.coordinates) THEN 'new_contains_existing'
                    WHEN ST_Contains(permit_record.coordinates, new_polygon) THEN 'existing_contains_new'
                    WHEN ST_Overlaps(new_polygon, permit_record.coordinates) THEN 'partial_overlap'
                    WHEN ST_Touches(new_polygon, permit_record.coordinates) THEN 'boundaries_touch'
                    ELSE 'general_intersection'
                END
            );
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT intersection_found, permit_ids, details;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to get all approved permit polygons for client-side validation
CREATE OR REPLACE FUNCTION get_approved_permit_polygons()
RETURNS TABLE(
    permit_id UUID,
    permit_number VARCHAR(50),
    project_title VARCHAR(255),
    coordinates_geojson JSONB,
    status permit_status,
    issued_date DATE,
    expiry_date DATE
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
        p.expiry_date
    FROM public.permits p
    JOIN public.applications a ON p.application_id = a.id
    WHERE p.status IN ('active', 'expiring_soon')
    AND p.coordinates IS NOT NULL
    AND ST_IsValid(p.coordinates)
    ORDER BY p.issued_date DESC;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to copy coordinates from application to permit when permit is created
CREATE OR REPLACE FUNCTION copy_coordinates_to_permit()
RETURNS TRIGGER AS $$
BEGIN
    -- Copy coordinates from the associated application
    UPDATE public.permits 
    SET coordinates = (
        SELECT coordinates 
        FROM public.applications 
        WHERE id = NEW.application_id
        AND coordinates IS NOT NULL
        AND ST_GeometryType(coordinates) = 'ST_Polygon'
    )
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger to auto-copy coordinates when permit is created
DROP TRIGGER IF EXISTS copy_coordinates_on_permit_creation ON public.permits;
CREATE TRIGGER copy_coordinates_on_permit_creation
    AFTER INSERT ON public.permits
    FOR EACH ROW
    EXECUTE FUNCTION copy_coordinates_to_permit();

-- 9. Update existing permits with coordinates from their applications (one-time migration)
UPDATE public.permits 
SET coordinates = a.coordinates
FROM public.applications a
WHERE permits.application_id = a.id
AND permits.coordinates IS NULL
AND a.coordinates IS NOT NULL
AND ST_GeometryType(a.coordinates) = 'ST_Polygon';

-- 10. Grant permissions for the new functions
GRANT EXECUTE ON FUNCTION validate_polygon_intersection(GEOMETRY, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_approved_permit_polygons() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION copy_coordinates_to_permit() TO authenticated, anon;

-- 11. Add helpful comments
COMMENT ON COLUMN public.permits.coordinates IS 'Polygon geometry copied from approved application';
COMMENT ON COLUMN public.applications.intersection_validation_status IS 'Status of polygon intersection validation: pending, valid, invalid';
COMMENT ON COLUMN public.applications.intersecting_permits IS 'Array of permit IDs that intersect with this application';
COMMENT ON COLUMN public.applications.intersection_details IS 'Detailed information about polygon intersections';

-- 12. Create view for easy access to application coordinates with intersection status
CREATE OR REPLACE VIEW application_polygon_validation_view AS
SELECT 
    a.id,
    a.application_number,
    a.project_title,
    a.status,
    a.coordinates,
    ST_AsGeoJSON(a.coordinates)::JSONB as coordinates_geojson,
    a.intersection_validation_status,
    a.intersecting_permits,
    a.intersection_details,
    CASE 
        WHEN a.coordinates IS NULL THEN 'no_coordinates'
        WHEN ST_GeometryType(a.coordinates) != 'ST_Polygon' THEN 'invalid_geometry'
        WHEN a.intersection_validation_status = 'valid' THEN 'valid'
        WHEN a.intersection_validation_status = 'invalid' THEN 'invalid'
        ELSE 'pending_validation'
    END as validation_summary
FROM public.applications a
WHERE a.coordinates IS NOT NULL;

GRANT SELECT ON application_polygon_validation_view TO authenticated, anon;

-- 13. Show migration completion status
SELECT 
    'Polygon intersection validation migration completed successfully' as status,
    'Added coordinates column to permits table' as permits_update,
    'Added intersection validation fields to applications table' as applications_update,
    'Created spatial indexes for performance' as indexes_created,
    'Created validation functions and triggers' as functions_created,
    COUNT(*) as existing_permits_updated
FROM public.permits 
WHERE coordinates IS NOT NULL;
