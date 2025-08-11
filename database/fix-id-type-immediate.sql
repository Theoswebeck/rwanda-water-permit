-- =============================================
-- Immediate Fix for id_type Enum Error
-- Quick fix without data preservation
-- =============================================

-- This is a quick fix when the enum is corrupted and we just need to reset it
-- WARNING: This will reset all id_type values to NULL

BEGIN;

-- Step 1: Drop the problematic column completely
ALTER TABLE users DROP COLUMN IF EXISTS id_type;

-- Step 2: Clean up any old enum types
DROP TYPE IF EXISTS id_type_old CASCADE;
DROP TYPE IF EXISTS id_type CASCADE;

-- Step 3: Recreate the enum type
CREATE TYPE id_type AS ENUM ('national_id', 'passport', 'driving_license');

-- Step 4: Add the column back
ALTER TABLE users ADD COLUMN id_type id_type;

-- Step 5: Set default values for existing users (optional)
-- Uncomment the next line if you want to set a default value
-- UPDATE users SET id_type = 'national_id' WHERE id_type IS NULL;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ id_type enum reset successfully!';
    RAISE NOTICE '🔧 Column recreated with clean enum type';
    RAISE NOTICE '⚠️  All id_type values have been reset to NULL';
    RAISE NOTICE '📝 You may need to update user records with correct ID types';
END $$;

COMMIT; 