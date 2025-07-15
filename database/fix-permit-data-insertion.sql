-- =============================================
-- Fix Permit Data Insertion - Check Existing Applications
-- =============================================

-- First, let's see what applications actually exist
SELECT application_number, id, status, project_title 
FROM applications 
WHERE application_number LIKE 'RWB-2024-%'
ORDER BY application_number;

-- Check if the surface area columns exist and add them if needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'water_body_surface_area') THEN
        ALTER TABLE applications ADD COLUMN water_body_surface_area DECIMAL(10,2);
        ALTER TABLE applications ADD COLUMN surface_area_unit VARCHAR(20) DEFAULT 'hectares';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'water_body_surface_area') THEN
        ALTER TABLE permits ADD COLUMN water_body_surface_area DECIMAL(10,2);
        ALTER TABLE permits ADD COLUMN surface_area_unit VARCHAR(20) DEFAULT 'hectares';
    END IF;
END $$;

-- Update applications with surface area data
UPDATE applications 
SET 
    water_body_surface_area = 
        CASE 
            WHEN estimated_usage_volume >= 50000 THEN ROUND((RANDOM() * 500 + 100)::numeric, 2)
            WHEN estimated_usage_volume >= 20000 THEN ROUND((RANDOM() * 200 + 50)::numeric, 2)
            WHEN estimated_usage_volume >= 5000 THEN ROUND((RANDOM() * 80 + 20)::numeric, 2)
            ELSE ROUND((RANDOM() * 30 + 5)::numeric, 2)
        END,
    surface_area_unit = 'hectares'
WHERE water_body_surface_area IS NULL 
  AND estimated_usage_volume IS NOT NULL;

-- Only create permits for applications that actually exist and are approved
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
    'WP-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(ROW_NUMBER() OVER (ORDER BY a.created_at)::TEXT, 3, '0') as permit_number,
    'active'::permit_status as status,
    a.water_source,
    a.water_purpose,
    a.estimated_usage_volume,
    a.usage_unit,
    'Rwanda Water Board',
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
WHERE a.status = 'approved'
  AND a.coordinates IS NOT NULL
  AND a.estimated_usage_volume IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM permits p WHERE p.application_id = a.id
  );

-- Create additional permits if we need more test data and applications exist
DO $$
DECLARE
    app_count INTEGER;
BEGIN
    -- Check how many applications we have
    SELECT COUNT(*) INTO app_count 
    FROM applications 
    WHERE coordinates IS NOT NULL AND estimated_usage_volume IS NOT NULL;
    
    -- If we don't have enough test applications, create some
    IF app_count < 10 THEN
        -- Create additional test applications
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
        -- Only add if user exists
        ((SELECT id FROM users LIMIT 1),
         'RWB-2025-001',
         'approved',
         'industrial',
         'lake',
         'industrial',
         35000.00,
         'm³/month',
         'Western',
         'Rubavu',
         'Gisenyi',
         'Rwankuba',
         ST_SetSRID(ST_MakePoint(29.2300, -1.6980), 4326),
         'Lake Kivu Industrial Complex',
         'Large industrial facility using Lake Kivu water',
         524.95,
         'hectares',
         NOW() - INTERVAL '90 days',
         NOW() - INTERVAL '85 days'),
        
        ((SELECT id FROM users LIMIT 1),
         'RWB-2025-002',
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
         'Large scale agricultural irrigation project',
         185.40,
         'hectares',
         NOW() - INTERVAL '75 days',
         NOW() - INTERVAL '70 days'),
        
        ((SELECT id FROM users LIMIT 1),
         'RWB-2025-003',
         'approved',
         'municipal',
         'lake',
         'municipal_supply',
         45000.00,
         'm³/month',
         'Northern',
         'Musanze',
         'Muhoza',
         'Cyuve',
         ST_SetSRID(ST_MakePoint(29.6357, -1.4996), 4326),
         'Musanze Municipal Water Expansion',
         'Municipal water supply expansion for growing population',
         325.75,
         'hectares',
         NOW() - INTERVAL '120 days',
         NOW() - INTERVAL '115 days');
         
        -- Create permits for these new applications
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
            'WP-2025-' || LPAD(ROW_NUMBER() OVER (ORDER BY a.created_at)::TEXT, 3, '0') as permit_number,
            'active'::permit_status,
            a.water_source,
            a.water_purpose,
            a.estimated_usage_volume,
            a.usage_unit,
            'Rwanda Water Board',
            CURRENT_DATE - INTERVAL '60 days',
            CURRENT_DATE + INTERVAL '5 years',
            a.water_body_surface_area,
            a.surface_area_unit,
            'Monthly',
            'Submit monthly water usage and quality reports'
        FROM applications a 
        WHERE a.application_number IN ('RWB-2025-001', 'RWB-2025-002', 'RWB-2025-003');
    END IF;
END $$;

-- Final verification query
SELECT 
    p.permit_number,
    a.application_number,
    a.project_title,
    a.province,
    p.water_allowance,
    p.water_body_surface_area,
    ST_X(a.coordinates) as longitude,
    ST_Y(a.coordinates) as latitude
FROM permits p
JOIN applications a ON p.application_id = a.id
WHERE p.status = 'active'
ORDER BY p.water_allowance DESC; 