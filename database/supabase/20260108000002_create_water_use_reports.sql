-- =====================================================
-- Annual Water Use Reports (Applicant Reporting)
-- =====================================================
-- Creates public.water_use_reports to store annual reporting payloads
-- linked to a permit and applicant.
-- Safe/idempotent where possible.
-- =====================================================

BEGIN;

-- Core table
CREATE TABLE IF NOT EXISTS public.water_use_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relations
  permit_id UUID NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Core fields
  reporting_year INTEGER NOT NULL,
  template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',

  -- Section payloads (user-editable portions)
  section3 JSONB,
  section3_quarterly JSONB,
  section4 JSONB,
  section5_monitoring JSONB,
  section5_incidents JSONB,
  section6_employment JSONB,
  section6_ohs JSONB,
  section7 JSONB,
  section8 JSONB,
  section9_declaration JSONB,

  -- Audit
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Uniqueness: one report per permit per year
  CONSTRAINT water_use_reports_unique_permit_year UNIQUE (permit_id, reporting_year),

  -- Constraints (no enums to keep migrations flexible)
  CONSTRAINT water_use_reports_template_chk CHECK (template IN ('abstraction', 'concession')),
  CONSTRAINT water_use_reports_status_chk CHECK (status IN ('draft', 'submitted'))
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_water_use_reports_applicant_id ON public.water_use_reports(applicant_id);
CREATE INDEX IF NOT EXISTS idx_water_use_reports_permit_id ON public.water_use_reports(permit_id);
CREATE INDEX IF NOT EXISTS idx_water_use_reports_application_id ON public.water_use_reports(application_id);
CREATE INDEX IF NOT EXISTS idx_water_use_reports_reporting_year ON public.water_use_reports(reporting_year);

COMMIT;

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');


