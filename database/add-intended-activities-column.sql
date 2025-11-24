-- =============================================
-- Add intended_activities column to applications table
-- This stores the array of activities selected in the form
-- =============================================

-- Add the intended_activities column to store form data
ALTER TABLE applications ADD COLUMN IF NOT EXISTS intended_activities JSONB DEFAULT '[]'::jsonb;

-- Add index for JSONB column for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_intended_activities 
ON applications USING GIN (intended_activities);

-- Add comment to explain the column
COMMENT ON COLUMN applications.intended_activities IS 
'Array of intended activities selected in the application form (e.g., ["irrigation", "fish_farming_lakes"]). 
This complements water_purpose and application_type fields for more granular activity tracking.';

-- Update existing records to have an empty array if NULL
UPDATE applications 
SET intended_activities = '[]'::jsonb 
WHERE intended_activities IS NULL;

-- Verification query
SELECT 
    id,
    application_number,
    water_purpose,
    application_type,
    intended_activities
FROM applications 
LIMIT 5;

