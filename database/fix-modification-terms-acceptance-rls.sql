-- =============================================
-- FIX: RLS policies for modification/renewal terms acceptance
-- 
-- Issue: When an applicant accepts terms for a modification or renewal,
-- the code tries to UPDATE the permits table and the applications table.
-- Two problems:
--   1) The permits UPDATE policy only allows admin/approver — the applicant is blocked.
--   2) The applications UPDATE policy checks for 'pending_final_approval' status,
--      but the actual status at this stage is 'approved_pending_permit'.
--
-- This migration fixes both policies.
-- =============================================

-- -----------------------------------------------
-- 1. Fix permits UPDATE policy
-- Allow applicants to update permits for their own applications
-- during terms acceptance (modification/renewal flow)
-- -----------------------------------------------
DROP POLICY IF EXISTS "Staff can update permits" ON permits;

CREATE POLICY "Staff can update permits" ON permits
    FOR UPDATE USING (
        -- Staff/admin can always update permits
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver')
        )
        OR
        -- Applicants can update permits that belong to their own applications,
        -- but ONLY when they have an approved modification or renewal application
        -- pending terms acceptance.
        (
            -- 1) The permit must belong to the applicant (via the permit's original application)
            EXISTS (
                SELECT 1 FROM applications orig_app
                WHERE orig_app.id = permits.application_id
                  AND orig_app.applicant_id = auth.uid()
            )
            AND
            -- 2) The applicant must have a modification or renewal application
            --    in 'approved_pending_permit' status (i.e. terms acceptance stage)
            EXISTS (
                SELECT 1 FROM applications mod_app
                WHERE mod_app.applicant_id = auth.uid()
                  AND mod_app.status = 'approved_pending_permit'
                  AND (mod_app.is_modification = true OR mod_app.is_renewal = true)
            )
        )
    );

-- -----------------------------------------------
-- 2. Fix permits INSERT policy
-- Ensure the correct application status is checked
-- -----------------------------------------------
DROP POLICY IF EXISTS "Staff can create permits for approved applications" ON permits;

CREATE POLICY "Staff can create permits for approved applications" ON permits
    FOR INSERT WITH CHECK (
        -- Staff can always create permits
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        ) OR
        -- Applicants can create permits for their own applications during terms acceptance
        -- The correct status at this point is 'approved_pending_permit'
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = application_id 
              AND applicant_id = auth.uid() 
              AND status = 'approved_pending_permit'
        )
    );

-- -----------------------------------------------
-- 3. Fix applications UPDATE policy for terms acceptance
-- The status at terms acceptance time is 'approved_pending_permit', not 'pending_final_approval'
-- -----------------------------------------------
DROP POLICY IF EXISTS "Users can update their own applications for terms acceptance" ON applications;

CREATE POLICY "Users can update their own applications for terms acceptance" ON applications
    FOR UPDATE USING (
        auth.uid() = applicant_id AND 
        (
            status IN ('draft', 'revision_required') OR 
            -- Allow terms acceptance updates — correct status is 'approved_pending_permit'
            (status = 'approved_pending_permit' AND (terms_status IS NULL OR terms_status = 'pending'))
        )
    );

-- -----------------------------------------------
-- Verify the policies were created correctly
-- -----------------------------------------------
SELECT 
    policyname, 
    tablename, 
    cmd
FROM pg_policies 
WHERE tablename IN ('permits', 'applications')
  AND policyname IN (
    'Staff can update permits',
    'Staff can create permits for approved applications',
    'Users can update their own applications for terms acceptance'
  )
ORDER BY tablename, policyname;
