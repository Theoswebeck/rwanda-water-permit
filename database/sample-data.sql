-- Sample data for testing the Rwanda Water Resources Board system
-- This includes applications in different review stages

-- First, let's add some sample users
INSERT INTO public.users (id, email, first_name, last_name, role, status, account_type, phone, province, district, sector, cell, address, profile_completed) VALUES
('11111111-1111-1111-1111-111111111111', 'jane.doe@example.com', 'Jane', 'Doe', 'applicant', 'active', 'individual', '+250788123456', 'Kigali', 'Gasabo', 'Remera', 'Rukiri', 'KG 15 Ave, Kigali, Rwanda', true),
('22222222-2222-2222-2222-222222222222', 'abc.company@example.com', null, null, 'applicant', 'active', 'company', '+250788234567', 'Kigali', 'Gasabo', 'Kimihurura', 'Kimihurura', 'KN 3 Ave, Kigali, Rwanda', true),
('33333333-3333-3333-3333-333333333333', 'peter.jones@example.com', 'Peter', 'Jones', 'applicant', 'active', 'individual', '+250788345678', 'Southern', 'Huye', 'Tumba', 'Tumba', 'Huye District, Southern Province', true),
('44444444-4444-4444-4444-444444444444', 'john.smith@example.com', 'John', 'Smith', 'applicant', 'active', 'individual', '+250788456789', 'Northern', 'Musanze', 'Kinigi', 'Kinigi', 'Musanze District, Northern Province', true),
('55555555-5555-5555-5555-555555555555', 'tech.solutions@example.com', null, null, 'applicant', 'active', 'company', '+250788567890', 'Eastern', 'Kayonza', 'Kayonza', 'Kayonza', 'Kayonza District, Eastern Province', true),
('66666666-6666-6666-6666-666666666666', 'reviewer1@rwb.rw', 'Sarah', 'Johnson', 'reviewer', 'active', 'individual', '+250788678901', 'Kigali', 'Kicukiro', 'Kicukiro', 'Kicukiro', 'RWB Headquarters', true),
('77777777-7777-7777-7777-777777777777', 'inspector1@rwb.rw', 'Michael', 'Brown', 'inspector', 'active', 'individual', '+250788789012', 'Kigali', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'RWB Field Office', true)
ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    account_type = EXCLUDED.account_type,
    phone = EXCLUDED.phone,
    province = EXCLUDED.province,
    district = EXCLUDED.district,
    sector = EXCLUDED.sector,
    cell = EXCLUDED.cell,
    address = EXCLUDED.address,
    profile_completed = EXCLUDED.profile_completed;

-- Add company fields for company accounts
UPDATE public.users SET 
    company_name = 'ABC Company',
    company_tin = '123456789',
    company_address = 'KN 3 Ave, Kigali, Rwanda',
    company_phone = '+250788234567'
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE public.users SET 
    company_name = 'Tech Solutions Ltd',
    company_tin = '987654321',
    company_address = 'Kayonza District, Eastern Province',
    company_phone = '+250788567890'
WHERE id = '55555555-5555-5555-5555-555555555555';

-- Add revision notes for applications that need revision
UPDATE public.applications 
SET revision_notes = 'Please address the following issues before resubmission:
1. Complete the hydrogeological study for the spring source assessment
2. Provide detailed water quality test results from the spring
3. Submit updated environmental management plan with specific mitigation measures
4. Include detailed technical specifications for the spring capture system
5. Provide capacity calculations for the 200m³ storage system'
WHERE application_number = 'RWB-24-00124';

