-- Update application-documents bucket file size limit to 25MB
-- Required for feasibility study uploads (max 25MB)
-- Run this in Supabase SQL Editor if you use Supabase storage for documents

UPDATE storage.buckets
SET file_size_limit = 26214400  -- 25MB
WHERE id = 'application-documents';
