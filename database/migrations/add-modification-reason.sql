-- =============================================
-- ADD MODIFICATION REASON COLUMN
-- =============================================
-- Purpose:
-- - Allow applicants to provide a justification for permit modification requests.
-- - This field is displayed to staff (assessors, reviewers, verifiers, approvers)
--   when reviewing modification applications.
-- =============================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS modification_reason TEXT;

COMMENT ON COLUMN applications.modification_reason IS 'Applicant-provided justification for why the permit modification is being requested.';
