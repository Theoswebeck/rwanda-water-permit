-- =============================================
-- Rwanda Water Board (RWB) Water Permit System
-- Step-by-Step Migration for New Workflow
-- =============================================
-- 
-- Run these steps one by one in the Supabase SQL Editor
-- Each step should be run separately to avoid enum transaction issues
--
-- =============================================

-- =============================================
-- STEP 1: Add new enum value (Run this first)
-- =============================================
ALTER TYPE application_status ADD VALUE 'pending_assessment';

-- =============================================
-- STEP 2: Update existing data (Run this after Step 1)
-- =============================================
UPDATE applications 
SET status = 'pending_assessment' 
WHERE status = 'pending_inspection';

-- =============================================
-- STEP 3: Create assessments table (Run this after Step 2)
-- =============================================
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES users(id),
    
    -- Assessment details
    assessment_stage VARCHAR(50) NOT NULL DEFAULT 'technical',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Technical Assessment
    technical_feasibility BOOLEAN,
    technical_comments TEXT,
    site_accessibility BOOLEAN,
    infrastructure_adequacy BOOLEAN,
    
    -- Environmental Assessment
    environmental_impact_level risk_assessment,
    environmental_comments TEXT,
    mitigation_required BOOLEAN,
    
    -- Water Source Assessment
    source_reliability BOOLEAN,
    source_capacity_adequate BOOLEAN,
    source_quality_acceptable BOOLEAN,
    water_rights_clear BOOLEAN,
    
    -- Overall Assessment
    overall_recommendation recommendation_type,
    conditions_required JSONB,
    overall_comments TEXT,
    
    -- Decision timeline
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    
    -- Quality metrics
    assessment_score DECIMAL(3,2),
    field_visit_required BOOLEAN DEFAULT false,
    field_visit_completed BOOLEAN DEFAULT false,
    field_visit_date TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- STEP 4: Add indexes and table modifications (Run this after Step 3)
-- =============================================
-- Add indexes for better performance
CREATE INDEX idx_assessments_application_id ON assessments(application_id);
CREATE INDEX idx_assessments_inspector_id ON assessments(inspector_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_assigned_at ON assessments(assigned_at);

-- Add field to applications table to track assessment
ALTER TABLE applications ADD COLUMN assessed_at TIMESTAMP WITH TIME ZONE;

-- =============================================
-- STEP 5: Create triggers (Run this after Step 4)
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Run these to verify the migration was successful:

-- Check if the new enum value exists
-- SELECT unnest(enum_range(NULL::application_status));

-- Check if any applications use the old status
-- SELECT status, COUNT(*) FROM applications GROUP BY status;

-- Check if the assessments table was created
-- SELECT COUNT(*) FROM assessments;

-- Check if the new column was added
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'applications' AND column_name = 'assessed_at';
