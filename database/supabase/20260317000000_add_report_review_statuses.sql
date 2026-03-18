-- =====================================================
-- Add under_review and completed statuses to water_use_reports
-- =====================================================
-- Extends the status CHECK constraint so reports can
-- move through: draft -> submitted -> under_review -> completed
-- =====================================================

BEGIN;

ALTER TABLE public.water_use_reports
  DROP CONSTRAINT IF EXISTS water_use_reports_status_chk;

ALTER TABLE public.water_use_reports
  ADD CONSTRAINT water_use_reports_status_chk
  CHECK (status IN ('draft', 'submitted', 'under_review', 'completed'));

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
