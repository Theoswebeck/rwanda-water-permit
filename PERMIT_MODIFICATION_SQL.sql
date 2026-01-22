-- =============================================
-- PERMIT MODIFICATION FEATURE - DATABASE MIGRATION
-- =============================================
-- Run this SQL in the Supabase SQL Editor
-- This adds support for permit modification tracking
-- =============================================

-- Step 1: Add modification fields to applications table
-- =============================================

-- Add is_modification flag to indicate this application is a modification request
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS is_modification BOOLEAN DEFAULT FALSE;

-- Add reference to the original application being modified
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS modified_from_application_id UUID REFERENCES public.applications(id);

-- Add JSONB column to store the diff of modified fields with previous values
-- Structure: { "fieldName": { "previous": <value>, "current": <value> }, ... }
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS modification_changes JSONB DEFAULT NULL;

-- Add index for faster lookups of modification applications
CREATE INDEX IF NOT EXISTS idx_applications_is_modification 
ON public.applications(is_modification) 
WHERE is_modification = TRUE;

-- Add index for finding modifications of a specific application
CREATE INDEX IF NOT EXISTS idx_applications_modified_from 
ON public.applications(modified_from_application_id) 
WHERE modified_from_application_id IS NOT NULL;

-- Step 2: Add modification field to permits table
-- =============================================

-- Add is_modification flag to permits (similar to is_transfer and is_renewal)
ALTER TABLE public.permits 
ADD COLUMN IF NOT EXISTS is_modification BOOLEAN DEFAULT FALSE;

-- Add index for permits that are modifications
CREATE INDEX IF NOT EXISTS idx_permits_is_modification 
ON public.permits(is_modification) 
WHERE is_modification = TRUE;

-- Step 3: Add 'modification' to application_type enum if not exists
-- =============================================
-- Note: PostgreSQL requires a specific approach to add enum values

DO $$ 
BEGIN
    -- Check if 'modification' value already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'modification' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_type')
    ) THEN
        -- Add the new enum value
        ALTER TYPE application_type ADD VALUE IF NOT EXISTS 'modification';
    END IF;
END $$;

-- Step 4: Add comments for documentation
-- =============================================

COMMENT ON COLUMN public.applications.is_modification IS 
'Flag indicating this application is a modification of an existing permit';

COMMENT ON COLUMN public.applications.modified_from_application_id IS 
'Reference to the original application/permit being modified';

COMMENT ON COLUMN public.applications.modification_changes IS 
'JSONB storing the diff of modified fields. Format: { "fieldName": { "previous": value, "current": value } }';

COMMENT ON COLUMN public.permits.is_modification IS 
'Flag indicating this permit was issued as a modification of a previous permit';

-- Step 5: Verification queries (optional - uncomment to verify)
-- =============================================

-- Verify applications table columns
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'applications' 
-- AND column_name IN ('is_modification', 'modified_from_application_id', 'modification_changes');

-- Verify permits table columns
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'permits' 
-- AND column_name = 'is_modification';

-- Verify enum values
-- SELECT enumlabel FROM pg_enum 
-- WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_type');

-- =============================================
-- END OF MIGRATION
-- =============================================
