-- =============================================
-- Consolidate Assessor and Reviewer Roles
-- Meeting Requirements Implementation
-- =============================================

-- Note: This script consolidates reviewer and inspector roles into a single 'assessor' role
-- However, to maintain backward compatibility, we'll keep 'reviewer' as the primary role name
-- and update the system to treat 'reviewer' as the consolidated assessor/reviewer role

-- Update application status enum to reflect new workflow
-- Remove 'pending_inspection' status as inspection is now part of assessment
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pending_assessment';

-- Update user role descriptions in comments
COMMENT ON TYPE user_role IS 'User roles: applicant, reviewer (consolidated assessor/reviewer), admin, approver. Inspector role deprecated.';

-- Update applications table to reflect consolidated workflow
-- Add assessor_id column (using existing assigned_reviewer_id)
-- Keep assigned_inspector_id for backward compatibility but mark as deprecated

-- Add assessment-related fields to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS assessment_recommendation VARCHAR(10) CHECK (assessment_recommendation IN ('yes', 'no')),
ADD COLUMN IF NOT EXISTS assessment_notes TEXT;

-- Create view for consolidated assessment workflow
CREATE OR REPLACE VIEW assessment_applications AS
SELECT 
    a.*,
    u.first_name as applicant_first_name,
    u.last_name as applicant_last_name,
    u.company_name as applicant_company_name,
    u.email as applicant_email,
    r.first_name as assessor_first_name,
    r.last_name as assessor_last_name,
    r.email as assessor_email,
    CASE 
        WHEN a.status = 'submitted' THEN 'New Submission'
        WHEN a.status = 'under_review' THEN 'Under Assessment'
        WHEN a.status = 'pending_assessment' THEN 'Pending Field Assessment'
        WHEN a.status = 'pending_final_approval' THEN 'Ready for Approval'
        WHEN a.status = 'revision_required' THEN 'Revision Required'
        ELSE a.status
    END as status_display
FROM applications a
LEFT JOIN users u ON a.applicant_id = u.id
LEFT JOIN users r ON a.assigned_reviewer_id = r.id
WHERE a.status IN ('submitted', 'under_review', 'pending_assessment', 'pending_final_approval', 'revision_required');

-- Update RLS policies for consolidated role
-- Drop old inspector-specific policies if they exist
DROP POLICY IF EXISTS "Inspectors can view assigned applications" ON applications;
DROP POLICY IF EXISTS "Inspectors can update inspection status" ON applications;

-- Create new assessor policies (using reviewer role)
CREATE POLICY "Assessors can view all applications for assessment" ON applications
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('reviewer', 'admin', 'approver')
        )
    );

CREATE POLICY "Assessors can update applications under assessment" ON applications
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('reviewer', 'admin', 'approver')
        )
        AND status IN ('submitted', 'under_review', 'pending_assessment')
    );

-- Update existing applications to use new workflow
-- Move applications from 'pending_inspection' to 'pending_assessment'
UPDATE applications 
SET status = 'pending_assessment'
WHERE status = 'pending_inspection';

-- Create function to handle assessment workflow transitions
CREATE OR REPLACE FUNCTION handle_assessment_workflow()
RETURNS TRIGGER AS $$
BEGIN
    -- When assessment is completed, update timestamps and status
    IF OLD.assessment_recommendation IS NULL AND NEW.assessment_recommendation IS NOT NULL THEN
        NEW.assessment_completed_at = NOW();
        
        -- Set status based on recommendation
        IF NEW.assessment_recommendation = 'yes' THEN
            NEW.status = 'pending_final_approval';
        ELSE
            NEW.status = 'revision_required';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for assessment workflow
DROP TRIGGER IF EXISTS trigger_assessment_workflow ON applications;
CREATE TRIGGER trigger_assessment_workflow
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION handle_assessment_workflow();

-- Update comments to reflect new consolidated workflow
COMMENT ON COLUMN applications.assigned_reviewer_id IS 'ID of assigned assessor/reviewer (consolidated role)';
COMMENT ON COLUMN applications.assigned_inspector_id IS 'DEPRECATED: Inspector role consolidated into reviewer role';
COMMENT ON COLUMN applications.assessment_recommendation IS 'Technical assessment recommendation: yes or no';
COMMENT ON COLUMN applications.assessment_notes IS 'Assessment notes and findings';
COMMENT ON COLUMN applications.assessment_completed_at IS 'Timestamp when assessment was completed';

-- Create indexes for new assessment fields
CREATE INDEX IF NOT EXISTS idx_applications_assessment_recommendation ON applications(assessment_recommendation);
CREATE INDEX IF NOT EXISTS idx_applications_assessment_completed_at ON applications(assessment_completed_at);

-- Update application workflow documentation
COMMENT ON TABLE applications IS 'Water permit applications with consolidated assessment workflow: submission -> assessment (field visit + technical review) -> approval';

-- Migration notes
INSERT INTO system_settings (key, value, description, created_at) 
VALUES (
    'workflow_migration_assessor_consolidation',
    '{"completed_at": "' || NOW()::text || '", "version": "1.0", "changes": ["Consolidated reviewer and inspector roles", "Updated workflow to single assessment step", "Maintained backward compatibility"]}',
    'Migration record for assessor/reviewer role consolidation',
    NOW()
) ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = NOW();
