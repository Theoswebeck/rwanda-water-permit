-- =====================================================================
-- FIX: inspection_workflow_history had RLS enabled with zero policies
-- while every other table in this self-hosted DB has RLS disabled
-- (auth is enforced at the app layer, not via Postgres RLS). With RLS
-- on and no policies, the app's non-superuser DB role could neither
-- insert nor select rows, so reviewer/assessor comments on
-- return_to_assessment / return_to_review / return_to_verification
-- never appeared in the Workflow History panel.
-- Applied directly on prod (10.10.82.199) and UAT (10.10.82.212) on
-- 2026-07-03.
-- =====================================================================

ALTER TABLE public.inspection_workflow_history DISABLE ROW LEVEL SECURITY;
