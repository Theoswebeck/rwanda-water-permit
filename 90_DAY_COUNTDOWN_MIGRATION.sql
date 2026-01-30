-- =============================================
-- 90-Day Countdown Migration
-- =============================================
-- IMPORTANT: Run this migration in your Supabase SQL Editor
-- 
-- This changes the 90-day countdown to start from when
-- "Confirm Completeness and Lock" button is triggered
-- instead of from application submission date
-- =============================================

-- Step 1: Add completeness_confirmed_at column to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS completeness_confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Add comment explaining the field
COMMENT ON COLUMN applications.completeness_confirmed_at IS 
'Timestamp when the assessor confirmed document completeness and locked the application. This triggers the 90-day deadline countdown.';

-- Step 3: Create an index for efficient querying of applications with pending deadlines
CREATE INDEX IF NOT EXISTS idx_applications_completeness_confirmed_at 
ON applications (completeness_confirmed_at) 
WHERE completeness_confirmed_at IS NOT NULL;

-- Step 4: (Optional) Backfill existing applications that were already confirmed
-- This updates applications where docReviewMeta indicates completenessConfirmed = true
-- by checking the assessments table's document_verifications->>'__meta' field
-- 
-- ⚠️ UNCOMMENT AND RUN THIS ONLY if you want to backfill existing confirmed applications
-- This will populate completeness_confirmed_at for applications that were already
-- marked as complete in the old system

/*
UPDATE applications a
SET completeness_confirmed_at = (
  SELECT (document_verifications->'__meta'->>'completenessConfirmedAt')::timestamptz
  FROM assessments ass
  WHERE ass.application_id = a.id
    AND ass.document_verifications->'__meta'->>'completenessConfirmed' = 'true'
  LIMIT 1
)
WHERE a.completeness_confirmed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM assessments ass
    WHERE ass.application_id = a.id
      AND ass.document_verifications->'__meta'->>'completenessConfirmed' = 'true'
  );

-- Check how many applications were backfilled
SELECT COUNT(*) AS backfilled_count 
FROM applications 
WHERE completeness_confirmed_at IS NOT NULL;
*/

-- =============================================
-- Verification Queries
-- =============================================

-- Check the new column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'applications' 
  AND column_name = 'completeness_confirmed_at';

-- View applications with their 90-day status
-- (after backfill, this shows which applications have the countdown started)
/*
SELECT 
  application_number,
  status,
  submitted_at,
  completeness_confirmed_at,
  CASE 
    WHEN completeness_confirmed_at IS NULL THEN 'Not Started'
    WHEN completeness_confirmed_at + INTERVAL '90 days' < NOW() THEN 'Overdue'
    WHEN completeness_confirmed_at + INTERVAL '90 days' - NOW() < INTERVAL '7 days' THEN 'Due Soon'
    ELSE 'On Track'
  END AS deadline_status,
  EXTRACT(DAY FROM (completeness_confirmed_at + INTERVAL '90 days' - NOW())) AS days_remaining
FROM applications
WHERE status NOT IN ('draft', 'cancelled', 'rejected', 'approved')
ORDER BY completeness_confirmed_at NULLS LAST;
*/
