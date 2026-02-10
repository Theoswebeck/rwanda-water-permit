-- Migration: Add approval_conditions column to applications table
-- This column stores optional conditions that an approver can add when approving an application

-- Add the approval_conditions column
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS approval_conditions TEXT;

-- Add a comment describing the column
COMMENT ON COLUMN applications.approval_conditions IS 'Optional conditions set by approver when approving an application';
