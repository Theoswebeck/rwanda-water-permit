-- =============================================
-- 🔧 INTENDED ACTIVITIES FIX - DATABASE MIGRATION
-- Run this SQL in Supabase SQL Editor
-- =============================================

-- Step 1: Add the intended_activities column to store form data
ALTER TABLE applications ADD COLUMN IF NOT EXISTS intended_activities JSONB DEFAULT '[]'::jsonb;

-- Step 2: Add index for JSONB column for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_intended_activities 
ON applications USING GIN (intended_activities);

-- Step 3: Add comment to explain the column
COMMENT ON COLUMN applications.intended_activities IS 
'Array of intended activities selected in the application form (e.g., ["irrigation", "fish_farming_lakes"]). 
This complements water_purpose and application_type fields for more granular activity tracking.';

-- Step 4: Update existing records to have an empty array if NULL
UPDATE applications 
SET intended_activities = '[]'::jsonb 
WHERE intended_activities IS NULL;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Check if column was added successfully
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'applications' 
AND column_name = 'intended_activities';

-- Check if index was created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'applications' 
AND indexname = 'idx_applications_intended_activities';

-- View sample data (first 5 records)
SELECT 
    id,
    application_number,
    water_purpose,
    application_type,
    intended_activities,
    status
FROM applications 
LIMIT 5;

-- =============================================
-- SUCCESS! 
-- If all queries run without errors, the fix is complete.
-- You can now test the application.
-- =============================================

