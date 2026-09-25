-- Drop tables that are not used by the water permit system.
--   company_expenses, company_expense_receipts: belong to another project (never referenced by this app).
--   merchants: from the original IremboPay design; the app reads IremboPay config from env, never this table.
-- Run as postgres (object owner), after a backup:
--   sudo -u postgres pg_dump -d waterpermit -Fc -t company_expenses -t company_expense_receipts -t merchants \
--     -f ~/db-backups/waterpermit-unrelated-tables-$(date +%F).dump
--   sudo -u postgres psql -d waterpermit -v ON_ERROR_STOP=1 -f /tmp/2026-09-25-drop-unrelated-tables.sql

BEGIN;

-- Refuse to drop anything that has data or is still referenced by a payment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.company_expenses)
     OR EXISTS (SELECT 1 FROM public.company_expense_receipts)
     OR EXISTS (SELECT 1 FROM public.merchants)
     OR EXISTS (SELECT 1 FROM public.payments WHERE merchant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Aborting: one of the tables to drop is not empty (or payments.merchant_id is set)';
  END IF;
END $$;

-- payments.merchant_id keeps existing as a plain nullable column (types/payment.ts still lists it); only the FK goes.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_merchant_id_fkey;

DROP TABLE public.company_expense_receipts;
DROP TABLE public.company_expenses;
DROP TABLE public.merchants;

COMMIT;
