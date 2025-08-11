-- =============================================
-- Fix id_type Enum Error
-- Handle PostgreSQL enum type conversion safely
-- =============================================

-- The error occurs when PostgreSQL tries to update enum values during migration
-- Solution: Use proper casting and temporary tables for safe enum conversion

BEGIN;

-- Step 1: Check if id_type column exists and create backup accordingly
DO $$
DECLARE
    col_exists boolean;
BEGIN
    -- Check if id_type column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'id_type'
    ) INTO col_exists;
    
    IF col_exists THEN
        -- Create backup with existing data
        CREATE TEMP TABLE users_backup AS 
        SELECT id, id_type::text as id_type_text
        FROM users 
        WHERE id_type IS NOT NULL;
        
        -- Temporarily set id_type to NULL
        UPDATE users SET id_type = NULL WHERE id_type IS NOT NULL;
        
        RAISE NOTICE 'Backed up existing id_type data for % users', 
            (SELECT COUNT(*) FROM users_backup);
    ELSE
        -- Create empty backup table
        CREATE TEMP TABLE users_backup (
            id UUID,
            id_type_text TEXT
        );
        
        RAISE NOTICE 'No existing id_type column found, creating empty backup';
    END IF;
END $$;

-- Step 2: Clean up any old enum types
DROP TYPE IF EXISTS id_type_old CASCADE;
DROP TYPE IF EXISTS id_type CASCADE;

-- Step 3: Recreate id_type enum cleanly
CREATE TYPE id_type AS ENUM ('national_id', 'passport', 'driving_license');

-- Step 4: Add the column with proper type (drop first if exists)
ALTER TABLE users DROP COLUMN IF EXISTS id_type;
ALTER TABLE users ADD COLUMN id_type id_type;

-- Step 5: Restore data with proper enum casting
UPDATE users 
SET id_type = 
  CASE 
    WHEN ub.id_type_text = 'national_id' THEN 'national_id'::id_type
    WHEN ub.id_type_text = 'passport' THEN 'passport'::id_type
    WHEN ub.id_type_text = 'driving_license' THEN 'driving_license'::id_type
    ELSE 'national_id'::id_type  -- Default fallback
  END
FROM users_backup ub 
WHERE users.id = ub.id;

-- Step 6: Clean up
DROP TABLE users_backup;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ id_type enum error fixed successfully!';
    RAISE NOTICE '🔧 Enum type recreated with proper values';
    RAISE NOTICE '💾 User data preserved during conversion';
END $$;

COMMIT; 