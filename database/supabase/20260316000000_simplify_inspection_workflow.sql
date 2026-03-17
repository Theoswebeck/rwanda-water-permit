-- Migration: Simplify inspection workflow
-- Removes the assignment bottleneck by migrating inspections stuck in
-- obsolete workflow states (submitted, pending_assessment, under_assessment)
-- directly to pending_review.

BEGIN;

UPDATE inspections
SET workflow_status = 'pending_review',
    updated_at     = NOW()
WHERE workflow_status IN ('submitted', 'pending_assessment', 'under_assessment');

COMMIT;
