# 🚀 Quick Fix: Document Viewing Setup

## ✅ **Issue Identified**
The application ID `f1e2d3c4-b5a6-9870-1234-567890fedcba` doesn't exist in your database, causing the "Application not found" error.

## 🛠️ **Solution Steps**

### **Step 1: Set Up Sample Data**
Run this SQL script in your Supabase database to create the test application with documents:

```sql
-- Create test applicant
INSERT INTO public.users (
    id, email, first_name, last_name, role, status, account_type, 
    phone, province, district, sector, cell, address, profile_completed
) VALUES (
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    'test.applicant@example.com',
    'Test', 'Applicant', 'applicant', 'active', 'individual',
    '+250788999999', 'Kigali', 'Gasabo', 'Kacyiru', 'Kacyiru',
    'Test Address, Kigali', true
) ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name;

-- Create test application
INSERT INTO public.applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    project_title, project_description,
    water_taking_method, water_measuring_method, storage_facilities,
    return_flow_description, environmental_assessment, mitigation_actions,
    sla_status, due_date, submitted_at, created_at, updated_at
) VALUES (
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    'RWB-25-00001', 'submitted', 'commercial',
    'borehole', 'other', 200.00, 'm³/day',
    'Kigali', 'Gasabo', 'Kacyiru', 'Kacyiru', 'Kacyiru',
    'Small Business Water Supply',
    'Water supply system for a small restaurant and guest house.',
    'Borehole drilling with electric pump', 'Digital water meter',
    'Underground storage tank 500m³', 'Treated greywater for garden irrigation',
    'Small-scale commercial use with minimal environmental impact.',
    'Water conservation measures, regular maintenance schedules',
    'on_time', '2025-01-20 09:00:00+00', '2025-01-06 14:30:00+00',
    '2025-01-06 14:30:00+00', '2025-01-06 14:30:00+00'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Add sample documents
INSERT INTO public.documents (
    id, application_id, name, type, file_path, file_size, mime_type,
    verification_status, uploaded_by, upload_date, created_at, updated_at
) VALUES 
(
    '12345678-90ab-cdef-1234-567890abcdef',
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'Business Registration Certificate',
    'business_license',
    '/uploads/test_business_license.pdf',
    1024000, 'application/pdf', 'pending',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    '2025-01-06 14:35:00+00',
    '2025-01-06 14:35:00+00',
    '2025-01-06 14:35:00+00'
),
(
    '87654321-ba09-fedc-4321-fedcba098765',
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'Technical Drawings',
    'technical_drawings',
    '/uploads/technical_drawings.pdf',
    2048000, 'application/pdf', 'verified',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    '2025-01-06 14:36:00+00',
    '2025-01-06 14:36:00+00',
    '2025-01-06 14:36:00+00'
),
(
    'abcdef12-3456-7890-abcd-ef1234567890',
    'f1e2d3c4-b5a6-9870-1234-567890fedcba',
    'Environmental Impact Assessment',
    'environmental_impact_doc',
    '/uploads/eia_report.pdf',
    3072000, 'application/pdf', 'verified',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    '2025-01-06 14:37:00+00',
    '2025-01-06 14:37:00+00',
    '2025-01-06 14:37:00+00'
) ON CONFLICT (id) DO UPDATE SET verification_status = EXCLUDED.verification_status;
```

### **Step 2: Access the Application**
After running the SQL script, visit:
```
http://localhost:3000/dashboard/application/f1e2d3c4-b5a6-9870-1234-567890fedcba
```

### **Step 3: Test Document Viewing**
You should now see:
- ✅ **Application Details**: Complete application information
- ✅ **Documents Section**: List of 3 uploaded documents
- ✅ **View Button**: Opens documents in new tab (using CDN URLs)
- ✅ **Download Button**: Downloads documents
- ✅ **Status Badges**: Shows verification status

## 🧪 **Alternative Test Applications**

If you want to test with the other application you mentioned (`660e8400-e29b-41d4-a716-446655440001`), create it with:

```sql
-- Alternative test application
INSERT INTO public.applications (
    id, applicant_id, application_number, status, application_type,
    water_source, water_purpose, estimated_usage_volume, usage_unit,
    province, district, sector, cell, village,
    project_title, project_description, sla_status, due_date, 
    submitted_at, created_at, updated_at
) VALUES (
    '660e8400-e29b-41d4-a716-446655440001',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    'RWB-25-00002', 'submitted', 'domestic',
    'river', 'domestic', 50.00, 'm³/day',
    'Kigali', 'Gasabo', 'Remera', 'Rukiri', 'Rukiri I',
    'Domestic Water Supply from River',
    'Water intake from nearby river for household use.',
    'on_time', '2025-01-25 09:00:00+00',
    '2025-01-06 15:00:00+00', '2025-01-06 15:00:00+00', '2025-01-06 15:00:00+00'
) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- Add documents for this application
INSERT INTO public.documents (
    id, application_id, name, type, file_path, file_size, mime_type,
    verification_status, uploaded_by, upload_date, created_at, updated_at
) VALUES (
    'doc12345-abcd-efgh-ijkl-mnop12345678',
    '660e8400-e29b-41d4-a716-446655440001',
    'National ID Copy',
    'identification_doc',
    '/uploads/national_id_copy.pdf',
    512000, 'application/pdf', 'verified',
    'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    '2025-01-06 15:05:00+00',
    '2025-01-06 15:05:00+00',
    '2025-01-06 15:05:00+00'
) ON CONFLICT (id) DO UPDATE SET verification_status = EXCLUDED.verification_status;
```

Then visit: `http://localhost:3000/dashboard/application/660e8400-e29b-41d4-a716-446655440001`

## 🔍 **Debugging Console**
Open browser console (F12) to see debug information:
- `📄 Documents found: X documents`
- `📄 Documents data: [array of document objects]`

## ✅ **Expected Result**
After setup, you should see:
1. **Application loads successfully**
2. **Documents section displays**
3. **Document list with view/download buttons**
4. **Clicking "View" opens documents in new tab**
5. **Clicking "Download" initiates download**

## 🚨 **If Still Not Working**
Check browser console for errors and verify:
1. Supabase connection is working
2. RLS policies allow document access
3. Storage bucket is configured
4. CDN URLs are being generated correctly

Happy testing! 🎉 