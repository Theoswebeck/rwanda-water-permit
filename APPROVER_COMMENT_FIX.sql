-- =============================================
-- FIX: Approver Comments/Decision Submission Errors
-- =============================================
-- 
-- PROBLEM: When an approver adds a comment to an application and tries to submit,
-- errors occur. This is because RLS (Row Level Security) was enabled on the 
-- `approvals` table but no policies were defined, blocking all operations.
--
-- SOLUTION: Add the missing RLS policies for the approvals table.
--
-- HOW TO RUN: Execute this SQL in your Supabase SQL Editor
-- =============================================

-- Drop any existing policies (safety measure)
DROP POLICY IF EXISTS "Approvers can insert their own approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can update their own approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can delete their own approvals" ON public.approvals;
DROP POLICY IF EXISTS "Staff can view approvals" ON public.approvals;

-- Policy 1: Approvers can insert their own approval records (including comments)
CREATE POLICY "Approvers can insert their own approvals"
    ON public.approvals
    FOR INSERT
    WITH CHECK (
        auth.uid() = approver_id AND
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('approver', 'admin')
        )
    );

-- Policy 2: Approvers can update their own approval records
CREATE POLICY "Approvers can update their own approvals"
    ON public.approvals
    FOR UPDATE
    USING (
        auth.uid() = approver_id AND
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('approver', 'admin')
        )
    )
    WITH CHECK (
        auth.uid() = approver_id AND
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('approver', 'admin')
        )
    );

-- Policy 3: Approvers can delete their own comments (not final decisions)
CREATE POLICY "Approvers can delete their own approvals"
    ON public.approvals
    FOR DELETE
    USING (
        auth.uid() = approver_id AND
        decision = 'comment' AND
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('approver', 'admin')
        )
    );

-- Policy 4: Staff can view all approvals
CREATE POLICY "Staff can view approvals"
    ON public.approvals
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'approver', 'admin')
        )
    );

-- Verify the fix
SELECT '✅ Approvals RLS policies created successfully!' AS status;

-- Show all policies on approvals table
SELECT 
    policyname,
    cmd AS operation,
    permissive
FROM pg_policies 
WHERE tablename = 'approvals'
ORDER BY policyname;
