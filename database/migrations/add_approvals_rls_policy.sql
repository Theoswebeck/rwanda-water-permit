-- Migration: Add RLS policies for approvals table
-- Issue: RLS was enabled on approvals table but no policies were defined,
-- causing all approver operations to be blocked (comments/decisions failed)
-- 
-- Run this migration in Supabase SQL Editor to fix the issue.

-- First, drop any existing policies on approvals table (safety measure)
DROP POLICY IF EXISTS "Approvers can manage approvals" ON public.approvals;
DROP POLICY IF EXISTS "Staff can view approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can insert their own approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can update their own approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can delete their own approvals" ON public.approvals;

-- Policy 1: Approvers can insert their own approval records (including comments)
-- This allows approvers to add comments and decisions to applications
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
-- This allows approvers to edit their own comments
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

-- Policy 3: Approvers can delete their own approval records (comments only)
-- This allows approvers to delete their own comments
CREATE POLICY "Approvers can delete their own approvals"
    ON public.approvals
    FOR DELETE
    USING (
        auth.uid() = approver_id AND
        decision = 'comment' AND -- Only allow deleting comments, not actual decisions
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('approver', 'admin')
        )
    );

-- Policy 4: Staff can view all approvals (for workflow visibility)
-- Reviewers, inspectors, approvers, and admins can see approval history
CREATE POLICY "Staff can view approvals"
    ON public.approvals
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'approver', 'admin')
        )
    );

-- Verify the policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'approvals'
ORDER BY policyname;
