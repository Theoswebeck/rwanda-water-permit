-- =============================================
-- Rwanda Water Board (RWB) Water Permit System
-- Schema Update for New Workflow: Assessment Phase
-- =============================================
-- 
-- New Workflow: draft → submitted → review → assessment → approve → issue permit → inspection
--
-- Changes:
-- 1. Update application_status enum to replace 'pending_inspection' with 'pending_assessment'
-- 2. Add assessments table for inspector technical assessments
-- 3. Update the workflow to separate assessment (pre-approval) from inspection (post-permit)
--
-- =============================================

-- Step 1: Add the new status to the enum first
ALTER TYPE application_status ADD VALUE 'pending_assessment';

-- Note: In PostgreSQL, after adding an enum value, you need to commit the transaction
-- before using it. If running in a single transaction, you may need to run this in parts.

-- Step 2: Update any existing applications from old status to new status
-- (Run this in a separate transaction or after committing the enum change)
UPDATE applications 
SET status = 'pending_assessment' 
WHERE status = 'pending_inspection';

-- Step 3: Create the assessments table for technical assessments
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES users(id),
    
    -- Assessment details
    assessment_stage VARCHAR(50) NOT NULL DEFAULT 'technical', -- 'technical', 'environmental', 'feasibility'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'escalated'
    
    -- Technical Assessment
    technical_feasibility BOOLEAN,
    technical_comments TEXT,
    site_accessibility BOOLEAN,
    infrastructure_adequacy BOOLEAN,
    
    -- Environmental Assessment
    environmental_impact_level risk_assessment, -- reusing existing enum
    environmental_comments TEXT,
    mitigation_required BOOLEAN,
    
    -- Water Source Assessment
    source_reliability BOOLEAN,
    source_capacity_adequate BOOLEAN,
    source_quality_acceptable BOOLEAN,
    water_rights_clear BOOLEAN,
    
    -- Overall Assessment
    overall_recommendation recommendation_type, -- reusing existing enum
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

-- Step 4: Add indexes for better performance
CREATE INDEX idx_assessments_application_id ON assessments(application_id);
CREATE INDEX idx_assessments_inspector_id ON assessments(inspector_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_assigned_at ON assessments(assigned_at);

-- Step 5: Add a field to applications table to track assessment
ALTER TABLE applications ADD COLUMN assessed_at TIMESTAMP WITH TIME ZONE;

-- Step 6: Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Remove the old status value (CAREFUL: This will fail if any records still use it)
-- We'll keep this commented for safety - run manually after confirming no records use the old status
-- ALTER TYPE application_status DROP VALUE 'pending_inspection';

-- =============================================
-- Data Migration Notes:
-- =============================================
-- 1. All existing 'pending_inspection' applications are now 'pending_assessment'
-- 2. The inspections table remains for post-permit inspections
-- 3. The new assessments table handles pre-approval technical assessments
-- 4. Applications now have two inspection phases:
--    - Assessment (pre-approval): technical feasibility by inspector
--    - Inspection (post-permit): compliance monitoring of active permits
--
-- =============================================
-- Post-Migration Steps:
-- =============================================
-- 1. Verify no applications have 'pending_inspection' status
-- 2. Update application workflows in code to use 'pending_assessment'
-- 3. Train inspectors on the new dual-role workflow
-- 4. Test the complete workflow from draft to post-permit inspection
