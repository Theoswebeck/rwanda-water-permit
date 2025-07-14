-- =============================================
-- Rwanda Water Board - Comprehensive Sample Data
-- Demonstrates All UX Branching Paths and New Fields
-- =============================================

-- Clear existing data (optional - for testing)
-- DELETE FROM applications WHERE application_number LIKE 'RWB-2025-%';
-- DELETE FROM users WHERE id IN (SELECT id FROM users WHERE email LIKE '%sample%');

-- =============================================
-- SAMPLE USERS WITH ENHANCED CONTACT INFO
-- =============================================

-- Individual Applicant - Domestic Use
INSERT INTO users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, mobile_phone, landline_phone, po_box,
    province, district, sector, cell, village, address, 
    profile_completed, created_at, updated_at
) VALUES (
    'f0000001-0001-0001-0001-000000000001', 
    'jean.baptiste@sample.com', 
    'Jean Baptiste', 
    'Mukamana', 
    'applicant', 
    'active', 
    'individual',
    '+250788111001',
    '+250788111001',
    '+250252555001',
    'P.O. Box 1234',
    'Kigali', 
    'Gasabo', 
    'Remera', 
    'Rukiri', 
    'Rukiri I',
    'KG 15 Ave, House No. 25, Remera, Kigali',
    true,
    '2024-12-01 10:00:00+00',
    '2024-12-01 10:00:00+00'
);

-- Company Applicant - Industrial Use
INSERT INTO users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, mobile_phone, landline_phone, po_box,
    company_name, company_tin, company_address, company_phone,
    incorporation_certificate_number,
    alternative_contact,
    province, district, sector, cell, address, 
    profile_completed, created_at, updated_at
) VALUES (
    'f0000002-0002-0002-0002-000000000002', 
    'contact@agrotech.rw', 
    null, 
    null, 
    'applicant', 
    'active', 
    'company',
    '+250788222002',
    '+250788222002',
    '+250252555002',
    'P.O. Box 5678',
    'AgroTech Industries Ltd',
    '123456789',
    'KN 7 Ave, Kigali Industrial Park',
    '+250252555002',
    'INC/2020/001234',
    '{"name": "Marie Claire Uwimana", "position": "Operations Manager", "phone": "+250788222003", "email": "marie.uwimana@agrotech.rw", "relationship": "employee"}',
    'Kigali', 
    'Gasabo', 
    'Kinyinya', 
    'Kinyinya', 
    'KN 7 Ave, Kigali Industrial Park, Kinyinya',
    true,
    '2024-12-01 11:00:00+00',
    '2024-12-01 11:00:00+00'
);

-- Cooperative Applicant - Agricultural Use
INSERT INTO users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, mobile_phone, landline_phone, po_box,
    company_name, company_tin, company_address, company_phone,
    incorporation_certificate_number,
    alternative_contact,
    province, district, sector, cell, village, address, 
    profile_completed, created_at, updated_at
) VALUES (
    'f0000003-0003-0003-0003-000000000003', 
    'info@farmerscoop.rw', 
    'Joseph', 
    'Nkurunziza', 
    'applicant', 
    'active', 
    'cooperative',
    '+250788333003',
    '+250788333003',
    '+250252555003',
    'P.O. Box 9876',
    'Ubwoba Farmers Cooperative',
    '987654321',
    'Huye District, Southern Province',
    '+250252555003',
    'COOP/2019/987654',
    '{"name": "Agnes Mukamana", "position": "Secretary", "phone": "+250788333004", "email": "agnes@farmerscoop.rw", "relationship": "member"}',
    'Southern', 
    'Huye', 
    'Tumba', 
    'Tumba', 
    'Tumba Sector',
    'Huye District, Tumba Sector, Southern Province',
    true,
    '2024-12-01 12:00:00+00',
    '2024-12-01 12:00:00+00'
);

