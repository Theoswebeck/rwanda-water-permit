-- =====================================================
-- Verify RLS policies on public.inspections
-- =====================================================

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'inspections'
ORDER BY policyname;


