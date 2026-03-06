-- =============================================
-- Hide draft applications from staff (RLS)
-- =============================================
--
-- Requirement: When an application is still a draft, it should never be seen
-- by anyone else than the applicant.
--
-- This migration updates RLS policies so that staff (reviewers, inspectors,
-- assessors, approvers, admins) cannot SELECT draft applications. Only the
-- applicant can see their own drafts via "Users can view their own applications".
--
-- Also restricts staff from viewing documents belonging to draft applications.
--
-- Apply in Supabase SQL Editor. Safe to re-run (drops/recreates policies).

-- 1. Inspectors: can view assigned applications, but NOT drafts
DROP POLICY IF EXISTS "Inspectors can view assigned applications" ON public.applications;
CREATE POLICY "Inspectors can view assigned applications"
  ON public.applications
  FOR SELECT
  USING (
    (auth.uid() = assigned_assessor_id OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['inspector'::user_role, 'admin'::user_role])
    ))
    AND status <> 'draft'
  );

-- 2. Reviewers: can view assigned applications, but NOT drafts
DROP POLICY IF EXISTS "Reviewers can view assigned applications" ON public.applications;
CREATE POLICY "Reviewers can view assigned applications"
  ON public.applications
  FOR SELECT
  USING (
    (auth.uid() = assigned_reviewer_id OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['reviewer'::user_role, 'admin'::user_role])
    ))
    AND status <> 'draft'
  );

-- 3. Approvers: can view assigned applications, but NOT drafts
DROP POLICY IF EXISTS "Approvers can view assigned applications" ON public.applications;
CREATE POLICY "Approvers can view assigned applications"
  ON public.applications
  FOR SELECT
  USING (
    (auth.uid() = assigned_approver_id OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['approver'::user_role, 'admin'::user_role])
    ))
    AND status <> 'draft'
  );

-- 4. Assessors: can view all applications, but NOT drafts (if policy exists)
DROP POLICY IF EXISTS "Assessors can view all applications" ON public.applications;
CREATE POLICY "Assessors can view all applications"
  ON public.applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role IN ('assessor', 'admin')
    )
    AND status <> 'draft'
  );

-- 5. Documents: staff cannot view documents for draft applications
DROP POLICY IF EXISTS "Staff can view all documents" ON public.documents;
CREATE POLICY "Staff can view all documents"
  ON public.documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['reviewer'::user_role, 'inspector'::user_role, 'admin'::user_role, 'approver'::user_role])
    )
    AND (
      documents.application_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = documents.application_id AND a.status <> 'draft'
      )
    )
  );

SELECT '✅ Draft visibility RLS policies applied. Drafts are now visible only to applicants.' AS result;