-- Organization Applicant - Commercial Use
INSERT INTO users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, mobile_phone, landline_phone, po_box,
    company_name, company_tin, company_address, company_phone,
    incorporation_certificate_number,
    alternative_contact,
    province, district, sector, cell, village, address, 
    profile_completed, created_at, updated_at
) VALUES (
    'f0000004-0004-0004-0004-000000000004', 
    'manager@hospitality.rw', 
    'Robert', 
    'Habimana', 
    'applicant', 
    'active', 
    'organization',
    '+250788444004',
    '+250788444004',
    '+250252555004',
    'P.O. Box 4321',
    'Gorilla View Hotel & Resort',
    '456789123',
    'Musanze District, Northern Province',
    '+250252555004',
    'ORG/2021/456789',
    '{"name": "Sarah Mutesi", "position": "Hotel Manager", "phone": "+250788444005", "email": "sarah@hospitality.rw", "relationship": "manager"}',
    'Northern', 
    'Musanze', 
    'Kinigi', 
    'Kinigi', 
    'Kinigi Sector',
    'Musanze District, Kinigi Sector, Northern Province',
    true,
    '2024-12-01 13:00:00+00',
    '2024-12-01 13:00:00+00'
);

-- Institution Applicant - Municipal Use
INSERT INTO users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, mobile_phone, landline_phone, po_box,
    company_name, company_tin, company_address, company_phone,
    incorporation_certificate_number,
    alternative_contact,
    province, district, sector, cell, address, 
    profile_completed, created_at, updated_at
) VALUES (
    'f0000005-0005-0005-0005-000000000005', 
    'admin@kayonza.gov.rw', 
    'Emmanuel', 
    'Ntirenganya', 
    'applicant', 
    'active', 
    'institution',
    '+250788555005',
    '+250788555005',
    '+250252555005',
    'P.O. Box 7890',
    'Kayonza District Administration',
    '789123456',
    'Kayonza District, Eastern Province',
    '+250252555005',
    'INST/2020/789123',
    '{"name": "Grace Uwimana", "position": "District Engineer", "phone": "+250788555006", "email": "grace@kayonza.gov.rw", "relationship": "employee"}',
    'Eastern', 
    'Kayonza', 
    'Kayonza', 
    'Kayonza', 
    'Kayonza Sector',
    'Kayonza District, Kayonza Sector, Eastern Province',
    true,
    '2024-12-01 14:00:00+00',
    '2024-12-01 14:00:00+00'
);

-- =============================================
-- COMPREHENSIVE SAMPLE APPLICATIONS
-- =============================================

-- Application 1: Individual - Domestic Borehole
INSERT INTO applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    coordinates, location_description,
    project_title, project_description, project_value,
    water_taking_method, water_measuring_method, storage_facilities, return_flow_description,
    environmental_assessment, mitigation_actions,
    
    -- NEW FIELDS: Water Source Details
    water_body_name, tributary_name, catchment_name_level_1, catchment_name_level_2,
    water_reliability, natural_discharge_volume_m3,
    
    -- NEW FIELDS: Water Usage Breakdown
    max_daily_volume_m3, max_monthly_volume_m3, max_yearly_volume_m3, flow_rate_m3_per_second,
    abstraction_facilities_description, return_flow_location, return_flow_volume_m3,
    proposed_duration_months, proposed_duration_years, pumping_hours_per_day,
    
    -- NEW FIELDS: Project Details
    proposed_facilities_description, construction_type, concession_area, operational_overview,
    
    -- NEW FIELDS: Land Ownership
    owns_all_required_land, land_ownership_status, affected_landowners,
    easement_details, written_consent_details, lease_agreement_details, land_access_steps,
    
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'a0000001-0001-0001-0001-000000000001',
    'f0000001-0001-0001-0001-000000000001',
    'RWB-2025-000001',
    'submitted',
    'domestic',
    'borehole',
    'domestic',
    25.5,
    'm³/day',
    'Kigali',
    'Gasabo',
    'Remera',
    'Rukiri',
    'Rukiri I',
    ST_GeogFromText('POINT(30.0944 -1.9441)'),
    'Residential plot located 200m from main road, accessible by vehicle',
    'Domestic Water Supply for Family Residence',
    'Installation of borehole water supply system for a family of 8 members. The system will provide clean water for drinking, cooking, sanitation, and basic household needs. The borehole will be drilled to access groundwater aquifer at estimated depth of 60-80 meters.',
    8500000,
    'Mechanical drilling with rotary rig, submersible pump installation',
    'Digital flow meter with hourly data logging',
    'Overhead concrete tank 5000L with distribution network',
    'Greywater to soak pit, blackwater to septic tank',
    'Minimal environmental impact. Hydrogeological study shows adequate groundwater availability. No sensitive ecosystems nearby.',
    'Proper waste disposal, water conservation practices, regular maintenance schedule',
    
    -- Water Source Details
    'Nyabugogo Aquifer',
    null,
    'Nyabugogo River Basin',
    'Nyabugogo Sub-basin',
    'always_available',
    null,
    
    -- Water Usage Breakdown
    25.5,
    765.0,
    9315.0,
    0.0003,
    'Submersible pump (1HP), control panel, pressure tank, distribution pipes',
    'On-site sewage treatment system',
    5.0,
    0,
    25,
    8.0,
    
    -- Project Details
    'Borehole drilling, pump installation, overhead tank, piping network to house',
    'Reinforced concrete tank with steel frame',
    0.025,
    'Automated system with pressure sensors, daily operation 8 hours, minimal maintenance required',
    
    -- Land Ownership
    true,
    'own_all_land',
    null,
    null,
    null,
    null,
    'Land ownership confirmed with title deed',
    
    'on_time',
    '2025-01-15 10:00:00+00',
    '2024-12-27 09:15:00+00',
    '2024-12-27 09:15:00+00',
    '2024-12-27 09:15:00+00'
);

