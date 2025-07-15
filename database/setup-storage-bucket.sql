-- =============================================
-- Supabase Storage Bucket Setup for Documents
-- =============================================

-- Create the documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-documents',
  'application-documents', 
  true,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================
-- Storage Policies for Row Level Security
-- =============================================

-- Policy: Allow authenticated users to upload files to their own folders
CREATE POLICY "Users can upload to own application folder" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'application-documents' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'applications'
);

-- Policy: Allow authenticated users to view files they have access to
CREATE POLICY "Users can view accessible documents" 
ON storage.objects FOR SELECT 
USING (
  bucket_id = 'application-documents' 
  AND auth.role() = 'authenticated'
  AND (
    -- Users can view documents from their own applications
    (storage.foldername(name))[2] IN (
      SELECT id::text FROM applications WHERE applicant_id = auth.uid()
    )
    OR
    -- Staff can view all documents
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('reviewer', 'inspector', 'admin', 'approver')
    )
  )
);

-- Policy: Allow users to delete their own documents
CREATE POLICY "Users can delete own documents" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'application-documents' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM applications WHERE applicant_id = auth.uid()
  )
);

-- Policy: Allow staff to delete any documents
CREATE POLICY "Staff can delete any documents" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'application-documents' 
  AND auth.role() = 'authenticated'
  AND auth.uid() IN (
    SELECT id FROM users WHERE role IN ('admin', 'approver')
  )
);

-- =============================================
-- Create helper function to get document URL
-- =============================================

CREATE OR REPLACE FUNCTION get_document_url(file_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bucket_name TEXT := 'application-documents';
  public_url TEXT;
BEGIN
  -- Get the public URL for the file
  SELECT 
    CASE 
      WHEN file_path IS NULL THEN NULL
      WHEN file_path LIKE 'http%' THEN file_path
      ELSE 
        CONCAT(
          current_setting('app.supabase_url', true),
          '/storage/v1/object/public/',
          bucket_name,
          '/',
          LTRIM(file_path, '/')
        )
    END
  INTO public_url;
  
  RETURN public_url;
END;
$$;

-- =============================================
-- Grant permissions
-- =============================================

-- Grant usage on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_document_url(TEXT) TO authenticated;

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Sample usage queries for testing
-- =============================================

/*
-- Test the function
SELECT get_document_url('/uploads/test_business_license.pdf');

-- View all documents for an application
SELECT 
  d.*,
  get_document_url(d.file_path) as public_url
FROM documents d 
WHERE d.application_id = 'f1e2d3c4-b5a6-9870-1234-567890fedcba';

-- Upload test (to be done via application)
-- Files should be uploaded to: applications/{application_id}/{filename}
*/ 