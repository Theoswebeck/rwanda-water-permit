-- Make permit_id nullable on water_use_reports.
-- Manual registry permits have no row in the permits table (they use a synthetic
-- "manual-..." frontend id, not a real UUID), so the NOT NULL constraint blocks
-- the INSERT for every registry-permit renewal Water Use Report save.

BEGIN;

ALTER TABLE public.water_use_reports
  ALTER COLUMN permit_id DROP NOT NULL;

COMMIT;
