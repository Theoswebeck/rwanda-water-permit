-- =============================================
-- Add uploaded document metadata to permit_registry
-- =============================================

ALTER TABLE public.permit_registry
  ADD COLUMN IF NOT EXISTS uploaded_doc_path text,
  ADD COLUMN IF NOT EXISTS uploaded_doc_name text,
  ADD COLUMN IF NOT EXISTS uploaded_doc_mime_type text,
  ADD COLUMN IF NOT EXISTS uploaded_doc_uploaded_at timestamptz;
