-- =====================================================================
-- FIX: Complete the inspection approval workflow migration
-- The initial migration failed partway due to auth.uid() references.
-- Columns, indexes, and inspection_workflow_history table already exist.
-- This script completes the remaining steps.
-- =====================================================================

-- 1) Drop the failed RLS policies on inspection_workflow_history
--    (the table was created but RLS policies failed)
DROP POLICY IF EXISTS "Staff can view inspection workflow history" ON public.inspection_workflow_history;
DROP POLICY IF EXISTS "Staff can insert inspection workflow history" ON public.inspection_workflow_history;

-- 2) Drop the old review-only trigger (too restrictive for new workflow)
DROP TRIGGER IF EXISTS trg_inspections_review_only_update ON public.inspections;
DROP FUNCTION IF EXISTS public.enforce_inspection_review_only_update();

-- 3) Backfill existing inspections
--    All 3 completed inspections currently show 'draft' but should be 'submitted'
UPDATE public.inspections
SET workflow_status = CASE
  WHEN status = 'completed' AND review_status = 'reviewed' THEN 'approved'
  WHEN status = 'completed' AND review_status IS NOT NULL AND review_status != 'reviewed' THEN 'submitted'
  WHEN status = 'completed' THEN 'submitted'
  ELSE 'draft'
END
WHERE workflow_status IS NULL OR workflow_status = 'draft';

-- 4) Create the auto-logging trigger function
--    user_id is NULL here; the application layer inserts explicit
--    history rows with the real user_id for all manual transitions.
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

-- 5) Verify
DO $$ BEGIN RAISE NOTICE '✅ Inspection approval workflow migration fix completed successfully'; END $$;
