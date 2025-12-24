-- =============================================
-- Test Permit Data for Water Concession Usage Map
-- Realistic permits with lat/long, surface area, and usage
-- =============================================

-- First, ensure we have the surface area columns
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'water_body_surface_area') THEN
        ALTER TABLE applications ADD COLUMN water_body_surface_area DECIMAL(10,2);
        ALTER TABLE applications ADD COLUMN surface_area_unit VARCHAR(20) DEFAULT 'hectares';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'water_body_surface_area') THEN
        ALTER TABLE permits ADD COLUMN water_body_surface_area DECIMAL(10,2);
        ALTER TABLE permits ADD COLUMN surface_area_unit VARCHAR(20) DEFAULT 'hectares';
    END IF;
END $$;

-- Update existing applications with water body surface area
UPDATE applications 
SET 
    water_body_surface_area = 
        CASE application_number
            WHEN 'RWB-2024-000001' THEN 145.50  -- Kigali Industrial - Large borehole area
            WHEN 'RWB-2024-000002' THEN 87.25   -- Commercial Complex - Medium surface water
            WHEN 'RWB-2024-000003' THEN 12.80   -- Residential - Small borehole
            WHEN 'RWB-2024-000004' THEN 325.75  -- Musanze Agricultural - Large river irrigation
            WHEN 'RWB-2024-000005' THEN 278.90  -- Mining Operations - Large groundwater area
            WHEN 'RWB-2024-000006' THEN 456.20  -- Municipal Water - Very large lake access
            WHEN 'RWB-2024-000007' THEN 125.40  -- Industrial Processing - Medium river access
            WHEN 'RWB-2024-000008' THEN 245.60  -- Rice Irrigation - Large groundwater area
            WHEN 'RWB-2024-000009' THEN 65.30   -- Hotel Complex - Medium borehole
            WHEN 'RWB-2024-000010' THEN 892.15  -- Hydroelectric - Massive surface water area
            WHEN 'RWB-2024-000011' THEN 38.75   -- Livestock - Small spring area
            WHEN 'RWB-2024-000012' THEN 356.80  -- Cassiterite Mining - Large groundwater
            WHEN 'RWB-2024-000013' THEN 524.95  -- Lake Kivu Industrial - Very large lake access
            WHEN 'RWB-2024-000014' THEN 8.90    -- Community Water - Very small borehole
            WHEN 'RWB-2024-000015' THEN 22.45   -- Fish Farming - Small spring
            ELSE ROUND((RANDOM() * 100 + 10)::numeric, 2)
        END,
    surface_area_unit = 'hectares'
WHERE application_number LIKE 'RWB-2024-%';

-- Create permits for approved applications with complete usage data
INSERT INTO permits (
    application_id,
    permit_number,
    status,
    water_source,
    purpose,
    water_allowance,
    allowance_unit,
    issuing_authority,
    issued_date,
    expiry_date,
    water_body_surface_area,
    surface_area_unit,
    monitoring_frequency,
    reporting_requirements
)
SELECT 
    a.id,
    CASE 
        WHEN a.application_number = 'RWB-2024-000001' THEN 'WP-2024-001'
        WHEN a.application_number = 'RWB-2024-000004' THEN 'WP-2024-004' 
        WHEN a.application_number = 'RWB-2024-000006' THEN 'WP-2024-006'
        WHEN a.application_number = 'RWB-2024-000008' THEN 'WP-2024-008'
        WHEN a.application_number = 'RWB-2024-000010' THEN 'WP-2024-010'
        WHEN a.application_number = 'RWB-2024-000012' THEN 'WP-2024-012'
        WHEN a.application_number = 'RWB-2024-000014' THEN 'WP-2024-014'
    END as permit_number,
    'active'::permit_status as status,
    a.water_source,
    a.water_purpose,
    a.estimated_usage_volume,
    a.usage_unit,
    'Rwanda Water Resources Board',
    CURRENT_DATE - INTERVAL '30 days' as issued_date,
    CURRENT_DATE + INTERVAL '5 years' as expiry_date,
    a.water_body_surface_area,
    a.surface_area_unit,
    CASE 
        WHEN a.estimated_usage_volume >= 30000 THEN 'Monthly'
        WHEN a.estimated_usage_volume >= 10000 THEN 'Quarterly' 
        ELSE 'Annually'
    END as monitoring_frequency,
    'Submit water usage reports and quality testing results as per monitoring schedule'
FROM applications a 
WHERE a.application_number IN (
    'RWB-2024-000001', -- Kigali Industrial Water Supply
    'RWB-2024-000004', -- Musanze Agricultural Irrigation  
    'RWB-2024-000006', -- Huye Municipal Water Expansion
    'RWB-2024-000008', -- Eastern Province Rice Irrigation
    'RWB-2024-000010', -- Rusizi Hydroelectric Plant
    'RWB-2024-000012', -- Cassiterite Mining Operations
    'RWB-2024-000014'  -- Rural Community Water Point
)
AND NOT EXISTS (
    SELECT 1 FROM permits p WHERE p.application_id = a.id
);

