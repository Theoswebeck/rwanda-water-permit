-- =============================================
-- Fix Technical Assessments RLS Policy to Include Verifier Role
-- Issue: Verifiers cannot see assessment field report data
-- Root Cause: RLS policy missing 'verifier' role
-- =============================================

-- Drop the existing policy that doesn't include verifier
DROP POLICY IF EXISTS "Assessors can view and create technical assessments" ON technical_assessments;

-- Create updated policy that includes ALL staff roles who need access
-- This includes: reviewer, admin, approver, verifier, assessor, inspector (for backward compat)
CREATE POLICY "Staff can view and manage technical assessments" ON technical_assessments
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('reviewer', 'admin', 'approver', 'verifier', 'assessor', 'inspector')
        )
    );

-- Also ensure the applicant view policy exists (for when applicants view their assessment status)
DROP POLICY IF EXISTS "Applicants can view assessments of their applications" ON technical_assessments;
CREATE POLICY "Applicants can view assessments of their applications" ON technical_assessments
    FOR SELECT USING (
        application_id IN (
            SELECT id FROM applications 
            WHERE applicant_id = auth.uid()
        )
    );

-- Log the migration
DO $$
BEGIN
    -- Add to system_settings if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings') THEN
        INSERT INTO system_settings (key, value, description, created_at) 
        VALUES (
            'rls_fix_technical_assessments_verifier',
            jsonb_build_object(
              'completed_at', NOW(),
              'issue', 'verifier_role_missing',
              'fix', 'added_verifier_and_other_staff_roles'
            ),
            'Fixed RLS policy for technical_assessments to include verifier role',
            NOW()
        ) ON CONFLICT (key) DO UPDATE SET 
            value = EXCLUDED.value,
            updated_at = NOW();
    END IF;
END $$;

-- Verification: Check that the policy was created correctly
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual::text as using_expression
FROM pg_policies 
WHERE tablename = 'technical_assessments';

