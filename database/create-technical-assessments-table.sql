-- =============================================
-- Technical Assessments Table
-- Consolidated Assessor/Reviewer Role Implementation
-- =============================================

-- Create technical assessments table
CREATE TABLE IF NOT EXISTS technical_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    
    -- Assessment metadata
    assessor_id UUID REFERENCES users(id),
    assessment_number VARCHAR(50) UNIQUE,
    
    -- Field report
    field_report_summary TEXT NOT NULL,
    
    -- Assessment checkboxes
    location_verified BOOLEAN DEFAULT FALSE,
    water_source_accessible BOOLEAN DEFAULT FALSE,
    environmental_impact_assessed BOOLEAN DEFAULT FALSE,
    technical_feasibility_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Recommendation
    recommendation VARCHAR(10) NOT NULL CHECK (recommendation IN ('yes', 'no')),
    explanation_text TEXT, -- Required when recommendation is 'no'
    
    -- Inspector details
    inspector_name VARCHAR(255) NOT NULL,
    inspection_date DATE NOT NULL,
    
    -- File attachments
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_explanation_required CHECK (
        (recommendation = 'yes') OR 
        (recommendation = 'no' AND explanation_text IS NOT NULL AND LENGTH(TRIM(explanation_text)) > 0)
    )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_technical_assessments_application_id ON technical_assessments(application_id);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_assessor_id ON technical_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_recommendation ON technical_assessments(recommendation);
CREATE INDEX IF NOT EXISTS idx_technical_assessments_created_at ON technical_assessments(created_at);

-- Add RLS policies
ALTER TABLE technical_assessments ENABLE ROW LEVEL SECURITY;

-- Policy for assessors to view and create their own assessments
CREATE POLICY "Assessors can view and create technical assessments" ON technical_assessments
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('reviewer', 'admin', 'approver')
        )
    );

-- Policy for applicants to view assessments of their applications
CREATE POLICY "Applicants can view assessments of their applications" ON technical_assessments
    FOR SELECT USING (
        application_id IN (
            SELECT id FROM applications 
            WHERE applicant_id = auth.uid()
        )
    );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_technical_assessments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_technical_assessments_updated_at
    BEFORE UPDATE ON technical_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_technical_assessments_updated_at();

-- Generate assessment number trigger
CREATE OR REPLACE FUNCTION generate_assessment_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assessment_number IS NULL THEN
        NEW.assessment_number := 'TA-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                                LPAD(NEXTVAL('assessment_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for assessment numbers
CREATE SEQUENCE IF NOT EXISTS assessment_number_seq START 1;

CREATE TRIGGER trigger_generate_assessment_number
    BEFORE INSERT ON technical_assessments
    FOR EACH ROW
    EXECUTE FUNCTION generate_assessment_number();

-- Add comment
COMMENT ON TABLE technical_assessments IS 'Technical assessments conducted by consolidated assessor/reviewer role';
COMMENT ON COLUMN technical_assessments.recommendation IS 'Technical recommendation: yes (approve) or no (reject)';
COMMENT ON COLUMN technical_assessments.explanation_text IS 'Required explanation when recommendation is no';
COMMENT ON COLUMN technical_assessments.uploaded_files IS 'JSON array of uploaded file paths for detailed reports and photos';
