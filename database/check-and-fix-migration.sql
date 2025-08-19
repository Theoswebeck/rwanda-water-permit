-- =============================================
-- Check Current Database State and Fix Migration
-- =============================================

-- =============================================
-- STEP 1: Check what already exists
-- =============================================

-- Check if assessments table exists and its structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'assessments'
ORDER BY ordinal_position;

-- Check current application statuses
SELECT status, COUNT(*) as count 
FROM applications 
GROUP BY status 
ORDER BY count DESC;

-- Check if assessed_at column exists in applications table
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'applications' AND column_name = 'assessed_at';

-- Check enum values
SELECT unnest(enum_range(NULL::application_status)) as status_values;

-- =============================================
-- STEP 2: Safe fixes (run only what's needed)
-- =============================================

-- Only add assessed_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'assessed_at'
    ) THEN
        ALTER TABLE applications ADD COLUMN assessed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Only add indexes if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_application_id'
    ) THEN
        CREATE INDEX idx_assessments_application_id ON assessments(application_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_inspector_id'
    ) THEN
        CREATE INDEX idx_assessments_inspector_id ON assessments(inspector_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_status'
    ) THEN
        CREATE INDEX idx_assessments_status ON assessments(status);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_assigned_at'
    ) THEN
        CREATE INDEX idx_assessments_assigned_at ON assessments(assigned_at);
    END IF;
END $$;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop and recreate trigger to ensure it exists
DROP TRIGGER IF EXISTS update_assessments_updated_at ON assessments;
CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- FINAL VERIFICATION
-- =============================================

-- Verify everything is set up correctly
SELECT 'assessments table' as check_item, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessments') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'assessed_at column', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assessed_at') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END
UNION ALL
SELECT 'pending_assessment enum', 
       CASE WHEN 'pending_assessment' = ANY(enum_range(NULL::application_status)::text[]) 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END;
