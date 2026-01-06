-- Add pending_assessment status to application_status enum (safe)
-- This represents applications waiting for field/technical assessment.

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pending_assessment';