-- Application 2: Company - Industrial Surface Water
INSERT INTO applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    coordinates, location_description,
    project_title, project_description, project_value,
    water_taking_method, water_measuring_method, storage_facilities, return_flow_description,
    environmental_assessment, mitigation_actions,
    
    -- Industry-specific fields
    electricity_generation_capacity, mining_operations_type, water_diversion_details,
    infrastructure_pipes, infrastructure_pumps, infrastructure_valves, infrastructure_meters,
    
    -- NEW FIELDS: Water Source Details
    water_body_name, tributary_name, catchment_name_level_1, catchment_name_level_2,
    water_reliability, natural_discharge_volume_m3,
    
    -- NEW FIELDS: Water Usage Breakdown
    max_daily_volume_m3, max_monthly_volume_m3, max_yearly_volume_m3, flow_rate_m3_per_second,
    abstraction_facilities_description, return_flow_location, return_flow_volume_m3,
    proposed_duration_months, proposed_duration_years, pumping_hours_per_day,
    
    -- NEW FIELDS: Project Details
    proposed_facilities_description, construction_type, concession_area, operational_overview,
    
    -- NEW FIELDS: Land Ownership
    owns_all_required_land, land_ownership_status, affected_landowners,
    easement_details, written_consent_details, lease_agreement_details, land_access_steps,
    
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'a0000002-0002-0002-0002-000000000002',
    'f0000002-0002-0002-0002-000000000002',
    'RWB-2025-000002',
    'submitted',
    'industrial',
    'surface_water',
    'industrial',
    1200.0,
    'm³/day',
    'Kigali',
    'Gasabo',
    'Kinyinya',
    'Kinyinya',
    null,
    ST_GeogFromText('POINT(30.1234 -1.9876)'),
    'Industrial zone, 500m from Nyabugogo River, accessible by heavy trucks',
    'Food Processing Plant Water Supply System',
    'Large-scale water extraction from Nyabugogo River for food processing facility. The plant will process maize, beans, and other agricultural products for local and export markets. Water will be used for cleaning, processing, steam generation, and cooling systems.',
    125000000,
    'River intake with screening system, centrifugal pumps',
    'Electromagnetic flow meter with SCADA integration',
    'Concrete reservoirs 5000m³ total, treatment plant, distribution network',
    'Treated industrial wastewater discharged to municipal treatment plant after secondary treatment',
    'Comprehensive EIA completed. River flow assessment confirms sustainable extraction levels. Treatment plant meets all discharge standards.',
    'Water recycling system (40% reuse), effluent treatment, river flow monitoring, community benefit programs',
    
    -- Industry-specific fields
    null,
    null,
    'River diversion weir, intake channel, fish ladder, sediment trap',
    'HDPE pipes DN300-DN600, stainless steel in processing areas',
    'Centrifugal pumps 3x150kW, standby pump, variable frequency drives',
    'Butterfly valves, check valves, pressure reducing valves',
    'Electromagnetic flow meters, pressure sensors, level indicators',
    
    -- Water Source Details
    'Nyabugogo River',
    'Nyabugogo Main',
    'Nyabugogo River Basin',
    'Upper Nyabugogo',
    'always_available',
    8640.0,
    
    -- Water Usage Breakdown
    1200.0,
    36000.0,
    438000.0,
    0.0139,
    'Intake structure, pump station, treatment plant, storage tanks',
    'Nyabugogo River downstream after treatment',
    960.0,
    0,
    20,
    16.0,
    
    -- Project Details
    'Intake structure, pump station, water treatment plant, storage reservoirs, distribution network',
    'Reinforced concrete structures, steel storage tanks',
    2.5,
    'Continuous operation 16 hours/day, automated control system, real-time monitoring',
    
    -- Land Ownership
    false,
    'written_consent',
    '[{"name": "Kayonza Farmers Cooperative", "contact": "+250788777001", "land_size": "0.5 hectares", "purpose": "intake structure"}]',
    null,
    'Written consent obtained from upstream landowners for intake construction',
    null,
    'Legal agreements signed with affected landowners, compensation provided',
    
    'on_time',
    '2025-01-20 10:00:00+00',
    '2024-12-27 10:30:00+00',
    '2024-12-27 10:30:00+00',
    '2024-12-27 10:30:00+00'
);

