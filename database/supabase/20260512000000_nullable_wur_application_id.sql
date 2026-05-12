-- Make application_id nullable on water_use_reports.
-- Permits created via the registry may not have an associated application row,
-- so blocking the INSERT with a NOT NULL constraint prevents those applicants
-- from ever saving their Water Use Report during renewal.

BEGIN;

ALTER TABLE public.water_use_reports
  ALTER COLUMN application_id DROP NOT NULL;

COMMIT;
