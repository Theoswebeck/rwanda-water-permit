-- =====================================================
-- Extend payments for Annual Water Use Report fees
-- =====================================================
-- Adds:
-- - purpose: application_fee | annual_report_fee
-- - water_use_report_id: link payment to a report
-- Safe/idempotent and safe if payments table does not exist.
-- =====================================================

BEGIN;

-- Payments table may be created by a separate migration in this repo.
-- Use ALTER TABLE IF EXISTS so this migration is safe to run regardless.
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'application_fee',
  ADD COLUMN IF NOT EXISTS water_use_report_id UUID REFERENCES public.water_use_reports(id) ON DELETE SET NULL;

-- Constraint for purpose values (safe)
DO $$
BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_purpose_chk
    CHECK (purpose IN ('application_fee', 'annual_report_fee'));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint payments_purpose_chk already exists, skipping...';
END $$;

-- Helpful indexes (safe)
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_payments_purpose ON public.payments(purpose);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table public.payments does not exist, skipping idx_payments_purpose...';
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_payments_water_use_report_id ON public.payments(water_use_report_id);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table public.payments does not exist, skipping idx_payments_water_use_report_id...';
END $$;

COMMIT;

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');


