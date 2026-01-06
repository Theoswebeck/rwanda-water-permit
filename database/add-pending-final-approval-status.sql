-- Add pending_final_approval status to application_status enum
-- This represents applications that have completed review and inspection
-- and are ready for final approval decision by the approver

-- Add the new status to the enum
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pending_final_approval';

-- Update any existing applications that should be in this status
-- (Applications that are currently under_review but have completed inspections)
DO $$
BEGIN
  IF to_regclass('public.inspections') IS NOT NULL THEN
    UPDATE applications
    SET status = 'pending_final_approval'
    WHERE status = 'under_review'
      AND id IN (
        SELECT application_id
        FROM inspections
        WHERE status = 'completed'
          AND result IS NOT NULL
      );
  ELSE
    RAISE NOTICE 'Skipping status migration: public.inspections does not exist.';
  END IF;
END $$;

-- Add helpful comment
COMMENT ON TYPE application_status IS 'Application workflow statuses: draft -> submitted -> under_review -> pending_inspection -> pending_final_approval -> approved/rejected'; 