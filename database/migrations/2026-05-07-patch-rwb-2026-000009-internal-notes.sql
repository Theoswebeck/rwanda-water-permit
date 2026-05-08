-- One-off: set saved form category to cooperative for RWB-2026-000009.
-- Prerequisites: run a harmless check that internal_notes parses as JSON:
--   SELECT internal_notes IS NOT NULL,
--          (nullif(trim(internal_notes), '')::jsonb) IS NOT NULL
--   FROM public.applications WHERE application_number = 'RWB-2026-000009';

UPDATE public.applications a
SET
  internal_notes = (
    coalesce(nullif(trim(a.internal_notes), '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('categoryApplicant', 'cooperative')
  )::text,
  updated_at = now()
WHERE a.application_number = 'RWB-2026-000009';

-- If the applicant tab still shows the wrong legal name, confirm users.company_name and merge explicitly, e.g.:
--   || jsonb_build_object('fullNameApplicant', trim(u.company_name))
-- joined to applicant_id (only if company_name is non-null).