-- Sample applications in different review stages
INSERT INTO public.applications (
  id,
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
  village,
  project_title,
  project_description,
  water_taking_method,
  water_measuring_method,
    storage_facilities,
    return_flow_description,
  environmental_assessment,
  mitigation_actions,
  sla_status,
    due_date,
    submitted_at,
  created_at,
  updated_at
) VALUES
-- RWB-24-00121 - The specific application mentioned by user
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'RWB-24-00121', 'pending_inspection', 'industrial', 'groundwater', 'industrial', 750.00, 'm³/day', 'Kigali', 'Gasabo', 'Kimihurura', 'Kimihurura', 'Kimihurura', 'Industrial Water Supply for Manufacturing Plant', 'Large-scale industrial water extraction for manufacturing facility. The project involves drilling a deep borehole to access groundwater for industrial processes including cooling, cleaning, and production. The facility will employ 200+ workers and contribute significantly to local economic development.', 'Borehole drilling with submersible pump', 'Digital flow meter with remote monitoring', 'Concrete reservoir with 2000m³ capacity, secondary containment systems', 'Treated industrial wastewater discharged to municipal treatment plant', 'Comprehensive environmental impact assessment completed. Minimal impact on local groundwater table. No nearby residential wells within 500m radius.', 'Regular groundwater monitoring, water recycling systems, emergency spill containment, community engagement programs', 'on_time', '2025-01-15 09:00:00+00', '2024-12-24 10:30:00+00', '2024-12-24 10:30:00+00', '2024-12-24 10:30:00+00'),

-- RWB-24-00122 - New submission
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'RWB-24-00122', 'submitted', 'domestic', 'surface_water', 'domestic', 50.00, 'm³/day', 'Kigali', 'Gasabo', 'Remera', 'Rukiri', 'Rukiri', 'Residential Water Supply System', 'Installation of water supply system for new residential development. The system will serve 25 households with reliable water access from nearby stream.', 'Gravity-fed intake system', 'Mechanical flow meter', 'Elevated storage tank 50m³', 'Minimal return flow to natural drainage', 'Low environmental impact. Stream flow assessment completed showing adequate capacity during dry season.', 'Fish ladder installation, riparian buffer zones, regular water quality testing', 'on_time', '2025-01-10 09:00:00+00', '2024-12-25 14:15:00+00', '2024-12-25 14:15:00+00', '2024-12-25 14:15:00+00'),

