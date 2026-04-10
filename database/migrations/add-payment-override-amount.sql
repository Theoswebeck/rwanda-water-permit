-- Add optional per-application fee override.
-- When set, the payment tab and initiate API use this amount instead of DEFAULT_FEE.
-- NULL means use the system default (currently 35,000 RWF).
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_override_amount NUMERIC(15,2) DEFAULT NULL;
