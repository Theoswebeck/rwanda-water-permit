-- =====================================================
-- Extend inspections table for Authorization + Concession templates
-- Adds operator/catchment locked fields, concession boundary tables,
-- and social/gender + OHS checklist structures.
-- Safe/idempotent migration for Supabase/Postgres.
-- =====================================================

-- 1) Template selector + locked fields
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspection_template TEXT,
  ADD COLUMN IF NOT EXISTS operator_name TEXT,
  ADD COLUMN IF NOT EXISTS operator_id_tin TEXT,
  ADD COLUMN IF NOT EXISTS operator_residence TEXT,
  ADD COLUMN IF NOT EXISTS catchment_level1 TEXT,
  ADD COLUMN IF NOT EXISTS catchment_level2 TEXT;

-- Optional check constraint (safe)
DO $$
BEGIN
  ALTER TABLE public.inspections
    ADD CONSTRAINT inspections_inspection_template_chk
    CHECK (inspection_template IN ('authorization', 'concession'));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint inspections_inspection_template_chk already exists, skipping...';
END $$;

-- 2) Concession-specific section (authorized/actual surface area + boundaries table)
-- Boundaries stored as JSONB array of rows: [{ beacon: "B1", latitude: -1.9, longitude: 30.1 }, ...]
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS authorized_surface_area_ha DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS actual_surface_area_ha DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS authorized_concession_boundaries JSONB,
  ADD COLUMN IF NOT EXISTS actual_concession_boundaries JSONB;

-- 3) Social and Gender-Disaggregated Information (employment table)
-- JSONB shape:
-- {
--   permanentEmployees: { male: number, female: number, total: number },
--   temporarySeasonalWorkers: { male: number, female: number, total: number },
--   technicalSkilledStaff: { male: number, female: number, total: number },
--   unskilledSupportStaff: { male: number, female: number, total: number },
--   totalWorkforce: { male: number, female: number, total: number }
-- }
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS employment_gender_breakdown JSONB;

-- 4) Occupational Health and Safety (Gender-Sensitive)
-- JSONB shape:
-- {
--   genderInclusiveSafetyMeasures: { value: boolean, remarks: string },
--   separateSanitationFacilities: { value: boolean, remarks: string },
--   genderResponsiveGrievanceMechanism: { value: boolean, remarks: string }
-- }
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS ohs_gender_sensitive JSONB;

-- 5) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_inspections_template ON public.inspections(inspection_template);
CREATE INDEX IF NOT EXISTS idx_inspections_operator_name ON public.inspections(operator_name);

