-- Creates permit_number_counters table and seeds it so that the first
-- system-issued permit continues from 0917/RWB/2026 (last manual permit).
-- Year rollover is automatic: a new year's first INSERT creates a fresh row at 1.

CREATE TABLE IF NOT EXISTS public.permit_number_counters (
  year        INTEGER PRIMARY KEY,
  last_issued INTEGER NOT NULL DEFAULT 0
);

-- Seed: last manually-issued permit was 0917/RWB/2026
INSERT INTO permit_number_counters (year, last_issued)
VALUES (2026, 917)
ON CONFLICT (year) DO NOTHING;

-- Replace broken generate_permit_number() trigger function.
-- Previous version used SUBSTRING(FROM 1 FOR 6) which cut into the '/'
-- separator on 4-digit numbers, producing un-castable strings.
-- This version is atomic (no MAX()+1 race), 4-digit format, year-aware.
CREATE OR REPLACE FUNCTION public.generate_permit_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_year INTEGER;
  counter      INTEGER;
BEGIN
  IF NEW.permit_number IS NULL THEN
    current_year := EXTRACT(YEAR FROM NOW())::INTEGER;

    INSERT INTO permit_number_counters (year, last_issued)
    VALUES (current_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_issued = permit_number_counters.last_issued + 1
    RETURNING last_issued INTO counter;

    NEW.permit_number := LPAD(counter::TEXT, 4, '0') || '/RWB/' || current_year;
  END IF;
  RETURN NEW;
END;
$$;
