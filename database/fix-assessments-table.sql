-- =============================================
-- Fix Assessments Table Structure
-- =============================================

-- First, let's check what columns exist in the assessments table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'assessments' 
ORDER BY ordinal_position;

-- =============================================
-- Add missing columns to assessments table
-- =============================================

-- Add assigned_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE assessments ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Add other potentially missing columns
DO $$ 
BEGIN
    -- Add completed_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE assessments ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add due_date if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'due_date'
    ) THEN
        ALTER TABLE assessments ADD COLUMN due_date TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add application_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'application_id'
    ) THEN
        ALTER TABLE assessments ADD COLUMN application_id UUID REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
    
    -- Add inspector_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'inspector_id'
    ) THEN
        ALTER TABLE assessments ADD COLUMN inspector_id UUID REFERENCES users(id);
    END IF;
    
    -- Add status if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'status'
    ) THEN
        ALTER TABLE assessments ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
    END IF;
    
    -- Add overall_comments if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'overall_comments'
    ) THEN
        ALTER TABLE assessments ADD COLUMN overall_comments TEXT;
    END IF;
END $$;

-- =============================================
-- Now add indexes safely
-- =============================================

DO $$ 
BEGIN
    -- Only create indexes if the columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'application_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_application_id'
    ) THEN
        CREATE INDEX idx_assessments_application_id ON assessments(application_id);
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'inspector_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_inspector_id'
    ) THEN
        CREATE INDEX idx_assessments_inspector_id ON assessments(inspector_id);
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'status'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_status'
    ) THEN
        CREATE INDEX idx_assessments_status ON assessments(status);
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assessments' AND column_name = 'assigned_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'assessments' AND indexname = 'idx_assessments_assigned_at'
    ) THEN
        CREATE INDEX idx_assessments_assigned_at ON assessments(assigned_at);
    END IF;
END $$;

-- =============================================
-- Add assessed_at to applications table
-- =============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'assessed_at'
    ) THEN
        ALTER TABLE applications ADD COLUMN assessed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- =============================================
-- Final verification
-- =============================================

-- Check assessments table structure
SELECT 'Assessments table columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'assessments' 
ORDER BY ordinal_position;

-- Check if assessed_at was added to applications
SELECT 'Applications assessed_at column:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'applications' AND column_name = 'assessed_at';

-- Verify migration status
SELECT 'Migration Complete!' as status,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'assigned_at')
            AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assessed_at')
            THEN '✅ Ready to use new workflow'
            ELSE '❌ Some components missing'
       END as result;



