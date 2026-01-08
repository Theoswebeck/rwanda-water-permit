-- =====================================================
-- Inspections RLS Policies - SIMPLIFIED & WORKING
-- =====================================================
-- This migration creates INSERT/UPDATE/SELECT policies
-- for `public.inspections` that work reliably.
-- Safe & idempotent (uses DROP IF EXISTS).
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DROP ALL EXISTING INSPECTION POLICIES (clean slate)
-- =====================================================
DROP POLICY IF EXISTS "Staff can create inspections" ON public.inspections;
DROP POLICY IF EXISTS "Inspectors can create inspections" ON public.inspections;
DROP POLICY IF EXISTS "Staff can insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "Inspectors can update their inspections" ON public.inspections;
DROP POLICY IF EXISTS "Staff can update inspections" ON public.inspections;
DROP POLICY IF EXISTS "Reviewers can update inspection review fields" ON public.inspections;
DROP POLICY IF EXISTS "Users can view inspections for their applications" ON public.inspections;
DROP POLICY IF EXISTS "Staff can view all inspections" ON public.inspections;
DROP POLICY IF EXISTS "Assessors can manage their inspections" ON public.inspections;
DROP POLICY IF EXISTS "Inspectors can manage their inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone authenticated can insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "Authenticated users can insert own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can update own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Authenticated users can view inspections" ON public.inspections;

-- =====================================================
-- SIMPLE INSERT POLICY
-- Rule: Any authenticated user can insert an inspection
-- as long as they set inspector_id = their own auth.uid()
-- =====================================================
CREATE POLICY "Authenticated users can insert own inspections"
  ON public.inspections
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = inspector_id
  );

-- =====================================================
-- SIMPLE UPDATE POLICY
-- Rule: User can update inspections they created
-- =====================================================
CREATE POLICY "Users can update own inspections"
  ON public.inspections
  FOR UPDATE
  USING (auth.uid() = inspector_id)
  WITH CHECK (auth.uid() = inspector_id);

-- =====================================================
-- SELECT POLICIES
-- =====================================================

-- Applicants can view inspections for their applications
CREATE POLICY "Users can view inspections for their applications"
  ON public.inspections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.applicant_id = auth.uid()
    )
  );

-- Any authenticated user can view all inspections (staff use case)
CREATE POLICY "Authenticated users can view inspections"
  ON public.inspections
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- Refresh PostgREST schema cache
-- =====================================================
SELECT pg_notify('pgrst', 'reload schema');
