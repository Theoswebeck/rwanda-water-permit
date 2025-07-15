-- =============================================
-- Test Data for Rwanda Water Concession Map
-- Geographic locations across Rwanda with realistic water usage
-- =============================================

-- Insert test applications with Rwanda coordinates
-- Format: ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)

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
    created_at,
    submitted_at
) VALUES 
-- Kigali Province Applications
(
    '550e8400-e29b-41d4-a716-446655440001',
    'RWB-2024-000001',
    'approved',
    'industrial',
    'borehole',
    'industrial',
    15000.00,
    'm³/month',
    'Kigali',
    'Gasabo',
    'Kacyiru',
    'Kamatamu',
    ST_SetSRID(ST_MakePoint(30.0619, -1.9441), 4326),
    'Kigali Industrial Water Supply',
    'Large scale industrial water extraction for manufacturing plant',
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '85 days'
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    'RWB-2024-000002',
    'under_review',
    'commercial',
    'surface_water',
    'commercial',
    8500.00,
    'm³/month',
    'Kigali',
    'Nyarugenge',
    'Nyarugenge',
    'Rwampara',
    ST_SetSRID(ST_MakePoint(30.0588, -1.9596), 4326),
    'Commercial Complex Water Access',
    'Water supply for large commercial complex in Kigali CBD',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '40 days'
),
(
    '550e8400-e29b-41d4-a716-446655440003',
    'RWB-2024-000003',
    'pending_inspection',
    'domestic',
    'borehole',
    'domestic',
    450.00,
    'm³/month',
    'Kigali',
    'Kicukiro',
    'Niboye',
    'Kabuga',
    ST_SetSRID(ST_MakePoint(30.1044, -1.9706), 4326),
    'Residential Compound Water Supply',
    'Private borehole for residential compound',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '25 days'
),

-- Northern Province Applications
(
    '550e8400-e29b-41d4-a716-446655440004',
    'RWB-2024-000004',
    'approved',
    'agricultural',
    'river',
    'irrigation',
    25000.00,
    'm³/month',
    'Northern',
    'Musanze',
    'Muhoza',
    'Cyuve',
    ST_SetSRID(ST_MakePoint(29.6357, -1.4996), 4326),
    'Musanze Agricultural Irrigation',
    'Large scale irrigation project for potato farming',
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '115 days'
),
(
    '550e8400-e29b-41d4-a716-446655440005',
    'RWB-2024-000005',
    'under_review',
    'mining_water_use',
    'groundwater',
    'mining',
    35000.00,
    'm³/month',
    'Northern',
    'Rulindo',
    'Shyorongi',
    'Gishuro',
    ST_SetSRID(ST_MakePoint(30.0625, -1.7167), 4326),
    'Mining Operations Water Extraction',
    'Water supply for mineral extraction operations',
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '55 days'
),

-- Southern Province Applications
(
    '550e8400-e29b-41d4-a716-446655440006',
    'RWB-2024-000006',
    'approved',
    'municipal',
    'lake',
    'municipal_supply',
    50000.00,
    'm³/month',
    'Southern',
    'Huye',
    'Tumba',
    'Cyarwa',
    ST_SetSRID(ST_MakePoint(29.7395, -2.5975), 4326),
    'Huye Municipal Water Expansion',
    'Municipal water supply expansion project',
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '145 days'
),
(
    '550e8400-e29b-41d4-a716-446655440007',
    'RWB-2024-000007',
    'rejected',
    'industrial',
    'river',
    'industrial',
    12000.00,
    'm³/month',
    'Southern',
    'Muhanga',
    'Muhanga',
    'Cyeza',
    ST_SetSRID(ST_MakePoint(29.7667, -2.0833), 4326),
    'Industrial Processing Plant Water',
    'Water extraction for food processing facility',
    NOW() - INTERVAL '75 days',
    NOW() - INTERVAL '70 days'
),

-- Eastern Province Applications
(
    '550e8400-e29b-41d4-a716-446655440008',
    'RWB-2024-000008',
    'approved',
    'agricultural',
    'groundwater',
    'irrigation',
    18000.00,
    'm³/month',
    'Eastern',
    'Nyagatare',
    'Karangazi',
    'Karangazi',
    ST_SetSRID(ST_MakePoint(30.3167, -1.3000), 4326),
    'Eastern Province Rice Irrigation',
    'Large scale rice farming irrigation system',
    NOW() - INTERVAL '100 days',
    NOW() - INTERVAL '95 days'
),
(
    '550e8400-e29b-41d4-a716-446655440009',
    'RWB-2024-000009',
    'under_review',
    'commercial',
    'borehole',
    'commercial',
    6500.00,
    'm³/month',
    'Eastern',
    'Rwamagana',
    'Rwamagana',
    'Nyagahinga',
    ST_SetSRID(ST_MakePoint(30.4347, -1.9487), 4326),
    'Commercial Hotel Complex',
    'Water supply for large hotel and conference center',
    NOW() - INTERVAL '35 days',
    NOW() - INTERVAL '30 days'
),

