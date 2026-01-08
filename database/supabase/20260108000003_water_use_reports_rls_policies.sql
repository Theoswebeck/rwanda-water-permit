-- =====================================================
-- Water Use Reports RLS Policies (Applicant-facing)
-- =====================================================
-- Applicants can:
-- - INSERT their own reports
-- - UPDATE their own reports while in draft
-- - SELECT their own reports
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE public.water_use_reports ENABLE ROW LEVEL SECURITY;

-- Clean slate
DROP POLICY IF EXISTS "Applicants can insert own water use reports" ON public.water_use_reports;
DROP POLICY IF EXISTS "Applicants can update own draft water use reports" ON public.water_use_reports;
DROP POLICY IF EXISTS "Applicants can view own water use reports" ON public.water_use_reports;

-- INSERT: applicant only
CREATE POLICY "Applicants can insert own water use reports"
  ON public.water_use_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = applicant_id
  );

-- UPDATE: only drafts
CREATE POLICY "Applicants can update own draft water use reports"
  ON public.water_use_reports
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = applicant_id
    AND status = 'draft'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = applicant_id
    AND status = 'draft'
  );

-- SELECT: applicant only
CREATE POLICY "Applicants can view own water use reports"
  ON public.water_use_reports
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = applicant_id
  );

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');


