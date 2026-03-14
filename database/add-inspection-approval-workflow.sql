-- =====================================================================
-- Inspection Approval Workflow Migration
-- Adds multi-stage approval workflow to inspections, mirroring the
-- application approval chain: submitted -> reviewer -> assessor ->
-- reviewer -> verifier -> approver.
--
-- Target: Local RWB PostgreSQL (not Supabase)
-- =====================================================================

-- 0) Ensure uuid-ossp extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1) Add workflow_status column
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'draft';

DO $$
BEGIN
  ALTER TABLE public.inspections
    ADD CONSTRAINT inspections_workflow_status_chk
    CHECK (workflow_status IN (
      'draft',
      'submitted',
      'pending_assessment',
      'under_assessment',
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
    RAISE NOTICE 'Constraint inspections_workflow_status_chk already exists, skipping...';
END $$;

-- =====================================================================
-- 2) Assignment columns for the approval chain
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_assessor_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_verifier_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_approver_id UUID REFERENCES public.users(id);

-- =====================================================================
-- 3) Assessment tracking
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS assessment_notes TEXT,
  ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- 4) Verification tracking
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- =====================================================================
-- 5) Approval tracking
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- =====================================================================
-- 6) Additional fields
-- =====================================================================
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- =====================================================================
-- 7) Indexes for workflow queries
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_inspections_workflow_status ON public.inspections(workflow_status);
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_reviewer ON public.inspections(assigned_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_assessor ON public.inspections(assigned_assessor_id);
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_verifier ON public.inspections(assigned_verifier_id);
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_approver ON public.inspections(assigned_approver_id);

-- =====================================================================
-- 8) inspection_workflow_history table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.inspection_workflow_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iwh_inspection_id ON public.inspection_workflow_history(inspection_id);
CREATE INDEX IF NOT EXISTS idx_iwh_created_at ON public.inspection_workflow_history(created_at);

-- =====================================================================
-- 9) Drop the old review-only trigger (too restrictive for new workflow)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_inspections_review_only_update ON public.inspections;
DROP FUNCTION IF EXISTS public.enforce_inspection_review_only_update();

-- =====================================================================
-- 10) Backfill existing inspections
--     MUST run BEFORE the auto-logging trigger is created, otherwise
--     the backfill UPDATE would generate spurious history rows.
-- =====================================================================
UPDATE public.inspections
SET workflow_status = CASE
  WHEN status = 'completed' AND review_status = 'reviewed' THEN 'approved'
  WHEN status = 'completed' AND review_status IS NOT NULL AND review_status != 'reviewed' THEN 'submitted'
  WHEN status = 'completed' THEN 'submitted'
  ELSE 'draft'
END
WHERE workflow_status IS NULL OR workflow_status = 'draft';

-- =====================================================================
-- 11) Auto-log workflow_status changes on inspections
--     user_id is set to NULL; the application layer inserts explicit
--     history rows with the real user_id for all manual transitions.
--     This trigger is a safety net for any direct SQL updates.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_inspection_workflow_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) THEN
    INSERT INTO public.inspection_workflow_history (
      inspection_id,
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

DROP TRIGGER IF EXISTS trg_inspection_workflow_status_change ON public.inspections;
CREATE TRIGGER trg_inspection_workflow_status_change
AFTER UPDATE OF workflow_status ON public.inspections
FOR EACH ROW
EXECUTE FUNCTION public.log_inspection_workflow_status_change();

-- =====================================================================
-- Done
-- =====================================================================
DO $$ BEGIN RAISE NOTICE '✅ Inspection approval workflow migration completed successfully'; END $$;
