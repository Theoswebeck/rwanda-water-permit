-- Add assigned_assessor_id to water_use_reports for reviewer->assessor assignment
ALTER TABLE public.water_use_reports
  ADD COLUMN IF NOT EXISTS assigned_assessor_id UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_wur_assigned_assessor ON public.water_use_reports(assigned_assessor_id);
