-- =============================================
-- FIX: Permits table INSERT RLS policy
-- Issue: Policy checked for 'pending_final_approval' but actual status is 'approved_pending_permit'
-- =============================================

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Staff can create permits for approved applications" ON permits;

-- Recreate the policy with the correct status check
-- Allow users to create permits for their own applications during terms acceptance
-- The application status at this stage is 'approved_pending_permit' (not 'pending_final_approval')
CREATE POLICY "Staff can create permits for approved applications" ON permits
    FOR INSERT WITH CHECK (
        -- Staff members can create permits
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        ) OR
        -- Applicants can create permits for their own applications when accepting terms
        -- The correct status is 'approved_pending_permit'
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = application_id 
              AND applicant_id = auth.uid() 
              AND status = 'approved_pending_permit'
        )
    );

-- Also ensure the applicant can update their application during terms acceptance
DROP POLICY IF EXISTS "Users can update their own applications for terms acceptance" ON applications;

CREATE POLICY "Users can update their own applications for terms acceptance" ON applications
    FOR UPDATE USING (
        auth.uid() = applicant_id AND 
        (
            status IN ('draft', 'revision_required') OR 
            -- Allow terms acceptance updates - use the correct status
            (status = 'approved_pending_permit' AND (terms_status IS NULL OR terms_status = 'pending'))
        )
    );

-- Verify the policy was created
SELECT 
    policyname, 
    tablename, 
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'permits' AND policyname LIKE '%permits%';