-- Western Province Applications
(
    '550e8400-e29b-41d4-a716-446655440010',
    'RWB-2024-000010',
    'approved',
    'industrial',
    'surface_water',
    'electricity_generation',
    75000.00,
    'm³/month',
    'Western',
    'Rusizi',
    'Kamembe',
    'Kagano',
    ST_SetSRID(ST_MakePoint(28.9078, -2.4628), 4326),
    'Rusizi Hydroelectric Plant',
    'Hydroelectric power generation facility',
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '175 days'
),
(
    '550e8400-e29b-41d4-a716-446655440011',
    'RWB-2024-000011',
    'pending_inspection',
    'agricultural',
    'spring',
    'livestock',
    3200.00,
    'm³/month',
    'Western',
    'Karongi',
    'Bwishyura',
    'Mubuga',
    ST_SetSRID(ST_MakePoint(29.2667, -2.0333), 4326),
    'Livestock Farming Water Supply',
    'Water access for cattle farming operations',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '15 days'
),

-- Additional High-Volume Applications
(
    '550e8400-e29b-41d4-a716-446655440012',
    'RWB-2024-000012',
    'approved',
    'mining_water_use',
    'groundwater',
    'mining',
    42000.00,
    'm³/month',
    'Eastern',
    'Gatsibo',
    'Rwimbogo',
    'Rwimbogo',
    ST_SetSRID(ST_MakePoint(30.5000, -1.6167), 4326),
    'Cassiterite Mining Operations',
    'Large scale mining water requirements',
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '195 days'
),
(
    '550e8400-e29b-41d4-a716-446655440013',
    'RWB-2024-000013',
    'under_review',
    'industrial',
    'lake',
    'industrial',
    28000.00,
    'm³/month',
    'Western',
    'Rubavu',
    'Gisenyi',
    'Rwankuba',
    ST_SetSRID(ST_MakePoint(29.2333, -1.7000), 4326),
    'Lake Kivu Industrial Complex',
    'Industrial facility using Lake Kivu water resources',
    NOW() - INTERVAL '50 days',
    NOW() - INTERVAL '45 days'
),

-- Small Scale Applications
(
    '550e8400-e29b-41d4-a716-446655440014',
    'RWB-2024-000014',
    'approved',
    'domestic',
    'borehole',
    'domestic',
    180.00,
    'm³/month',
    'Southern',
    'Nyanza',
    'Busasamana',
    'Cyahinda',
    ST_SetSRID(ST_MakePoint(29.7500, -2.3500), 4326),
    'Rural Community Water Point',
    'Community borehole for rural water access',
    NOW() - INTERVAL '40 days',
    NOW() - INTERVAL '35 days'
),
(
    '550e8400-e29b-41d4-a716-446655440015',
    'RWB-2024-000015',
    'pending_inspection',
    'commercial',
    'spring',
    'aquaculture',
    950.00,
    'm³/month',
    'Northern',
    'Gicumbi',
    'Byumba',
    'Bungwe',
    ST_SetSRID(ST_MakePoint(30.0667, -1.5833), 4326),
    'Fish Farming Project',
    'Aquaculture development using spring water',
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '20 days'
);

-- Update coordinates for any existing applications that don't have them
UPDATE applications 
SET coordinates = ST_SetSRID(ST_MakePoint(30.0588, -1.9596), 4326)
WHERE coordinates IS NULL AND province = 'Kigali';

UPDATE applications 
SET coordinates = ST_SetSRID(ST_MakePoint(29.6357, -1.4996), 4326)
WHERE coordinates IS NULL AND province = 'Northern';

UPDATE applications 
SET coordinates = ST_SetSRID(ST_MakePoint(29.7395, -2.5975), 4326)
WHERE coordinates IS NULL AND province = 'Southern';

UPDATE applications 
SET coordinates = ST_SetSRID(ST_MakePoint(30.3167, -1.3000), 4326)
WHERE coordinates IS NULL AND province = 'Eastern';

UPDATE applications 
SET coordinates = ST_SetSRID(ST_MakePoint(28.9078, -2.4628), 4326)
WHERE coordinates IS NULL AND province = 'Western';

-- Summary query to verify data
SELECT 
    application_number,
    project_title,
    province,
    district,
    estimated_usage_volume,
    usage_unit,
    status,
    ST_X(coordinates) as longitude,
    ST_Y(coordinates) as latitude
FROM applications 
WHERE coordinates IS NOT NULL
ORDER BY estimated_usage_volume DESC; 