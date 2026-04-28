-- Create permit_registry_documents table for multi-document upload per registry row.
-- Uses permit_number (not registry UUID) as the join key so documents survive
-- TRUNCATE+INSERT on every permit registry re-import.

CREATE TABLE IF NOT EXISTS public.permit_registry_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_number TEXT        NOT NULL,
  doc_path      TEXT        NOT NULL,
  doc_name      TEXT        NOT NULL,
  doc_mime_type TEXT        NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permit_registry_documents_permit_number
  ON public.permit_registry_documents (permit_number);
