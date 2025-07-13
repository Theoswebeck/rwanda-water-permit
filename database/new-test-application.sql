-- New test application for revision notes testing
-- This creates a fresh application that can be reviewed and returned for revision

-- First, create a test applicant if they don't exist
INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    role,
    status,
    account_type,
    phone,
    province,
    district,
    sector,
    cell,
    address,
    profile_completed
) VALUES (
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    'test.applicant@example.com',
    'Test',
    'Applicant',
    'applicant',
    'active',
    'individual',
    '+250788999999',
    'Kigali',
    'Gasabo',
    'Kacyiru',
    'Kacyiru',
    'Test Address, Kigali',
    true
) ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address;

-- Create a new test application
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
) VALUES (
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    'RWB-25-00001',
    'submitted',
    'commercial',
    'borehole',
    'other',
    200.00,
    'm³/day',
    'Kigali',
    'Gasabo',
    'Kacyiru',
    'Kacyiru',
    'Kacyiru',
    'Small Business Water Supply',
    'Water supply system for a small restaurant and guest house. The facility will serve approximately 50 customers daily and requires reliable water access for kitchen operations, guest rooms, and general facility maintenance. The project includes installing a borehole with proper treatment systems.',
    'Borehole drilling with electric pump',
    'Digital water meter',
    'Underground storage tank 500m³',
    'Treated greywater for garden irrigation',
    'Small-scale commercial use with minimal environmental impact. Proposed extraction is well within sustainable limits for the area.',
    'Water conservation measures, regular maintenance schedules, staff training on water management',
    'on_time',
    '2025-01-20 09:00:00+00',
    '2025-01-06 14:30:00+00',
    '2025-01-06 14:30:00+00',
    '2025-01-06 14:30:00+00'
) ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;

-- Add a sample document for the application
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
) VALUES (
    '12345678-90ab-cdef-1234-567890abcdef',
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'Business Registration Certificate',
    'business_license',
    '/uploads/test_business_license.pdf',
    1024000,
    'application/pdf',
    'pending',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    '2025-01-06 14:35:00+00',
    '2025-01-06 14:35:00+00',
    '2025-01-06 14:35:00+00'
) ON CONFLICT (id) DO UPDATE SET
    verification_status = EXCLUDED.verification_status,
    updated_at = EXCLUDED.updated_at; 