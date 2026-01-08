-- =====================================================
-- RLS policies for public.inspections
-- Fixes: "new row violates row-level security policy for table 'inspections'"
--
-- Assumptions:
-- - You use Supabase Auth (auth.uid()).
-- - public.users contains the user profile with a `role` column.
-- - inspections.inspector_id stores the creator/owner (auth user id).
-- =====================================================

BEGIN;

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- Helper note:
-- Some environments rely on auth user_metadata for role (fast profile),
-- and public.users.role may lag or be NULL. We therefore accept either.
-- Role source precedence:
--   JWT app_metadata.role -> JWT user_metadata.role -> public.users.role

-- -----------------------------------------------------
-- INSERT: staff can create inspections (must own the row)
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Staff can create inspections" ON public.inspections;
CREATE POLICY "Staff can create inspections"
  ON public.inspections
  FOR INSERT
  WITH CHECK (
    auth.uid() = inspector_id
    AND (
      -- Prefer JWT role claim (fast + doesn't require public.users row)
      lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')) IN ('assessor', 'inspector', 'reviewer', 'admin', 'approver', 'verifier')
      OR
      -- Fallback to public.users.role if present
      lower(coalesce((SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid()), '')) IN ('assessor', 'inspector', 'reviewer', 'admin', 'approver', 'verifier')
      OR
      -- Assignment-based fallback: allow assigned staff to create inspections for the application
      EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = public.inspections.application_id
          AND (
            -- Use JSONB access to avoid hard dependency on assignment columns
            -- (some DBs may not have assigned_inspector_id/assigned_reviewer_id/etc.)
            (to_jsonb(a) ->> 'assigned_inspector_id')::uuid = auth.uid()
            OR (to_jsonb(a) ->> 'assigned_reviewer_id')::uuid = auth.uid()
            OR (to_jsonb(a) ->> 'assigned_approver_id')::uuid = auth.uid()
            OR (to_jsonb(a) ->> 'assigned_assessor_id')::uuid = auth.uid()
          )
      )
    )
  );

-- -----------------------------------------------------
-- UPDATE: inspectors/assessors can update their own inspections
-- (reviewers update review fields via separate policy + trigger)
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Inspectors can update their own inspections" ON public.inspections;
CREATE POLICY "Inspectors can update their own inspections"
  ON public.inspections
  FOR UPDATE
  USING (
    auth.uid() = inspector_id
    AND (
      lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')) IN ('assessor', 'inspector', 'admin')
      OR lower(coalesce((SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid()), '')) IN ('assessor', 'inspector', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = public.inspections.application_id
          AND (to_jsonb(a) ->> 'assigned_inspector_id')::uuid = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() = inspector_id
    AND (
      lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')) IN ('assessor', 'inspector', 'admin')
      OR lower(coalesce((SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid()), '')) IN ('assessor', 'inspector', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = public.inspections.application_id
          AND (to_jsonb(a) ->> 'assigned_inspector_id')::uuid = auth.uid()
      )
    )
  );

-- -----------------------------------------------------
-- UPDATE: reviewers/admin/approver can update inspections
-- Trigger (from extend_inspections_schema migration) restricts them
-- to review-only fields.
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Reviewers can update inspection review fields" ON public.inspections;
CREATE POLICY "Reviewers can update inspection review fields"
  ON public.inspections
  FOR UPDATE
  USING (
    lower(
      coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        (SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid())
      )
    ) IN ('reviewer', 'admin', 'approver')
  )
  WITH CHECK (
    lower(
      coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        (SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid())
      )
    ) IN ('reviewer', 'admin', 'approver')
  );

-- -----------------------------------------------------
-- SELECT: applicants can view inspections for their applications
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Applicants can view inspections for their applications" ON public.inspections;
CREATE POLICY "Applicants can view inspections for their applications"
  ON public.inspections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE public.applications.id = public.inspections.application_id
        AND public.applications.applicant_id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- SELECT: staff can view all inspections
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Staff can view all inspections" ON public.inspections;
CREATE POLICY "Staff can view all inspections"
  ON public.inspections
  FOR SELECT
  USING (
    lower(
      coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        (SELECT public.users.role::text FROM public.users WHERE public.users.id = auth.uid())
      )
    ) IN ('assessor', 'inspector', 'reviewer', 'admin', 'approver', 'verifier')
  );

COMMIT;

-- Reload PostgREST schema cache (Supabase)
SELECT pg_notify('pgrst', 'reload schema');


