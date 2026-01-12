-- Migration: Add permit length (proposed_duration_years) column to applications table
-- Date: 2026-01-12
-- Description: Adds the permit length field for applicants to request permit duration (1-15 years)
--              Assessors can modify this value during the assessment process

-- Add permit length column if not exists
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS proposed_duration_years INTEGER;

-- Add constraint to ensure valid permit duration (1-15 years)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_proposed_duration_years_range'
    ) THEN
        ALTER TABLE applications 
        ADD CONSTRAINT chk_proposed_duration_years_range 
        CHECK (proposed_duration_years IS NULL OR (proposed_duration_years >= 1 AND proposed_duration_years <= 15));
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN applications.proposed_duration_years IS 'Requested permit duration in years (1-15). Set by applicant, can be adjusted by assessor during assessment.';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_applications_proposed_duration_years 
ON applications(proposed_duration_years) 
WHERE proposed_duration_years IS NOT NULL;



