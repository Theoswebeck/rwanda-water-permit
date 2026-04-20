# Permit Number Generation — Design Spec
**Date:** 2026-04-19  
**Project:** Rwanda Water Permit System (waterpermit)  
**Status:** Approved

---

## Problem

The existing `generate_permit_number()` DB trigger function is broken for real-world use:

1. It uses `SUBSTRING(permit_number FROM 1 FOR 6)` which cuts into the `/` separator on 4-digit permit numbers like `0917/RWB/2026`, producing `"0917/R"` — an un-castable integer.
2. It generates 6-digit numbers (`000001/RWB/2026`) inconsistent with the historical 4-digit format.
3. It has no seed — with an empty `permits` table it would restart from `0001/RWB/2026`, colliding with historically issued permits.

**Last manually issued permit before system go-live:** `0917/RWB/2026`  
**First system-issued permit must be:** `0918/RWB/2026`

---

## Format

```
NNNN/RWB/YYYY
```

- `NNNN` — 4-digit zero-padded sequential counter, resets to `0001` each calendar year
- `RWB` — fixed authority code (Rwanda Water Board)
- `YYYY` — 4-digit calendar year (from `NOW()` at insert time)

Examples: `0918/RWB/2026`, `0919/RWB/2026`, `0001/RWB/2027`

---

## Solution — Option B: `permit_number_counters` table

### New table

```sql
CREATE TABLE public.permit_number_counters (
  year        INTEGER PRIMARY KEY,
  last_issued INTEGER NOT NULL DEFAULT 0
);

-- Seed: last manually-issued permit was 0917/RWB/2026
INSERT INTO permit_number_counters (year, last_issued) VALUES (2026, 917);
```

### Updated trigger function

```sql
CREATE OR REPLACE FUNCTION public.generate_permit_number()
RETURNS trigger LANGUAGE plpgsql AS $$
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
```

### Migration file

`database/migrations/2026-04-19-permit-number-counter-seed.sql`

Contains both the `CREATE TABLE` and `INSERT` seed. The `CREATE OR REPLACE FUNCTION` goes into `database/schema-from-supabase/09-functions.sql` (replacing the broken version) and is also included in the migration for deployment.

---

## Key properties

| Property | Behaviour |
|----------|-----------|
| First 2026 permit | `0918/RWB/2026` |
| Subsequent 2026 permits | `0919`, `0920`, … sequential |
| First 2027 permit | `0001/RWB/2027` (INSERT creates new row, `last_issued=1`) |
| Concurrent inserts | Safe — `ON CONFLICT DO UPDATE … RETURNING` is atomic |
| Re-seeding | `UPDATE permit_number_counters SET last_issued=X WHERE year=Y` — no function change |
| Upper bound | 9,999 permits/year; if approaching, bump `LPAD` width from 4 to 5 |

---

## Scope

- **Changed:** `generate_permit_number()` function (DB trigger, no app code)
- **Added:** `permit_number_counters` table + seed row
- **Unchanged:** `generate_application_number()`, application workflow, Next.js app layer

The `permits` table is currently empty so no data migration is required.

---

## Verification steps

```sql
-- 1. Confirm seed row
SELECT * FROM permit_number_counters;
-- Expected: year=2026, last_issued=917

-- 2. Trigger a permit insert with permit_number=NULL
INSERT INTO permits (application_id, status, permit_number)
VALUES ('<test-uuid>', 'active', NULL);

-- 3. Confirm generated number
SELECT permit_number FROM permits ORDER BY created_at DESC LIMIT 1;
-- Expected: 0918/RWB/2026

-- 4. Confirm counter incremented
SELECT * FROM permit_number_counters;
-- Expected: year=2026, last_issued=918

-- 5. Clean up test
DELETE FROM permits WHERE permit_number = '0918/RWB/2026';
UPDATE permit_number_counters SET last_issued = 917 WHERE year = 2026;
```
