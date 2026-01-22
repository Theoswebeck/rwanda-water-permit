-- =====================================================
-- Workflow History Timeline Fix
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Fix the trigger function to use SECURITY DEFINER
-- This allows it to insert records regardless of RLS policies
CREATE OR REPLACE FUNCTION public.log_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- Important: allows trigger to bypass RLS
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.workflow_history (
      application_id,
      user_id,
      from_status,
      to_status,
      action,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      auth.uid(),  -- May be NULL for service role operations
      OLD.status::text,
      NEW.status::text,
      'status_change',
      NULL,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Ensure trigger exists (recreate it to pick up the new function)
DROP TRIGGER IF EXISTS trigger_log_application_status_change ON public.applications;

CREATE TRIGGER trigger_log_application_status_change
AFTER UPDATE OF status ON public.applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_application_status_change();

-- 3. Update the INSERT policy to allow NULL user_id (for service role operations)
DROP POLICY IF EXISTS "Authenticated users can insert workflow history" ON public.workflow_history;

CREATE POLICY "Authenticated users can insert workflow history"
  ON public.workflow_history
  FOR INSERT
  WITH CHECK (
    -- Either: user is authenticated and inserting their own record
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Or: allow NULL user_id for system/trigger operations  
    (user_id IS NULL)
  );

-- 4. Ensure the SELECT policy allows all staff roles
DROP POLICY IF EXISTS "Staff can view workflow history" ON public.workflow_history;

CREATE POLICY "Staff can view workflow history"
  ON public.workflow_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('assessor', 'reviewer', 'verifier', 'inspector', 'approver', 'admin')
    )
  );

-- 5. Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- =====================================================
-- Verification: Check existing workflow_history records
-- =====================================================
-- Uncomment to verify records exist:
-- SELECT * FROM public.workflow_history ORDER BY created_at DESC LIMIT 10;
