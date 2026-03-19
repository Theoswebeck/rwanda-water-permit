-- Sync workflow_status for water use reports that were submitted
-- before the workflow_status column was introduced (migration 20260318000000).
-- Those records have status = 'submitted' but workflow_status stuck at 'draft'.

UPDATE public.water_use_reports
SET workflow_status = status,
    updated_at = NOW()
WHERE workflow_status = 'draft'
  AND status != 'draft';
