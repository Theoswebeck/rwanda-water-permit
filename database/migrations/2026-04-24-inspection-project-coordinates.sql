-- =====================================================
-- Inspection: add project (activity site) coordinates
-- =====================================================
--
-- RWB inspectors flagged that the activity site can sit far from the
-- water source, so Section 2.1 ("Project Location") needs its own
-- latitude/longitude pair distinct from the existing water source
-- coordinates (`waterSourceLatitude` / `waterSourceLongitude`).
--
-- These columns are wired through:
--   * lib/inspections/payload-columns.data.json (canonical column list)
--   * components/inspection/inspection-form-layout.tsx (UI fields)
--   * /api/internal/query schema guard (auto-loads from this list)
--
-- Safe to re-run; safe with concurrent traffic.

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS project_latitude  numeric,
  ADD COLUMN IF NOT EXISTS project_longitude numeric;

-- Reload PostgREST schema cache (Supabase). Harmless on self-hosted PG.
SELECT pg_notify('pgrst', 'reload schema');
