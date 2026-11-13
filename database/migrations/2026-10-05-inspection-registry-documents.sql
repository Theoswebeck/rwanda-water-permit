-- Supporting documents attached to imported Inspection Registry rows (staff upload).
-- Approved system inspections keep their documents on the inspection itself
-- (inspections.inspection_documents / public.documents), so only
-- public.inspection_registry rows get attachments here.
-- (Superseded 2026-10-12: system inspections can now have registry documents
-- too, and the FK below is dropped — see 2026-10-12-inspection-registry-system-edits.sql.)
-- Files live under public/uploads/inspection-registry/<inspection_id>/.
-- NOTE: re-importing the register must UPSERT on inspection_number, not
-- TRUNCATE+INSERT — new row ids would cascade-delete these document rows.

CREATE TABLE IF NOT EXISTS public.inspection_registry_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid        NOT NULL REFERENCES public.inspection_registry(id) ON DELETE CASCADE,
  doc_path      text        NOT NULL,
  doc_name      text        NOT NULL,
  doc_mime_type text        NOT NULL,
  uploaded_by   text,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_registry_documents_inspection_id
  ON public.inspection_registry_documents (inspection_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_registry_documents TO waterpermit_app;

-- rwb_it_readonly exists on prod only (pgAdmin access for RWB IT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rwb_it_readonly') THEN
    GRANT SELECT ON public.inspection_registry_documents TO rwb_it_readonly;
  END IF;
END $$;
