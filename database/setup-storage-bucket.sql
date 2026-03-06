-- =============================================
-- Rwanda Water Resources Board Storage Setup
-- Create storage bucket for application documents
-- =============================================

-- Create storage bucket for application documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-documents',
  'application-documents', 
  true,
  26214400, -- 25MB limit (feasibility studies can be up to 25MB)
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Note: Storage policies should be created through Supabase Dashboard or with proper admin privileges
-- If you get permissions errors, create these policies through the Supabase Dashboard instead:

-- Policy 1: Allow authenticated users to upload files
-- CREATE POLICY "Allow authenticated uploads" ON storage.objects
-- FOR INSERT WITH CHECK (
--   bucket_id = 'application-documents' 
--   AND auth.role() = 'authenticated'
-- );

-- Policy 2: Allow authenticated users to view files
-- CREATE POLICY "Allow authenticated reads" ON storage.objects
-- FOR SELECT USING (
--   bucket_id = 'application-documents'
--   AND auth.role() = 'authenticated'
-- );

-- Policy 3: Allow authenticated users to update files
-- CREATE POLICY "Allow authenticated updates" ON storage.objects
-- FOR UPDATE USING (
--   bucket_id = 'application-documents'
--   AND auth.role() = 'authenticated'
-- );

-- Policy 4: Allow authenticated users to delete files
-- CREATE POLICY "Allow authenticated deletes" ON storage.objects
-- FOR DELETE USING (
--   bucket_id = 'application-documents'
--   AND auth.role() = 'authenticated'
-- );

SELECT 'Storage bucket created successfully! Please create storage policies manually through Supabase Dashboard.' as status; 