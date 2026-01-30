-- =============================================
-- RETURNED STATUS MIGRATION
-- =============================================
-- This migration adds new application statuses for tracking
-- when applications are returned to assessors, reviewers, or verifiers
-- for corrections.
--
-- New statuses:
--   - returned_to_assessment: Application returned to assessor by reviewer/verifier
--   - returned_to_review: Application returned to reviewer by verifier/approver
--   - returned_to_verification: Application returned to verifier by approver
--
-- Run this SQL in Supabase SQL Editor
-- =============================================

-- Step 1: Add new enum values to application_status type
-- Note: PostgreSQL enum values can be added but not easily removed

-- Add returned_to_assessment status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'returned_to_assessment' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
    ) THEN
        ALTER TYPE application_status ADD VALUE 'returned_to_assessment';
    END IF;
END $$;

-- Add returned_to_review status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'returned_to_review' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
    ) THEN
        ALTER TYPE application_status ADD VALUE 'returned_to_review';
    END IF;
END $$;

-- Add returned_to_verification status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'returned_to_verification' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
    ) THEN
        ALTER TYPE application_status ADD VALUE 'returned_to_verification';
    END IF;
END $$;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Verify the new enum values exist
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
ORDER BY enumsortorder;

-- =============================================
-- WORKFLOW SUMMARY
-- =============================================
-- 
-- When applications are returned:
--
-- 1. Reviewer returns to Assessor:
--    Status: returned_to_assessment
--    The assessor sees this in their "Applications for Assessment" tab
--
-- 2. Verifier returns to Reviewer:
--    Status: returned_to_review  
--    The reviewer sees this in their "Applications for Review" tab
--
-- 3. Approver returns to Verifier:
--    Status: returned_to_verification
--    The verifier sees this in their "Applications for Verification" tab
--
-- The returned statuses are clearly distinguished from new applications
-- with a 🔄 emoji prefix in the status badges.
-- =============================================
