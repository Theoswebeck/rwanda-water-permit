-- Migration: Restore submitted/pending_assessment flow for inspections
-- Reverses the simplification migration so that inspections go through
-- the full workflow: submitted -> pending_assessment -> pending_review -> ...
--
-- Moves inspections that are in pending_review but have NOT been assigned
-- an assessor and have NOT been reviewed back to submitted.

BEGIN;

UPDATE inspections
SET workflow_status = 'submitted',
    updated_at     = NOW()
WHERE workflow_status = 'pending_review'
  AND assigned_assessor_id IS NULL
  AND reviewed_by IS NULL
  AND review_notes IS NULL;

COMMIT;
