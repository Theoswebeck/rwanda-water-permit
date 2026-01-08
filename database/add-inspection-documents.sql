-- =====================================================
-- Add inspection document uploads support (safe migration)
-- Stores uploaded file metadata (path/name/type/size/timestamp) in JSONB.
-- =====================================================

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspection_documents JSONB;

CREATE INDEX IF NOT EXISTS idx_inspections_documents_gin
  ON public.inspections
  USING GIN (inspection_documents);


