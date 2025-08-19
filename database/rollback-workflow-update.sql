-- =============================================
-- Rwanda Water Board (RWB) Water Permit System
-- ROLLBACK Script for New Workflow Assessment Phase
-- =============================================
-- 
-- Use this script to rollback the workflow changes if needed
-- CAUTION: This will remove all assessment data
--
-- =============================================

-- Step 1: Migrate any 'pending_assessment' applications back to 'pending_inspection'
-- (Note: You'll need to add the old enum value back first)
ALTER TYPE application_status ADD VALUE 'pending_inspection';

UPDATE applications 
SET status = 'pending_inspection' 
WHERE status = 'pending_assessment';

-- Step 2: Remove the assessment table and all related data
-- CAUTION: This will permanently delete all assessment records
DROP TABLE IF EXISTS assessments CASCADE;

-- Step 3: Remove the assessed_at column from applications
ALTER TABLE applications DROP COLUMN IF EXISTS assessed_at;

-- Step 4: Remove the new enum value
-- Note: This might fail if any records still reference it
-- ALTER TYPE application_status DROP VALUE 'pending_assessment';

-- =============================================
-- Verification Queries:
-- =============================================
-- Run these to verify the rollback was successful:
--
-- SELECT status, COUNT(*) FROM applications GROUP BY status;
-- SELECT COUNT(*) FROM assessments; -- Should return 0 or error if table doesn't exist
--
-- =============================================
