-- =============================================
-- Create missing `public.inspections` table (safe migration)
-- Use this if your Supabase DB shows: relation "public.inspections" does not exist
-- =============================================

-- 1) Ensure enums exist (safe)
DO $$
BEGIN
  CREATE TYPE inspection_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN SQLSTATE '42710' THEN
    RAISE NOTICE 'Type inspection_status already exists, skipping...';
END $$;

DO $$
BEGIN
  CREATE TYPE inspection_type AS ENUM ('initial', 'follow_up', 'annual', 'complaint', 'renewal');
EXCEPTION
  WHEN SQLSTATE '42710' THEN
    RAISE NOTICE 'Type inspection_type already exists, skipping...';
END $$;

DO $$
BEGIN
  CREATE TYPE inspection_result AS ENUM ('passed', 'failed', 'conditional');
EXCEPTION
  WHEN SQLSTATE '42710' THEN
    RAISE NOTICE 'Type inspection_result already exists, skipping...';
END $$;

-- 2) Create table if missing (safe)
CREATE TABLE IF NOT EXISTS public.inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  inspector_id UUID NOT NULL REFERENCES public.users(id),

  -- Inspection metadata
  inspection_number VARCHAR(50) UNIQUE,
  type inspection_type NOT NULL,
  status inspection_status NOT NULL DEFAULT 'scheduled',
  result inspection_result,

  -- Activity details (used by permit-holder inspection checklist)
  activity_type TEXT,
  activity_starting_date DATE,

  -- Scheduling
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_date TIMESTAMP WITH TIME ZONE,

  -- Location verification
  location_verified BOOLEAN,
  coordinates_verified BOOLEAN,
  site_plan_compliance BOOLEAN,
  location_notes TEXT,

  -- Technical verification
  water_source_verified BOOLEAN,
  extraction_method_verified BOOLEAN,
  infrastructure_condition VARCHAR(100),
  technical_compliance BOOLEAN,
  technical_notes TEXT,

  -- Environmental compliance
  environmental_impact_assessed BOOLEAN,
  mitigation_measures_implemented BOOLEAN,
  environmental_compliance BOOLEAN,
  environmental_notes TEXT,

  -- Regulatory compliance
  permit_conditions_met BOOLEAN,
  volume_limits_respected BOOLEAN,
  reporting_up_to_date BOOLEAN,
  fees_paid BOOLEAN,
  regulatory_compliance BOOLEAN,
  regulatory_notes TEXT,

  -- Evidence collection
  photos_taken INTEGER DEFAULT 0,
  samples_collected INTEGER DEFAULT 0,
  gps_data JSONB,

  -- Inspector findings
  overall_score DECIMAL(3,2), -- 0.00 to 10.00
  recommendations TEXT,
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,

  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3) Helpful indexes (safe)
CREATE INDEX IF NOT EXISTS idx_inspections_application_id ON public.inspections(application_id);
CREATE INDEX IF NOT EXISTS idx_inspections_inspector_id ON public.inspections(inspector_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);

-- 4) RLS + policies (safe)
-- NOTE: This makes the table usable immediately in the app once you start writing inspections.
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- Assessors can manage their own inspections (assessor-only write)
DROP POLICY IF EXISTS "Assessors can manage their inspections" ON public.inspections;
CREATE POLICY "Assessors can manage their inspections"
  ON public.inspections
  FOR ALL
  USING (
    auth.uid() = inspector_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'assessor'
    )
  )
  WITH CHECK (
    auth.uid() = inspector_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'assessor'
    )
  );

-- Applicants can view inspections linked to their applications
DROP POLICY IF EXISTS "Users can view inspections for their applications" ON public.inspections;
CREATE POLICY "Users can view inspections for their applications"
  ON public.inspections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE public.applications.id = public.inspections.application_id
        AND public.applications.applicant_id = auth.uid()
    )
  );

-- Staff (reviewer/admin/approver/verifier) can view all inspections
DROP POLICY IF EXISTS "Staff can view all inspections" ON public.inspections;
CREATE POLICY "Staff can view all inspections"
  ON public.inspections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('assessor', 'reviewer', 'inspector', 'admin', 'approver', 'verifier')
    )
  );


