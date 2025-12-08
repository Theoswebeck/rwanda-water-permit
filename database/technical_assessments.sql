-- =============================================
-- Technical Assessments Table for Water Permit System
-- This table stores assessment data from field inspectors
-- =============================================

-- Create technical_assessments table
CREATE TABLE IF NOT EXISTS technical_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign keys
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    assessor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- Assessment identification
    assessment_number TEXT UNIQUE,
    
    -- Document verification (JSON structure)
    -- Format: { "docType": { "status": "verified|incomplete|missing", "notes": "..." } }
    document_verifications JSONB DEFAULT '{}',
    
    -- Field report files (array of file paths in Supabase storage)
    field_report_files TEXT[] DEFAULT '{}',
    field_report_summary TEXT,
    
    -- Verification checklist (from field visit)
    location_verified BOOLEAN DEFAULT FALSE,
    water_source_accessible BOOLEAN DEFAULT FALSE,
    environmental_impact_assessed BOOLEAN DEFAULT FALSE,
    technical_feasibility_confirmed BOOLEAN DEFAULT FALSE,
    infrastructure_adequate BOOLEAN DEFAULT FALSE,
    
    -- Inspector details
    inspector_name TEXT,
    inspection_date DATE,
    
    -- Overall recommendation
    recommendation TEXT CHECK (recommendation IN ('yes', 'no')),
    explanation_text TEXT,
    
    -- Status tracking
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'forwarded_to_approver', 'returned_for_revision')),
    
    -- Workflow tracking
    forwarded_at TIMESTAMPTZ,
    revision_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_technical_assessments_application_id ON technical_assessments(application_id);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_assessor_id ON technical_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_status ON technical_assessments(status);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_created_at ON technical_assessments(created_at DESC);

-- Create function to generate assessment number
CREATE OR REPLACE FUNCTION generate_assessment_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix TEXT;
    sequence_num INTEGER;
    new_number TEXT;
BEGIN
    -- Get current year (last 2 digits)
    year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
    
    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(assessment_number FROM 'TA-' || year_suffix || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO sequence_num
    FROM technical_assessments
    WHERE assessment_number LIKE 'TA-' || year_suffix || '-%';
    
    -- Generate new assessment number
    new_number := 'TA-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 5, '0');
    
    NEW.assessment_number := new_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating assessment number
DROP TRIGGER IF EXISTS trigger_generate_assessment_number ON technical_assessments;
CREATE TRIGGER trigger_generate_assessment_number
    BEFORE INSERT ON technical_assessments
    FOR EACH ROW
    WHEN (NEW.assessment_number IS NULL)
    EXECUTE FUNCTION generate_assessment_number();

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_technical_assessment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_technical_assessment_timestamp ON technical_assessments;
CREATE TRIGGER trigger_update_technical_assessment_timestamp
    BEFORE UPDATE ON technical_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_technical_assessment_timestamp();

-- Enable Row Level Security
ALTER TABLE technical_assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Assessors/Inspectors can view and edit their own assessments
CREATE POLICY "Assessors can manage their assessments"
    ON technical_assessments
    FOR ALL
    USING (
        auth.uid() = assessor_id 
        OR EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'approver', 'inspector', 'reviewer')
        )
    );

-- Allow authenticated users to insert assessments
CREATE POLICY "Authenticated users can create assessments"
    ON technical_assessments
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Approvers and admins can view all assessments
CREATE POLICY "Approvers can view all assessments"
    ON technical_assessments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'approver')
        )
    );

-- Grant permissions
GRANT ALL ON technical_assessments TO authenticated;
GRANT SELECT ON technical_assessments TO anon;

-- Add comment for documentation
COMMENT ON TABLE technical_assessments IS 'Stores field assessment data including document verification, field reports, and recommendations for water permit applications';

