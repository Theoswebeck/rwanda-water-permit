-- Let staff correct and attach documents to the approved system inspections
-- the Inspection Registry surfaces (source_kind = 'system'), same as imported rows.
--
-- Corrections live in an overlay keyed by inspection id: the approved
-- public.inspections record (the signed-off form output) is never rewritten.
-- A NULL column means "no correction" — the registry shows the system value.

CREATE TABLE IF NOT EXISTS public.inspection_registry_system_overrides (
  inspection_id        uuid        PRIMARY KEY REFERENCES public.inspections(id) ON DELETE CASCADE,
  permit_holder        text,
  permit_number        text,
  activity             text,
  district             text,
  compliance_status    text,
  observation          text,
  action               text,
  inspection_date_text text,
  updated_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_registry_system_overrides TO waterpermit_app;

-- Documents may now belong to either an imported row (inspection_registry.id)
-- or a system inspection (inspections.id), so the single-table FK goes; the
-- upload route checks the id exists in one of the two.
ALTER TABLE public.inspection_registry_documents
  DROP CONSTRAINT IF EXISTS inspection_registry_documents_inspection_id_fkey;

-- rwb_it_readonly exists on prod only (pgAdmin access for RWB IT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rwb_it_readonly') THEN
    GRANT SELECT ON public.inspection_registry_system_overrides TO rwb_it_readonly;
  END IF;
END $$;
