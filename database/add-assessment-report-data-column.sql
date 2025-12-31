-- =============================================
-- Add assessment_report_data column to technical_assessments table
-- Stores structured assessment report data following official templates
-- =============================================

ALTER TABLE technical_assessments
ADD COLUMN IF NOT EXISTS assessment_report_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN technical_assessments.assessment_report_data IS
'Structured assessment report data following the official assessment templates.
Includes read-only prefilled application data + assessor-entered fields (water balance, wastewater management, conclusion, etc.).';

UPDATE technical_assessments
SET assessment_report_data = '{}'::jsonb
WHERE assessment_report_data IS NULL;

-- Verify
SELECT id, application_id, assessment_report_data
FROM technical_assessments
LIMIT 5;

-- =============================================
-- Add assessment_report_data column to technical_assessments table
-- This stores structured assessment report data (abstraction or concession format)
-- =============================================

-- Add the assessment_report_data column to store structured report data
ALTER TABLE technical_assessments 
ADD COLUMN IF NOT EXISTS assessment_report_data JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN technical_assessments.assessment_report_data IS 
'Structured assessment report data following the official assessment templates.
For abstraction activities: includes flow rates, water balance, abstraction method, etc.
For concession activities: includes surface area, beacon coordinates, concession boundaries, etc.
Stores both prefilled application data and assessment-specific findings.';

-- Update existing records to have an empty object if NULL
UPDATE technical_assessments 
SET assessment_report_data = '{}'::jsonb 
WHERE assessment_report_data IS NULL;

-- Verification query
SELECT 
    id,
    application_id,
    assessment_number,
    assessment_report_data
FROM technical_assessments 
LIMIT 5;


