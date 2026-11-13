-- Add report_completed flag to technical_assessments
-- Tracks whether the assessor has explicitly completed the assessment report.
-- When true, contract and permit preview tabs are unlocked on the assessment page.
ALTER TABLE technical_assessments
ADD COLUMN IF NOT EXISTS report_completed BOOLEAN DEFAULT false;
