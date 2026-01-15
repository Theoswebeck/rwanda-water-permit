-- =====================================================
-- Water Use Reports - Staff RLS Policies
-- =====================================================
-- Staff members (assessor, reviewer, verifier, inspector, approver, admin) 
-- can view all submitted water use reports.
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE public.water_use_reports ENABLE ROW LEVEL SECURITY;

-- Clean slate for staff policies
DROP POLICY IF EXISTS "Staff can view all water use reports" ON public.water_use_reports;

-- SELECT: Staff can view all reports (not just drafts)
CREATE POLICY "Staff can view all water use reports"
  ON public.water_use_reports
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('assessor', 'reviewer', 'verifier', 'inspector', 'approver', 'admin')
    )
  );

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
