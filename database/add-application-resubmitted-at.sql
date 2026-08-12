-- ============================================================================
-- Add applications.resubmitted_at
-- ----------------------------------------------------------------------------
-- When an application is returned for revision and the applicant fixes and
-- resubmits it, the app now records the LATEST (re)submission timestamp here.
-- `submitted_at` intentionally keeps the ORIGINAL submission date because it
-- drives the 6-month application-expiration window and the audit trail.
--
-- All staff tables / detail pages / applicant views display
-- COALESCE(resubmitted_at, submitted_at, created_at) via
-- lib/application-sorting.ts:getEffectiveSubmissionDate().
--
-- The application code TOLERATES this column being absent (writes are dropped
-- by the PATCH route's missing-column retry loop and reads fall back to
-- submitted_at), but the resubmission date will only start updating once this
-- migration has been applied.
--
-- Run against the production database (and cherry-pick to UAT):
--   psql "$DATABASE_URL" -f database/add-application-resubmitted-at.sql
-- ============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;

COMMENT ON COLUMN public.applications.resubmitted_at IS
  'Latest applicant resubmission after a return-for-revision. submitted_at keeps the original submission date (expiration window). Displays use COALESCE(resubmitted_at, submitted_at, created_at).';

-- ----------------------------------------------------------------------------
-- Backfill: for applications that were already resubmitted in the past, take
-- the most recent workflow transition OUT of revision_required back into the
-- pipeline (trigger log_application_status_change writes these rows).
-- ----------------------------------------------------------------------------
UPDATE public.applications a
SET resubmitted_at = wh.last_resubmitted_at
FROM (
  SELECT application_id, MAX(created_at) AS last_resubmitted_at
  FROM public.workflow_history
  WHERE from_status = 'revision_required'
    AND to_status IN ('submitted', 'pending_assessment', 'under_review')
  GROUP BY application_id
) wh
WHERE wh.application_id = a.id
  AND a.resubmitted_at IS NULL;
