-- =============================================
-- Relax permit_registry constraints for xlsx bulk load
-- Allows multiple rows per permit_number (multi-source permits)
-- and rows with null permit_holder / permit_number
-- =============================================

-- Drop the unique constraint so multi-source permits (e.g. GICUMBI x93 springs)
-- can each have their own row
ALTER TABLE public.permit_registry DROP CONSTRAINT IF EXISTS permit_registry_permit_number_key;

-- Allow null permit_holder and permit_number for continuation rows
-- (e.g. YUMN LTD / NGALI ENERGY sub-rows with no permit number)
ALTER TABLE public.permit_registry ALTER COLUMN permit_holder DROP NOT NULL;
ALTER TABLE public.permit_registry ALTER COLUMN permit_number DROP NOT NULL;

-- Preserve the xlsx row order so the UI displays exactly what staff see in Excel
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS row_index integer;

-- Store original (unparseable) date strings so assessors can still see
-- annotations like "(Amended to 3/7/2020)"
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS issuance_date_raw text;
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS expiration_date_raw text;

-- The existing btree index idx_permit_registry_permit_number already provides
-- non-unique lookup after the UNIQUE constraint is dropped. No new index needed.
