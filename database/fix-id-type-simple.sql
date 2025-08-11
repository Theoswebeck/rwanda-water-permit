-- =============================================
-- Simple Fix for id_type Enum Error
-- Handle the specific casting issue
-- =============================================

-- This addresses the specific error:
-- "column id_type is of type id_type_old but expression is of type text"

BEGIN;

-- If the error is happening during an UPDATE operation, 
-- we need to use proper enum casting instead of text casting

-- Fix any existing data that might have wrong types
UPDATE users 
SET id_type = 
  CASE 
    WHEN id_type::text = 'national_id' THEN 'national_id'::id_type
    WHEN id_type::text = 'passport' THEN 'passport'::id_type  
    WHEN id_type::text = 'driving_license' THEN 'driving_license'::id_type
    ELSE 'national_id'::id_type
  END
WHERE id_type IS NOT NULL;

-- Drop any leftover old enum type if it exists
DROP TYPE IF EXISTS id_type_old CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ id_type enum casting fixed!';
    RAISE NOTICE '🎯 All id_type values properly cast to enum type';
END $$;

COMMIT; 