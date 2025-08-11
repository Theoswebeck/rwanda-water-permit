-- =============================================
-- Add approved_pending_permit status and Terms & Conditions fields
-- Rwanda Water Board Database Update
-- =============================================

-- Add the new status to the enum (must be committed before use)
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'approved_pending_permit';

-- Add Terms & Conditions tracking fields to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS terms_presented_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS terms_status VARCHAR(50);

-- Add permit PDF field to permits table
ALTER TABLE permits 
ADD COLUMN IF NOT EXISTS permit_pdf_url VARCHAR(500);

-- Create index for better performance on terms status
CREATE INDEX IF NOT EXISTS idx_applications_terms_status ON applications(terms_status);
CREATE INDEX IF NOT EXISTS idx_applications_status_terms ON applications(status, terms_status);

-- Add helpful comments
COMMENT ON COLUMN applications.terms_presented_at IS 'When terms and conditions were first presented to applicant';
COMMENT ON COLUMN applications.terms_accepted_at IS 'When applicant accepted the terms and conditions';
COMMENT ON COLUMN applications.terms_status IS 'Status of terms acceptance: pending, accepted, rejected';
COMMENT ON COLUMN permits.permit_pdf_url IS 'URL or path to the generated permit PDF document';

-- Show current status
SELECT 
  'Database schema updated successfully' as status,
  'New enum value approved_pending_permit added' as enum_status,
  'Terms tracking fields added to applications table' as fields_status,
  'Permit PDF field added to permits table' as permits_status;

-- Note: To update existing approved applications to approved_pending_permit status,
-- run this command in a separate transaction after committing the above changes:
-- 
-- UPDATE applications 
-- SET status = 'approved_pending_permit',
--     terms_presented_at = approved_at,
--     terms_status = 'pending'
-- WHERE status = 'approved' 
--   AND terms_status IS NULL; 