-- Additional high-usage permits for better visualization
INSERT INTO permits (
    application_id,
    permit_number,
    status,
    water_source,
    purpose,
    water_allowance,
    allowance_unit,
    issuing_authority,
    issued_date,
    expiry_date,
    water_body_surface_area,
    surface_area_unit,
    monitoring_frequency,
    reporting_requirements
)
VALUES 
(
    (SELECT id FROM applications WHERE application_number = 'RWB-2024-000013' LIMIT 1),
    'WP-2024-013',
    'active',
    'lake',
    'industrial',
    28000.00,
    'm³/month',
    'Rwanda Water Resources Board',
    CURRENT_DATE - INTERVAL '45 days',
    CURRENT_DATE + INTERVAL '5 years',
    524.95,
    'hectares',
    'Monthly',
    'Submit monthly water usage reports and quarterly quality testing results'
);

-- Create some permits with varying usage intensities for the same water body
-- (Multiple permits using the same lake/river but different usage amounts)

-- Lake Kivu multiple users
INSERT INTO applications (
    applicant_id,
    application_number,
    status,
    application_type,
    water_source,
    water_purpose,
    estimated_usage_volume,
    usage_unit,
    province,
    district,
    sector,
    cell,
    coordinates,
    project_title,
    project_description,
    water_body_surface_area,
    surface_area_unit,
    created_at,
    submitted_at
) VALUES 
-- Lake Kivu Users (Same general area, different usage)
(
    '550e8400-e29b-41d4-a716-446655440001',
    'RWB-2024-000016',
    'approved',
    'industrial',
    'lake',
    'industrial',
    45000.00,
    'm³/month',
    'Western',
    'Rubavu',
    'Gisenyi',
    'Rwankuba',
    ST_SetSRID(ST_MakePoint(29.2300, -1.6980), 4326), -- Slightly different location
    'Lake Kivu Textile Manufacturing',
    'Textile manufacturing facility using Lake Kivu water',
    524.95, -- Same lake, same surface area
    'hectares',
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '145 days'
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    'RWB-2024-000017',
    'approved',
    'commercial',
    'lake',
    'commercial',
    8500.00,
    'm³/month',
    'Western',
    'Rubavu',
    'Gisenyi',
    'Rwankuba',
    ST_SetSRID(ST_MakePoint(29.2350, -1.7020), 4326), -- Slightly different location
    'Lake Kivu Resort Complex',
    'Tourist resort and conference center',
    524.95, -- Same lake, same surface area
    'hectares',
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '115 days'
),

-- Nyabarongo River multiple users
(
    '550e8400-e29b-41d4-a716-446655440003',
    'RWB-2024-000018',
    'approved',
    'agricultural',
    'river',
    'irrigation',
    22000.00,
    'm³/month',
    'Southern',
    'Muhanga',
    'Muhanga',
    'Cyeza',
    ST_SetSRID(ST_MakePoint(29.7600, -2.0800), 4326),
    'Nyabarongo Valley Irrigation',
    'Large scale vegetable farming irrigation',
    185.40, -- Nyabarongo river surface area
    'hectares',
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '85 days'
),
(
    '550e8400-e29b-41d4-a716-446655440004',
    'RWB-2024-000019',
    'approved',
    'industrial',
    'river',
    'industrial',
    32000.00,
    'm³/month',
    'Southern',
    'Muhanga',
    'Shyogwe',
    'Shyogwe',
    ST_SetSRID(ST_MakePoint(29.7650, -2.0750), 4326),
    'Nyabarongo Food Processing',
    'Food processing and packaging facility',
    185.40, -- Same river, same surface area
    'hectares',
    NOW() - INTERVAL '85 days',
    NOW() - INTERVAL '80 days'
);

-- Create permits for the new applications
INSERT INTO permits (
    application_id,
    permit_number,
    status,
    water_source,
    purpose,
    water_allowance,
    allowance_unit,
    issuing_authority,
    issued_date,
    expiry_date,
    water_body_surface_area,
    surface_area_unit,
    monitoring_frequency,
    reporting_requirements
)
SELECT 
    a.id,
    CASE 
        WHEN a.application_number = 'RWB-2024-000016' THEN 'WP-2024-016'
        WHEN a.application_number = 'RWB-2024-000017' THEN 'WP-2024-017'
        WHEN a.application_number = 'RWB-2024-000018' THEN 'WP-2024-018'
        WHEN a.application_number = 'RWB-2024-000019' THEN 'WP-2024-019'
    END as permit_number,
    'active'::permit_status as status,
    a.water_source,
    a.water_purpose,
    a.estimated_usage_volume,
    a.usage_unit,
    'Rwanda Water Resources Board',
    CURRENT_DATE - INTERVAL '60 days' as issued_date,
    CURRENT_DATE + INTERVAL '5 years' as expiry_date,
    a.water_body_surface_area,
    a.surface_area_unit,
    CASE 
        WHEN a.estimated_usage_volume >= 30000 THEN 'Monthly'
        WHEN a.estimated_usage_volume >= 10000 THEN 'Quarterly' 
        ELSE 'Annually'
    END as monitoring_frequency,
    'Submit water usage reports and quality testing results as per monitoring schedule'
FROM applications a 
WHERE a.application_number IN ('RWB-2024-000016', 'RWB-2024-000017', 'RWB-2024-000018', 'RWB-2024-000019');

-- Summary query to show permit data for map visualization
SELECT 
    p.permit_number,
    a.project_title,
    a.province,
    a.district,
    p.water_allowance as usage_amount,
    p.allowance_unit,
    p.water_body_surface_area,
    p.surface_area_unit,
    ST_X(a.coordinates) as longitude,
    ST_Y(a.coordinates) as latitude,
    p.status,
    p.water_source,
    p.purpose
FROM permits p
JOIN applications a ON p.application_id = a.id
WHERE p.status = 'active'
ORDER BY p.water_allowance DESC; 