-- =====================================================================
-- Add pending_assessment to water_use_reports status constraints
-- This status is set when a reviewer assigns a report to an assessor.
-- =====================================================================

BEGIN;

-- 1) Update status constraint
ALTER TABLE public.water_use_reports
  DROP CONSTRAINT IF EXISTS water_use_reports_status_chk;

ALTER TABLE public.water_use_reports
  ADD CONSTRAINT water_use_reports_status_chk
  CHECK (status IN (
    'draft',
    'submitted',
    'pending_assessment',
    'pending_review',
    'pending_verification',
    'pending_approval',
    'approved',
    'rejected',
    'returned_to_assessment',
    'returned_to_review',
    'returned_to_verification'
  ));

-- 2) Update workflow_status constraint
ALTER TABLE public.water_use_reports
  DROP CONSTRAINT IF EXISTS water_use_reports_workflow_status_chk;

ALTER TABLE public.water_use_reports
  ADD CONSTRAINT water_use_reports_workflow_status_chk
  CHECK (workflow_status IN (
    'draft',
    'submitted',
    'pending_assessment',
    'pending_review',
    'pending_verification',
    'pending_approval',
    'approved',
    'rejected',
    'returned_to_assessment',
    'returned_to_review',
    'returned_to_verification'
  ));

-- 3) Index for assessor assignment filtering
CREATE INDEX IF NOT EXISTS idx_wur_assigned_assessor ON public.water_use_reports(assigned_assessor_id);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ Added pending_assessment status to water_use_reports constraints'; END $$;