-- Application 3: Cooperative - Agricultural River Irrigation
INSERT INTO applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    coordinates, location_description,
    project_title, project_description, project_value,
    water_taking_method, water_measuring_method, storage_facilities, return_flow_description,
    environmental_assessment, mitigation_actions,
    
    -- NEW FIELDS: Water Source Details
    water_body_name, tributary_name, catchment_name_level_1, catchment_name_level_2,
    water_reliability, natural_discharge_volume_m3,
    
    -- NEW FIELDS: Water Usage Breakdown
    max_daily_volume_m3, max_monthly_volume_m3, max_yearly_volume_m3, flow_rate_m3_per_second,
    abstraction_facilities_description, return_flow_location, return_flow_volume_m3,
    proposed_duration_months, proposed_duration_years, pumping_hours_per_day,
    
    -- NEW FIELDS: Project Details
    proposed_facilities_description, construction_type, concession_area, operational_overview,
    
    -- NEW FIELDS: Land Ownership
    owns_all_required_land, land_ownership_status, affected_landowners,
    easement_details, written_consent_details, lease_agreement_details, land_access_steps,
    
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'a0000003-0003-0003-0003-000000000003',
    'f0000003-0003-0003-0003-000000000003',
    'RWB-2025-000003',
    'submitted',
    'agricultural',
    'river',
    'irrigation',
    2500.0,
    'm³/day',
    'Southern',
    'Huye',
    'Tumba',
    'Tumba',
    'Tumba Sector',
    ST_GeogFromText('POINT(29.7123 -2.6543)'),
    'Agricultural valley, 100m from Akanyaru River, fertile alluvial soils',
    'Cooperative Rice Irrigation System - Phase 1',
    'Modern irrigation system for 150-hectare rice cultivation project. The system will serve 120 farmer families organized in cooperative structure. Water will be used for paddy irrigation, fish farming, and value-added processing activities.',
    85000000,
    'Pumping station with intake channel, pressurized distribution network',
    'Mechanical propeller meters at major distribution points',
    'Concrete-lined channels, storage pond 15000m³, distribution gates',
    'Irrigation return flow to downstream wetlands and fish ponds',
    'Detailed environmental assessment completed. Wetland impact study shows minimal effect on downstream ecosystems. Fish migration measures included.',
    'Efficient irrigation scheduling, fish ladders, buffer zones, community water management training',
    
    -- Water Source Details
    'Akanyaru River',
    'Akanyaru Main Branch',
    'Akanyaru River Basin',
    'Middle Akanyaru',
    'seasonal_dry',
    2160.0,
    
    -- Water Usage Breakdown
    2500.0,
    75000.0,
    600000.0,
    0.0289,
    'Pumping station, intake channel, distribution network, control structures',
    'Downstream wetlands and fish ponds',
    1500.0,
    0,
    5,
    10.0,
    
    -- Project Details
    'Intake structure, pumping station, main canal, secondary canals, field channels, control gates',
    'Reinforced concrete channels, steel gates, HDPE pipes',
    150.0,
    'Seasonal operation during dry season, gravity flow when possible, community-managed',
    
    -- Land Ownership
    false,
    'lease_agreement',
    '[{"name": "Tumba Sector Administration", "contact": "+250788888001", "land_size": "2 hectares", "purpose": "pumping station and main canal"}, {"name": "Local Community", "contact": "+250788888002", "land_size": "5 hectares", "purpose": "canal right-of-way"}]',
    null,
    null,
    'Long-term lease agreement with local administration for infrastructure',
    'Community consultations completed, compensation plan approved, lease agreements signed',
    
    'on_time',
    '2025-01-25 10:00:00+00',
    '2024-12-27 11:45:00+00',
    '2024-12-27 11:45:00+00',
    '2024-12-27 11:45:00+00'
);