-- RWB-24-00123 - Under review
('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'RWB-24-00123', 'under_review', 'agricultural', 'river', 'irrigation', 300.00, 'm³/day', 'Southern', 'Huye', 'Tumba', 'Tumba', 'Tumba', 'Modern Rice Farm Irrigation System', 'Establishment of modern irrigation system for 50-hectare rice farm. The project aims to increase agricultural productivity and ensure year-round farming capabilities.', 'Pumping station with intake structure', 'Electromagnetic flow meter', 'Distribution network with storage pond 1000m³', 'Irrigation return flow to downstream wetlands', 'Moderate environmental impact. Wetland assessment shows sustainable water extraction levels.', 'Efficient irrigation techniques, regular monitoring, buffer zones, community water sharing protocols', 'on_time', '2025-01-05 09:00:00+00', '2024-12-20 09:00:00+00', '2024-12-20 09:00:00+00', '2024-12-20 09:00:00+00'),

-- RWB-24-00124 - Needs revision
('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'RWB-24-00124', 'revision_required', 'commercial', 'spring', 'commercial', 150.00, 'm³/day', 'Northern', 'Musanze', 'Kinigi', 'Kinigi', 'Kinigi', 'Hotel Complex Water Supply', 'Water supply system for new eco-tourism hotel complex. The facility will accommodate 100 guests and requires reliable water supply for operations.', 'Spring capture system', 'Mechanical flow meter', 'Gravity storage system 200m³', 'Greywater treatment and reuse system', 'Spring source assessment incomplete. Additional hydrogeological study required.', 'Spring protection measures, water conservation systems, guest education programs', 'due_soon', '2024-12-31 09:00:00+00', '2024-12-18 16:45:00+00', '2024-12-18 16:45:00+00', '2024-12-18 16:45:00+00'),

-- RWB-24-00125 - Another submitted application
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 'RWB-24-00125', 'submitted', 'industrial', 'borehole', 'industrial', 500.00, 'm³/day', 'Eastern', 'Kayonza', 'Kayonza', 'Kayonza', 'Kayonza', 'Food Processing Plant Water Supply', 'Water supply for new food processing facility. The plant will process agricultural products for export and requires high-quality water for food safety compliance.', 'Deep borehole with submersible pump', 'Digital flow meter with data logging', 'Stainless steel storage tanks 1500m³', 'Treated wastewater to irrigation system', 'Comprehensive environmental management plan developed. Sustainable groundwater extraction confirmed.', 'Water quality monitoring, treatment plant optimization, worker training programs', 'on_time', '2025-01-12 09:00:00+00', '2024-12-26 11:20:00+00', '2024-12-26 11:20:00+00', '2024-12-26 11:20:00+00')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    revision_notes = EXCLUDED.revision_notes,
    updated_at = EXCLUDED.updated_at;

-- Add some sample documents
INSERT INTO public.documents (
  id,
  application_id,
  name,
  type,
    file_path,
    file_size,
    mime_type,
  verification_status,
  uploaded_by,
  upload_date,
  created_at,
  updated_at
) VALUES 
-- Documents for RWB-24-00121
('doc00001-0001-0001-0001-doc000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business License Certificate', 'business_license', '/uploads/business_license_abc.pdf', 2457600, 'application/pdf', 'verified', '22222222-2222-2222-2222-222222222222', '2024-06-24 10:35:00+00', '2024-06-24 10:35:00+00', '2024-06-24 10:35:00+00'),
('doc00002-0002-0002-0002-doc000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Technical Drawings', 'technical_drawings', '/uploads/technical_drawings_abc.pdf', 5242880, 'application/pdf', 'verified', '22222222-2222-2222-2222-222222222222', '2024-06-24 10:37:00+00', '2024-06-24 10:37:00+00', '2024-06-24 10:37:00+00'),
('doc00003-0003-0003-0003-doc000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Environmental Impact Assessment', 'environmental_impact_doc', '/uploads/eia_report_abc.pdf', 8912896, 'application/pdf', 'verified', '22222222-2222-2222-2222-222222222222', '2024-06-24 10:40:00+00', '2024-06-24 10:40:00+00', '2024-06-24 10:40:00+00'),
('doc00004-0004-0004-0004-doc000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Payment Proof', 'payment_proof', '/uploads/payment_proof_abc.pdf', 1048576, 'application/pdf', 'verified', '22222222-2222-2222-2222-222222222222', '2024-06-24 10:42:00+00', '2024-06-24 10:42:00+00', '2024-06-24 10:42:00+00'),

-- Documents for RWB-24-00122
('doc00005-0005-0005-0005-doc000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'National ID Copy', 'identification_doc', '/uploads/national_id_jane.pdf', 819200, 'application/pdf', 'pending', '11111111-1111-1111-1111-111111111111', '2024-06-25 14:20:00+00', '2024-06-25 14:20:00+00', '2024-06-25 14:20:00+00'),
('doc00006-0006-0006-0006-doc000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Land Title Certificate', 'land_ownership_doc', '/uploads/land_title_jane.pdf', 2097152, 'application/pdf', 'pending', '11111111-1111-1111-1111-111111111111', '2024-06-25 14:22:00+00', '2024-06-25 14:22:00+00', '2024-06-25 14:22:00+00')
ON CONFLICT (id) DO UPDATE SET
    verification_status = EXCLUDED.verification_status,
    updated_at = EXCLUDED.updated_at;

-- Add some sample reviews
INSERT INTO public.reviews (
  id,
  application_id,
  reviewer_id,
  review_stage,
  status,
    technical_review,
    environmental_review,
    overall_comments,
  risk_assessment,
  recommendation,
  assigned_at,
  completed_at,
  created_at,
  updated_at
) VALUES
-- Review for RWB-24-00121
('rev00001-0001-0001-0001-rev000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'technical', 'completed', 'Technical specifications are comprehensive and well-documented. The proposed borehole drilling method is appropriate for the geological conditions. Water extraction volume is reasonable for the intended industrial use.', 'Environmental impact assessment is thorough. The proposed mitigation measures are adequate. Regular monitoring protocols are well-defined.', 'The application is technically sound and environmentally responsible. All required documentation is complete and verified. Recommend approval for inspection phase.', 'low', 'require_inspection', '2024-06-24 11:00:00+00', '2024-06-25 15:30:00+00', '2024-06-24 11:00:00+00', '2024-06-25 15:30:00+00'),

-- Review for RWB-24-00123
('rev00002-0002-0002-0002-rev000000002', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '66666666-6666-6666-6666-666666666666', 'initial', 'completed', 'Initial technical review shows good understanding of irrigation requirements. Pump sizing appears appropriate for the scale of operation.', 'Agricultural water use is generally low-risk. River extraction levels are within sustainable limits based on flow assessment.', 'Application shows good potential. Some additional technical details needed before final approval. Recommend continuation of review process.', 'medium', 'approve', '2024-06-20 09:30:00+00', '2024-06-21 14:00:00+00', '2024-06-20 09:30:00+00', '2024-06-21 14:00:00+00'),

-- Review for RWB-24-00124 (needs revision)
('rev00003-0003-0003-0003-rev000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'technical', 'completed', 'Technical proposal lacks sufficient detail about spring capacity assessment. Flow measurement data is incomplete.', 'Spring source requires detailed hydrogeological study. Current environmental assessment is insufficient for spring-fed systems.', 'Application requires significant additional information before proceeding. Recommend returning to applicant for revision with specific requirements outlined.', 'high', 'require_revision', '2024-06-18 17:00:00+00', '2024-06-19 10:15:00+00', '2024-06-18 17:00:00+00', '2024-06-19 10:15:00+00')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    technical_review = EXCLUDED.technical_review,
    environmental_review = EXCLUDED.environmental_review,
    overall_comments = EXCLUDED.overall_comments,
    recommendation = EXCLUDED.recommendation,
    completed_at = EXCLUDED.completed_at,
    updated_at = EXCLUDED.updated_at;

-- Add some workflow history
INSERT INTO public.workflow_history (
  id,
  application_id,
    previous_status,
    new_status,
    changed_by,
    change_reason,
    created_at
) VALUES
-- Workflow for RWB-24-00121
('wf000001-0001-0001-0001-wf0000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft', 'submitted', '22222222-2222-2222-2222-222222222222', 'Initial application submission', '2024-06-24 10:30:00+00'),
('wf000002-0002-0002-0002-wf0000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'submitted', 'under_review', '66666666-6666-6666-6666-666666666666', 'Assigned to technical reviewer', '2024-06-24 11:00:00+00'),
('wf000003-0003-0003-0003-wf0000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'under_review', 'pending_inspection', '66666666-6666-6666-6666-666666666666', 'Technical review completed - approved for inspection', '2024-06-25 15:30:00+00'),

-- Workflow for RWB-24-00124
('wf000004-0004-0004-0004-wf0000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'draft', 'submitted', '44444444-4444-4444-4444-444444444444', 'Initial application submission', '2024-06-18 16:45:00+00'),
('wf000005-0005-0005-0005-wf0000000005', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'submitted', 'under_review', '66666666-6666-6666-6666-666666666666', 'Assigned to technical reviewer', '2024-06-18 17:00:00+00'),
('wf000006-0006-0006-0006-wf0000000006', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'under_review', 'revision_required', '66666666-6666-6666-6666-666666666666', 'Technical review completed - additional information required', '2024-06-19 10:15:00+00')
ON CONFLICT (id) DO NOTHING;

-- Add some system settings
INSERT INTO public.system_settings (
    id,
    setting_key,
    setting_value,
    description,
  created_at,
  updated_at
) VALUES 
('sys00001-0001-0001-0001-sys000000001', 'sla_review_days', '14', 'Number of days allowed for technical review', '2024-06-01 09:00:00+00', '2024-06-01 09:00:00+00'),
('sys00002-0002-0002-0002-sys000000002', 'sla_inspection_days', '30', 'Number of days allowed for inspection completion', '2024-06-01 09:00:00+00', '2024-06-01 09:00:00+00'),
('sys00003-0003-0003-0003-sys000000003', 'max_file_size_mb', '10', 'Maximum file size for document uploads in MB', '2024-06-01 09:00:00+00', '2024-06-01 09:00:00+00')
ON CONFLICT (id) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = EXCLUDED.updated_at;

-- Note: This sample data includes:
-- 1. The specific application RWB-24-00121 mentioned by the user
-- 2. Applications in different statuses for testing the review dashboard
-- 3. Related documents and reviews
-- 4. Workflow history showing status changes
-- 5. System settings for operational parameters

-- To apply this data, run: psql -d your_database -f database/sample-data.sql 