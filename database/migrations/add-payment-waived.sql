ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_waived BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.applications.payment_waived IS
  'TRUE for applicants who paid offline before IremboPay was integrated. Bypasses the payment gate.';
