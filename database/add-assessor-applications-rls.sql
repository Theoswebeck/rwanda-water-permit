-- =============================================
-- Allow assessor role to view all applications (Assessment dashboard)
-- + Ensure staff update policy includes assigned_assessor_id
-- =============================================
--
-- Why:
-- - The app uses `users.role = 'assessor'` and assigns work via `applications.assigned_assessor_id`.
-- - Existing RLS policies often only recognize reviewer/inspector/admin and may omit `assigned_assessor_id`.
-- - When RLS blocks SELECT, Supabase returns an empty array (no error), which looks like "no applications".
--
-- Apply in Supabase SQL editor (or via your migration process).
--
-- ✅ Safe to re-run (drops/recreates policies).

-- Ensure RLS is enabled (no-op if already enabled)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Allow assessors (and admins) to view all applications
DROP POLICY IF EXISTS "Assessors can view all applications" ON public.applications;
CREATE POLICY "Assessors can view all applications"
  ON public.applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('assessor', 'admin')
    )
  );

-- Ensure workflow updates work for assigned assessors too
DROP POLICY IF EXISTS "Staff can update applications in their workflow" ON public.applications;
CREATE POLICY "Staff can update applications in their workflow"
  ON public.applications
  FOR UPDATE
  USING (
    (
      auth.uid() = assigned_reviewer_id OR
      auth.uid() = assigned_inspector_id OR
      auth.uid() = assigned_assessor_id OR
      auth.uid() = assigned_approver_id OR
      EXISTS (
        SELECT 1
        FROM public.users
        WHERE public.users.id = auth.uid()
          AND public.users.role = 'admin'
      )
    )
    AND status NOT IN ('approved', 'rejected')
  )
  WITH CHECK (
    (
      auth.uid() = assigned_reviewer_id OR
      auth.uid() = assigned_inspector_id OR
      auth.uid() = assigned_assessor_id OR
      auth.uid() = assigned_approver_id OR
      EXISTS (
        SELECT 1
        FROM public.users
        WHERE public.users.id = auth.uid()
          AND public.users.role = 'admin'
      )
    )
    AND status NOT IN ('approved', 'rejected')
  );

SELECT '✅ Assessor application RLS policies applied.' AS result;


