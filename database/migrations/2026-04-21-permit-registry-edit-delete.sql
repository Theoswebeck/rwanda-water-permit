-- =============================================
-- Permit registry staff edit/delete support
-- =============================================
--
-- Adds:
--   - deleted_at: soft-delete marker
--   - manually_edited_at: protects staff edits from sync overwrite
--   - partial index for active (non-deleted) rows

ALTER TABLE public.permit_registry
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS manually_edited_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS permit_registry_live_rows_idx
  ON public.permit_registry (deleted_at)
  WHERE deleted_at IS NULL;
