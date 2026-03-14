-- =====================================================================
-- Inspection Approval Workflow Migration
-- Adds multi-stage approval workflow to inspections, mirroring the
-- application approval chain: submitted -> reviewer -> assessor ->
-- reviewer -> verifier -> approver.
-- =====================================================================

-- 1) Add workflow_status column
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'draft';

-- CHECK constraint for valid workflow statuses
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

-- 2) Assignment columns for the approval chain
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_assessor_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_verifier_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_approver_id UUID REFERENCES public.users(id);

-- 3) Assessment tracking
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS assessment_notes TEXT,
  ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMP WITH TIME ZONE;

-- 4) Verification tracking
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- 5) Approval tracking
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- 6) Additional fields
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 7) Indexes for workflow queries
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

-- RLS for inspection_workflow_history
ALTER TABLE public.inspection_workflow_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view inspection workflow history" ON public.inspection_workflow_history;
CREATE POLICY "Staff can view inspection workflow history"
  ON public.inspection_workflow_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('assessor', 'reviewer', 'inspector', 'admin', 'approver', 'verifier')
    )
  );

DROP POLICY IF EXISTS "Staff can insert inspection workflow history" ON public.inspection_workflow_history;
CREATE POLICY "Staff can insert inspection workflow history"
  ON public.inspection_workflow_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('assessor', 'reviewer', 'inspector', 'admin', 'approver', 'verifier')
    )
  );

-- =====================================================================
-- 9) Auto-log workflow_status changes on inspections
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
      auth.uid(),
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
-- 10) Drop the old review-only trigger (too restrictive for new workflow)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_inspections_review_only_update ON public.inspections;
DROP FUNCTION IF EXISTS public.enforce_inspection_review_only_update();

-- =====================================================================
-- 11) Updated RLS policies for multi-role workflow updates
-- =====================================================================

-- Reviewers can update workflow fields
DROP POLICY IF EXISTS "Reviewers can update inspection review fields" ON public.inspections;
DROP POLICY IF EXISTS "Reviewers can update inspection workflow fields" ON public.inspections;
CREATE POLICY "Reviewers can update inspection workflow fields"
  ON public.inspections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('reviewer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('reviewer', 'admin')
    )
  );

-- Assessors can update inspections assigned to them
DROP POLICY IF EXISTS "Assessors can update assigned inspections" ON public.inspections;
CREATE POLICY "Assessors can update assigned inspections"
  ON public.inspections
  FOR UPDATE
  USING (
    assigned_assessor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'assessor'
    )
  )
  WITH CHECK (
    assigned_assessor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'assessor'
    )
  );

-- Verifiers can update inspections in verification
DROP POLICY IF EXISTS "Verifiers can update inspections" ON public.inspections;
CREATE POLICY "Verifiers can update inspections"
  ON public.inspections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('verifier', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('verifier', 'admin')
    )
  );

-- Approvers can update inspections in approval
DROP POLICY IF EXISTS "Approvers can update inspections" ON public.inspections;
CREATE POLICY "Approvers can update inspections"
  ON public.inspections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('approver', 'admin')
    )
  );

-- =====================================================================
-- 12) Backfill existing inspections
-- =====================================================================
UPDATE public.inspections
SET workflow_status = CASE
  WHEN status = 'completed' AND review_status = 'reviewed' THEN 'approved'
  WHEN status = 'completed' AND review_status IS NOT NULL AND review_status != 'reviewed' THEN 'submitted'
  WHEN status = 'completed' THEN 'submitted'
  ELSE 'draft'
END
WHERE workflow_status IS NULL OR workflow_status = 'draft';
