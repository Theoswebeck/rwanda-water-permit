-- =====================================================
-- Workflow History Timeline Support
-- - RLS policies for workflow_history (staff read)
-- - Trigger to log application.status transitions automatically
-- =====================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;

-- Clean slate (idempotent)
DROP POLICY IF EXISTS "Staff can view workflow history" ON public.workflow_history;
DROP POLICY IF EXISTS "Authenticated users can insert workflow history" ON public.workflow_history;

-- Staff can view workflow history (internal timeline)
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

-- Allow inserts when user_id matches auth.uid() (used by trigger via invoker)
CREATE POLICY "Authenticated users can insert workflow history"
  ON public.workflow_history
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- =====================================================
-- Trigger: log applications.status changes into workflow_history
-- =====================================================

CREATE OR REPLACE FUNCTION public.log_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
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
      auth.uid(),
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

DROP TRIGGER IF EXISTS trigger_log_application_status_change ON public.applications;

CREATE TRIGGER trigger_log_application_status_change
AFTER UPDATE OF status ON public.applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_application_status_change();

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');


