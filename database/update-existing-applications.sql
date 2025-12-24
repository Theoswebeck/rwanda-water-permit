-- =============================================
-- Update Existing Approved Applications 
-- Rwanda Water Resources Board Database Update (Part 2)
-- Run this AFTER the main schema update has been committed
-- =============================================

-- First, check if the required columns exist
DO $$
BEGIN
    -- Check if terms_status column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' 
        AND column_name = 'terms_status'
    ) THEN
        RAISE EXCEPTION 'Column terms_status does not exist. Please run the main schema update script first: database/add-approved-pending-permit-status.sql';
    END IF;
    
    -- Check if terms_presented_at column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' 
        AND column_name = 'terms_presented_at'
    ) THEN
        RAISE EXCEPTION 'Column terms_presented_at does not exist. Please run the main schema update script first: database/add-approved-pending-permit-status.sql';
    END IF;
    
    RAISE NOTICE 'All required columns exist. Proceeding with update...';
END $$;

-- Update any existing approved applications to show pending permit status if terms not accepted
UPDATE applications 
SET status = 'approved_pending_permit',
    terms_presented_at = COALESCE(approved_at, NOW()),
    terms_status = 'pending'
WHERE status = 'approved' 
  AND terms_status IS NULL;

-- Show summary of changes
SELECT 
  'Existing applications updated successfully' as status,
  COUNT(*) as total_applications,
  COUNT(CASE WHEN status = 'approved_pending_permit' THEN 1 END) as pending_terms,
  COUNT(CASE WHEN terms_status = 'accepted' THEN 1 END) as terms_accepted,
  COUNT(CASE WHEN terms_status = 'pending' THEN 1 END) as terms_pending
FROM applications; 