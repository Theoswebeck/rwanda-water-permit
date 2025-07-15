-- =============================================
-- Add Water Body Surface Area Field
-- For water concession usage visualization
-- =============================================

-- Add water body surface area to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS water_body_surface_area DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS surface_area_unit VARCHAR(20) DEFAULT 'hectares';

-- Add water body surface area to permits table  
ALTER TABLE permits
ADD COLUMN IF NOT EXISTS water_body_surface_area DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS surface_area_unit VARCHAR(20) DEFAULT 'hectares';

-- Add comments for documentation
COMMENT ON COLUMN applications.water_body_surface_area IS 'Surface area of the water body being used (hectares)';
COMMENT ON COLUMN applications.surface_area_unit IS 'Unit of measurement for water body surface area';
COMMENT ON COLUMN permits.water_body_surface_area IS 'Surface area of the water body being used (hectares)';
COMMENT ON COLUMN permits.surface_area_unit IS 'Unit of measurement for water body surface area';

-- Update existing applications with sample surface area data
UPDATE applications 
SET water_body_surface_area = 
    CASE 
        WHEN estimated_usage_volume >= 50000 THEN ROUND((RANDOM() * 500 + 100)::numeric, 2) -- Large: 100-600 hectares
        WHEN estimated_usage_volume >= 20000 THEN ROUND((RANDOM() * 200 + 50)::numeric, 2)  -- Medium: 50-250 hectares  
        WHEN estimated_usage_volume >= 5000 THEN ROUND((RANDOM() * 80 + 20)::numeric, 2)    -- Small: 20-100 hectares
        ELSE ROUND((RANDOM() * 30 + 5)::numeric, 2)                                         -- Tiny: 5-35 hectares
    END,
    surface_area_unit = 'hectares'
WHERE water_body_surface_area IS NULL; 