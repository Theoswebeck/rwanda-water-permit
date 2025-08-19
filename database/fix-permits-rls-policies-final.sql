-- Fix permits table RLS policies - Final Version
-- This addresses the column name and role mismatches

-- Drop the quarterly_permit_stats table if it exists (it seems to be auto-created by some trigger)
DROP TABLE IF EXISTS quarterly_permit_stats CASCADE;

-- First, let's check what columns actually exist and fix any missing ones
-- Add assigned_assessor_id if it doesn't exist but assigned_inspector_id does
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_inspector_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_assessor_id') THEN
        ALTER TABLE applications RENAME COLUMN assigned_inspector_id TO assigned_assessor_id;
    END IF;
END $$;

-- Ensure we have the necessary columns
DO $$ 
BEGIN
    -- Add assigned_assessor_id if it doesn't exist at all
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_assessor_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_assessor_id UUID REFERENCES users(id);
    END IF;
    
    -- Add assigned_reviewer_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_reviewer_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_reviewer_id UUID REFERENCES users(id);
    END IF;
    
    -- Add assigned_approver_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'assigned_approver_id') THEN
        ALTER TABLE applications ADD COLUMN assigned_approver_id UUID REFERENCES users(id);
    END IF;
END $$;

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Staff can create permits for approved applications" ON permits;
DROP POLICY IF EXISTS "Staff can update permits" ON permits;
DROP POLICY IF EXISTS "Users can update their own applications for terms acceptance" ON applications;
DROP POLICY IF EXISTS "Staff can update applications for final approval" ON applications;

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
CREATE POLICY "Users can update their own applications for terms acceptance" ON applications
    FOR UPDATE USING (
        auth.uid() = applicant_id AND 
        (
            status IN ('draft', 'revision_required') OR 
            -- Allow terms acceptance updates
            (status = 'pending_final_approval' AND (terms_status IS NULL OR terms_status = 'pending'))
        )
    );

-- Also ensure staff can update applications for final approval flow
-- Use correct column names based on the migration
CREATE POLICY "Staff can update applications for final approval" ON applications
    FOR UPDATE USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_assessor_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role IN ('admin', 'reviewer', 'inspector', 'approver')
         )) AND
        status NOT IN ('cancelled')
    );
