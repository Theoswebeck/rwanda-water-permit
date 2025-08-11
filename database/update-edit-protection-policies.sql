-- ============================================
-- UPDATE EDIT PROTECTION POLICIES
-- ============================================
-- This script updates the Row Level Security policies to prevent 
-- editing of approved or rejected applications

-- Drop and recreate user policy for updating applications
DROP POLICY IF EXISTS "Users can update their own draft applications" ON applications;

CREATE POLICY "Users can update their own draft applications"
    ON applications FOR UPDATE
    USING (
        auth.uid() = applicant_id 
        AND status IN ('draft', 'revision_required') 
        AND status NOT IN ('approved', 'rejected')
    );

-- Drop and recreate staff policy for updating applications  
DROP POLICY IF EXISTS "Staff can update applications in their workflow" ON applications;

CREATE POLICY "Staff can update applications in their workflow"
    ON applications FOR UPDATE
    USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_inspector_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role = 'admin'
         )) AND
        status NOT IN ('approved', 'rejected')
    );

-- Verify policies were created successfully
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'applications' 
AND policyname IN (
    'Users can update their own draft applications',
    'Staff can update applications in their workflow'
); 