-- Application 4: Organization - Commercial Spring Water
INSERT INTO applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    coordinates, location_description,
    project_title, project_description, project_value,
    water_taking_method, water_measuring_method, storage_facilities, return_flow_description,
    environmental_assessment, mitigation_actions,
    
    -- NEW FIELDS: Water Source Details
    water_body_name, tributary_name, catchment_name_level_1, catchment_name_level_2,
    water_reliability, natural_discharge_volume_m3,
    
    -- NEW FIELDS: Water Usage Breakdown
    max_daily_volume_m3, max_monthly_volume_m3, max_yearly_volume_m3, flow_rate_m3_per_second,
    abstraction_facilities_description, return_flow_location, return_flow_volume_m3,
    proposed_duration_months, proposed_duration_years, pumping_hours_per_day,
    
    -- NEW FIELDS: Project Details
    proposed_facilities_description, construction_type, concession_area, operational_overview,
    
    -- NEW FIELDS: Land Ownership
    owns_all_required_land, land_ownership_status, affected_landowners,
    easement_details, written_consent_details, lease_agreement_details, land_access_steps,
    
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'a0000004-0004-0004-0004-000000000004',
    'f0000004-0004-0004-0004-000000000004',
    'RWB-2025-000004',
    'submitted',
    'commercial',
    'spring',
    'commercial',
    180.0,
    'm³/day',
    'Northern',
    'Musanze',
    'Kinigi',
    'Kinigi',
    'Kinigi Sector',
    ST_GeogFromText('POINT(29.5678 -1.4321)'),
    'Mountain slope location, 1800m elevation, natural spring source, forest environment',
    'Eco-Tourism Hotel Water Supply from Natural Spring',
    'Sustainable water supply system for 120-bed eco-tourism hotel complex. The facility will cater to gorilla trekking tourists with emphasis on environmental sustainability. Water will be used for guest rooms, restaurant, spa, and landscaping.',
    45000000,
    'Gravity-fed spring capture system with minimal environmental impact',
    'Mechanical flow meter with daily readings',
    'Gravity storage tanks 500m³, backup generators, pressure boosters',
    'Treated greywater for landscaping, blackwater to constructed wetlands',
    'Comprehensive environmental management plan developed. Spring flow monitoring for 2 years shows consistent yield. Minimal ecosystem disturbance.',
    'Spring protection measures, reforestation, water conservation systems, guest education programs',
    
    -- Water Source Details
    'Kinigi Natural Spring',
    'Volcanoes National Park watershed',
    'Nyiragongo River Basin',
    'Volcanoes Watershed',
    'always_available',
    432.0,
    
    -- Water Usage Breakdown
    180.0,
    5400.0,
    65700.0,
    0.0021,
    'Spring capture chamber, gravity distribution, storage tanks',
    'Constructed wetlands for treatment',
    120.0,
    0,
    10,
    0.0,
    
    -- Project Details
    'Spring capture structure, gravity pipeline, storage tanks, distribution network, treatment systems',
    'Natural stone and concrete construction, stainless steel tanks',
    1.0,
    'Gravity-fed system, minimal pumping, continuous operation, eco-friendly design',
    
    -- Land Ownership
    false,
    'recorded_easement',
    '[{"name": "Rwanda Development Board", "contact": "+250788999001", "land_size": "0.2 hectares", "purpose": "spring capture within park buffer zone"}]',
    'Recorded easement agreement with RDB for spring access and pipeline right-of-way',
    null,
    null,
    'Formal easement registration with land registry, environmental compliance certificate',
    
    'on_time',
    '2025-01-30 10:00:00+00',
    '2024-12-27 13:20:00+00',
    '2024-12-27 13:20:00+00',
    '2024-12-27 13:20:00+00'
);

