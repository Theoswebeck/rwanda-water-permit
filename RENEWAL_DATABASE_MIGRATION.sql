-- ============================================
-- RENEWAL FEATURE DATABASE MIGRATION
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- Add renewal-related columns to the applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS is_renewal BOOLEAN DEFAULT FALSE;

ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS renewed_from_permit_id UUID REFERENCES permits(id);

-- Add renewal tracking to permits table
ALTER TABLE permits 
ADD COLUMN IF NOT EXISTS is_renewal BOOLEAN DEFAULT FALSE;

-- Add renewal_request_letter to document_type enum if it doesn't exist
DO $$ 
BEGIN
    -- Check if the enum value exists, if not add it
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'renewal_request_letter' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')
    ) THEN
        ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'renewal_request_letter';
    END IF;
EXCEPTION
    WHEN others THEN
        -- If document_type is not an enum or doesn't exist, that's okay
        NULL;
END $$;

-- Create index for faster renewal lookups
CREATE INDEX IF NOT EXISTS idx_applications_is_renewal ON applications(is_renewal) WHERE is_renewal = TRUE;
CREATE INDEX IF NOT EXISTS idx_applications_renewed_from_permit ON applications(renewed_from_permit_id) WHERE renewed_from_permit_id IS NOT NULL;

-- Verify the columns were added
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'applications' 
AND column_name IN ('is_renewal', 'renewed_from_permit_id')
ORDER BY column_name;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE 'Renewal columns added successfully!';
END $$;
