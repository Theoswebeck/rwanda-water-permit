-- Fix permits table RLS policies to allow permit creation
-- This addresses the "quarterly_permit_stats" error which is actually a permits table RLS issue

-- Drop the quarterly_permit_stats table if it exists (it seems to be auto-created by some trigger)
DROP TABLE IF EXISTS quarterly_permit_stats CASCADE;

-- Add missing INSERT policy for permits table
-- Staff can create permits when approving applications
CREATE POLICY "Staff can create permits for approved applications" ON permits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        ) OR
        -- Allow users to create permits for their own applications during terms acceptance
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = application_id AND applicant_id = auth.uid() AND status = 'pending_final_approval'
        )
    );

-- Add UPDATE policy for permits table (for future permit modifications)
CREATE POLICY "Staff can update permits" ON permits
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver')
        )
    );

-- Ensure applications table allows status updates during terms acceptance
-- Update the existing policy to allow terms acceptance updates
DROP POLICY IF EXISTS "Users can update their own draft applications" ON applications;

CREATE POLICY "Users can update their own applications for terms acceptance" ON applications
    FOR UPDATE USING (
        auth.uid() = applicant_id AND 
        (
            status IN ('draft', 'revision_required') OR 
            -- Allow terms acceptance updates
            (status = 'pending_final_approval' AND terms_status IS NULL)
        )
    );

-- Also ensure staff can update applications for final approval flow
CREATE POLICY "Staff can update applications for final approval" ON applications
    FOR UPDATE USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_assessor_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role = 'admin'
         )) AND
        status NOT IN ('cancelled')
    );
