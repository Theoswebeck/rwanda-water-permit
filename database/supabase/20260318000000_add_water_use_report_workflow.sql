-- =====================================================================
-- Water Use Report Approval Workflow Migration
-- Adds multi-stage approval workflow to water_use_reports, mirroring
-- the inspection approval chain:
--   submitted -> assessor -> reviewer -> verifier -> approver
--
-- Uses plain PostgreSQL (no Supabase auth).
-- Authorization is handled at the application/API level.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

-- =====================================================================
-- 1) Replace status constraint to include all workflow statuses
-- =====================================================================
ALTER TABLE public.water_use_reports
  DROP CONSTRAINT IF EXISTS water_use_reports_status_chk;

ALTER TABLE public.water_use_reports
  ADD CONSTRAINT water_use_reports_status_chk
  CHECK (status IN (
    'draft',
    'submitted',
    'pending_review',
    'pending_verification',
    'pending_approval',
    'approved',
    'rejected',
    'returned_to_assessment',
    'returned_to_review',
    'returned_to_verification'
  ));

-- =====================================================================
-- 2) Add workflow_status column
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'draft';

DO $$
BEGIN
  ALTER TABLE public.water_use_reports
    ADD CONSTRAINT water_use_reports_workflow_status_chk
    CHECK (workflow_status IN (
      'draft',
      'submitted',
      'pending_review',
      'pending_verification',
      'pending_approval',
      'approved',
      'rejected',
      'returned_to_assessment',
      'returned_to_review',
      'returned_to_verification'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint water_use_reports_workflow_status_chk already exists, skipping...';
END $$;

-- =====================================================================
-- 3) Assignment columns for the approval chain
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_verifier_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_approver_id UUID REFERENCES public.users(id);

-- =====================================================================
-- 4) Assessment tracking
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS assessment_notes TEXT,
  ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- 5) Review tracking
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- 6) Verification tracking
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- 7) Approval tracking
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- 8) Additional fields
-- =====================================================================
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- =====================================================================
-- 9) Indexes for workflow queries
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_wur_workflow_status ON public.water_use_reports(workflow_status);
CREATE INDEX IF NOT EXISTS idx_wur_assigned_reviewer ON public.water_use_reports(assigned_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_wur_assigned_verifier ON public.water_use_reports(assigned_verifier_id);
CREATE INDEX IF NOT EXISTS idx_wur_assigned_approver ON public.water_use_reports(assigned_approver_id);

-- =====================================================================
-- 10) water_use_report_workflow_history table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.water_use_report_workflow_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  water_use_report_id UUID NOT NULL REFERENCES public.water_use_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wurwh_report_id ON public.water_use_report_workflow_history(water_use_report_id);
CREATE INDEX IF NOT EXISTS idx_wurwh_created_at ON public.water_use_report_workflow_history(created_at);

-- =====================================================================
-- 11) Backfill existing reports
--     MUST run BEFORE the auto-logging trigger is created.
-- =====================================================================
UPDATE public.water_use_reports
SET workflow_status = CASE
  WHEN status = 'submitted' THEN 'submitted'
  WHEN status = 'under_review' THEN 'pending_review'
  WHEN status = 'completed' THEN 'approved'
  ELSE 'draft'
END
WHERE workflow_status IS NULL OR workflow_status = 'draft';

-- =====================================================================
-- 12) Auto-log workflow_status changes on water_use_reports
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_wur_workflow_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) THEN
    INSERT INTO public.water_use_report_workflow_history (
      water_use_report_id,
      user_id,
      from_status,
      to_status,
      action,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      NULL,
      OLD.workflow_status,
      NEW.workflow_status,
      'status_change',
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wur_workflow_status_change ON public.water_use_reports;
CREATE TRIGGER trg_wur_workflow_status_change
AFTER UPDATE OF workflow_status ON public.water_use_reports
FOR EACH ROW
EXECUTE FUNCTION public.log_wur_workflow_status_change();

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ Water use report approval workflow migration completed successfully'; END $$;
