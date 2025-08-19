-- Create the missing quarterly_permit_stats table
-- This table seems to be expected by some database trigger or function

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

-- Enable RLS on the quarterly_permit_stats table
ALTER TABLE quarterly_permit_stats ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for quarterly_permit_stats
CREATE POLICY "Admins can view quarterly permit stats" ON quarterly_permit_stats
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver', 'reviewer')
        )
    );

CREATE POLICY "System can insert quarterly permit stats" ON quarterly_permit_stats
    FOR INSERT WITH CHECK (true); -- Allow system to insert

CREATE POLICY "System can update quarterly permit stats" ON quarterly_permit_stats
    FOR UPDATE USING (true); -- Allow system to update

-- Add indexes for performance
CREATE INDEX idx_quarterly_permit_stats_quarter ON quarterly_permit_stats(quarter);
CREATE INDEX idx_quarterly_permit_stats_year ON quarterly_permit_stats(year, quarter_num);
CREATE INDEX idx_quarterly_permit_stats_created_at ON quarterly_permit_stats(created_at);

-- Add trigger for updated_at
CREATE TRIGGER trigger_quarterly_permit_stats_updated_at
    BEFORE UPDATE ON quarterly_permit_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