-- Application 5: Institution - Municipal Dam Water
INSERT INTO applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    coordinates, location_description,
    project_title, project_description, project_value,
    water_taking_method, water_measuring_method, storage_facilities, return_flow_description,
    environmental_assessment, mitigation_actions,
    
    -- NEW FIELDS: Water Source Details
    water_body_name, tributary_name, catchment_name_level_1, catchment_name_level_2,
    water_reliability, natural_discharge_volume_m3,
    
    -- NEW FIELDS: Water Usage Breakdown
    max_daily_volume_m3, max_monthly_volume_m3, max_yearly_volume_m3, flow_rate_m3_per_second,
    abstraction_facilities_description, return_flow_location, return_flow_volume_m3,
    proposed_duration_months, proposed_duration_years, pumping_hours_per_day,
    
    -- NEW FIELDS: Project Details
    proposed_facilities_description, construction_type, concession_area, operational_overview,
    
    -- NEW FIELDS: Land Ownership
    owns_all_required_land, land_ownership_status, affected_landowners,
    easement_details, written_consent_details, lease_agreement_details, land_access_steps,
    
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'a0000005-0005-0005-0005-000000000005',
    'f0000005-0005-0005-0005-000000000005',
    'RWB-2025-000005',
    'submitted',
    'municipal',
    'dam',
    'municipal_supply',
    5000.0,
    'm³/day',
    'Eastern',
    'Kayonza',
    'Kayonza',
    'Kayonza',
    'Kayonza Sector',
    ST_GeogFromText('POINT(30.4567 -1.7890)'),
    'Kayonza Dam reservoir, 25km from town center, accessible by main road',
    'Kayonza Municipal Water Supply Expansion Project',
    'Expansion of municipal water supply system to serve additional 15,000 residents in Kayonza town. The project involves upgrading intake facilities at Kayonza Dam, expanding treatment capacity, and extending distribution network to new residential areas.',
    180000000,
    'Intake tower with multi-level withdrawal, high-capacity pumps',
    'Ultrasonic flow meters with telemetry system',
    'Raw water storage, water treatment plant, clear water reservoir 10000m³',
    'Treated effluent from water treatment plant returned to river downstream',
    'Environmental impact assessment completed. Dam water quality meets treatment standards. Aquatic ecosystem impact minimal with proper operation.',
    'Water quality monitoring, aquatic life protection, sustainable withdrawal rates, community water conservation programs',
    
    -- Water Source Details
    'Kayonza Dam',
    'Akagera River',
    'Akagera River Basin',
    'Upper Akagera',
    'always_available',
    172800.0,
    
    -- Water Usage Breakdown
    5000.0,
    150000.0,
    1825000.0,
    0.0579,
    'Intake tower, pump station, treatment plant, distribution network',
    'Akagera River downstream of dam',
    500.0,
    0,
    25,
    20.0,
    
    -- Project Details
    'Intake upgrade, pump station expansion, treatment plant upgrade, distribution network extension',
    'Reinforced concrete structures, steel pipelines, automated control systems',
    5.0,
    'Continuous operation 20 hours/day, automated control, remote monitoring, emergency backup systems',
    
    -- Land Ownership
    true,
    'own_all_land',
    null,
    null,
    null,
    null,
    'All infrastructure on public land owned by district administration',
    
    'on_time',
    '2025-02-05 10:00:00+00',
    '2024-12-27 14:50:00+00',
    '2024-12-27 14:50:00+00',
    '2024-12-27 14:50:00+00'
);

-- =============================================
-- UPDATE USER ACTIVITY COUNTS
-- =============================================

UPDATE users SET applications_count = (
    SELECT COUNT(*) FROM applications WHERE applicant_id = users.id
);

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Comprehensive sample data created successfully!';
    RAISE NOTICE '📊 Created 5 users with different account types';
    RAISE NOTICE '📋 Created 5 applications with complete field data';
    RAISE NOTICE '🏢 Application types: domestic, industrial, agricultural, commercial, municipal';
    RAISE NOTICE '💧 Water sources: borehole, surface_water, river, spring, dam';
    RAISE NOTICE '🎯 All applications have "submitted" status';
    RAISE NOTICE '🌟 All new schema fields populated with realistic data';
END $$; 