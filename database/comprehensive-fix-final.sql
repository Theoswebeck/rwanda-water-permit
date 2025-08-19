-- COMPREHENSIVE FIX FOR PERMITS AND QUARTERLY STATS
-- This addresses all the issues: missing table, column names, and RLS policies

-- ==============================================
-- STEP 1: CREATE MISSING QUARTERLY_PERMIT_STATS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS quarterly_permit_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quarter VARCHAR(7) NOT NULL, -- Format: YYYY-Q1, YYYY-Q2, etc.
    year INTEGER NOT NULL,
    quarter_num INTEGER NOT NULL CHECK (quarter_num BETWEEN 1 AND 4),
    
    -- Permit statistics
    permits_issued INTEGER DEFAULT 0,
    permits_renewed INTEGER DEFAULT 0,
    permits_transferred INTEGER DEFAULT 0,
    permits_revoked INTEGER DEFAULT 0,
    permits_suspended INTEGER DEFAULT 0,
    
    -- Water allocation statistics  
    total_water_allocated DECIMAL(15,2) DEFAULT 0,
    average_permit_duration_days INTEGER DEFAULT 0,
    
    -- Source breakdown
    surface_water_permits INTEGER DEFAULT 0,
    groundwater_permits INTEGER DEFAULT 0,
    borehole_permits INTEGER DEFAULT 0,
    river_permits INTEGER DEFAULT 0,
    lake_permits INTEGER DEFAULT 0,
    spring_permits INTEGER DEFAULT 0,
    
    -- Purpose breakdown
    domestic_permits INTEGER DEFAULT 0,
    industrial_permits INTEGER DEFAULT 0,
    agricultural_permits INTEGER DEFAULT 0,
    commercial_permits INTEGER DEFAULT 0,
    municipal_permits INTEGER DEFAULT 0,
    mining_permits INTEGER DEFAULT 0,
    
    -- Geographic breakdown (by province)
    kigali_permits INTEGER DEFAULT 0,
    northern_permits INTEGER DEFAULT 0,
    southern_permits INTEGER DEFAULT 0,
    eastern_permits INTEGER DEFAULT 0,
    western_permits INTEGER DEFAULT 0,
    
    -- Processing statistics
    average_processing_time_days INTEGER DEFAULT 0,
    applications_approved INTEGER DEFAULT 0,
    applications_rejected INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(year, quarter_num)
);

-- ==============================================
-- STEP 2: FIX APPLICATIONS TABLE COLUMNS
-- ==============================================

-- First, check and fix column names in applications table
DO $$ 
BEGIN
    -- Handle assigned_inspector_id -> assigned_assessor_id migration
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_inspector_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_assessor_id') THEN
        ALTER TABLE applications RENAME COLUMN assigned_inspector_id TO assigned_assessor_id;
    END IF;
    
    -- Add missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_assessor_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_assessor_id UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_reviewer_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_reviewer_id UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_approver_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_approver_id UUID REFERENCES users(id);
    END IF;
END $$;

-- ==============================================
-- STEP 3: ENABLE RLS AND SET UP POLICIES
-- ==============================================

-- Enable RLS on quarterly_permit_stats
ALTER TABLE quarterly_permit_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing conflicting policies (avoid errors if they don't exist)
DROP POLICY IF EXISTS "Staff can create permits for approved applications" ON permits;
DROP POLICY IF EXISTS "Staff can update permits" ON permits;
DROP POLICY IF EXISTS "Users can update their own applications for terms acceptance" ON applications;
DROP POLICY IF EXISTS "Staff can update applications for final approval" ON applications;

-- Quarterly permit stats policies
CREATE POLICY "Admins can view quarterly permit stats" ON quarterly_permit_stats
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver', 'reviewer')
        )
    );

CREATE POLICY "System can manage quarterly permit stats" ON quarterly_permit_stats
    FOR ALL USING (true); -- Allow system operations

-- Permits policies
CREATE POLICY "Staff can create permits for approved applications" ON permits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        ) OR
        -- Allow users to create permits for their own applications during terms acceptance
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = application_id AND applicant_id = auth.uid() AND status = 'pending_final_approval'
        )
    );

CREATE POLICY "Staff can update permits" ON permits
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver')
        )
    );

-- Applications policies for terms acceptance
CREATE POLICY "Users can update their own applications for terms acceptance" ON applications
    FOR UPDATE USING (
        auth.uid() = applicant_id AND 
        (
            status IN ('draft', 'revision_required') OR 
            -- Allow terms acceptance updates
            (status = 'pending_final_approval' AND (terms_status IS NULL OR terms_status = 'pending'))
        )
    );

-- Staff can update applications in workflow
CREATE POLICY "Staff can update applications for final approval" ON applications
    FOR UPDATE USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_assessor_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role IN ('admin', 'reviewer', 'inspector', 'approver')
         )) AND
        status NOT IN ('cancelled')
    );

-- ==============================================
-- STEP 4: ADD INDEXES AND TRIGGERS
-- ==============================================

-- Indexes for quarterly_permit_stats
CREATE INDEX IF NOT EXISTS idx_quarterly_permit_stats_quarter ON quarterly_permit_stats(quarter);
CREATE INDEX IF NOT EXISTS idx_quarterly_permit_stats_year ON quarterly_permit_stats(year, quarter_num);
CREATE INDEX IF NOT EXISTS idx_quarterly_permit_stats_created_at ON quarterly_permit_stats(created_at);

-- Trigger for quarterly_permit_stats updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_quarterly_permit_stats_updated_at') THEN
        CREATE TRIGGER trigger_quarterly_permit_stats_updated_at
            BEFORE UPDATE ON quarterly_permit_stats
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
