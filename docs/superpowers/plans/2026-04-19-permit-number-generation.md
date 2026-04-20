# Permit Number Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `generate_permit_number()` DB trigger with a counter-table approach that starts from `0918/RWB/2026` and auto-resets to `0001/RWB/YYYY` on year rollover.

**Architecture:** A `permit_number_counters` table holds one row per year (`year INT PK, last_issued INT`). The trigger atomically increments the counter for the current year using `ON CONFLICT DO UPDATE … RETURNING`, producing a 4-digit zero-padded permit number. The 2026 row is seeded at 917 so the first generated number is `0918/RWB/2026`.

**Tech Stack:** PostgreSQL (trigger function, plain SQL migration), no app-layer changes.

---

### Task 1: Create the migration file

**Files:**
- Create: `database/migrations/2026-04-19-permit-number-counter-seed.sql`

- [ ] **Step 1: Create the migration file**

Create `database/migrations/2026-04-19-permit-number-counter-seed.sql` with this exact content:

```sql
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
```

- [ ] **Step 2: Verify the file exists and content is correct**

```bash
cat database/migrations/2026-04-19-permit-number-counter-seed.sql
```

Expected: the full SQL above printed to stdout with no truncation.

- [ ] **Step 3: Commit the migration**

```bash
git add database/migrations/2026-04-19-permit-number-counter-seed.sql
git commit -m "feat: add permit_number_counters table and seed from 0917/RWB/2026"
```

---

### Task 2: Update the canonical schema file

**Files:**
- Modify: `database/schema-from-supabase/09-functions.sql` (lines 270–294)

This file is the source-of-truth schema snapshot. It must match what the migration deploys.

- [ ] **Step 1: Replace the broken function in the schema file**

In `database/schema-from-supabase/09-functions.sql`, replace lines 270–294:

Old (broken):
```sql
CREATE OR REPLACE FUNCTION public.generate_permit_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    year_prefix VARCHAR(4);
    counter INTEGER;
    new_number VARCHAR(50);
BEGIN
    IF NEW.permit_number IS NULL THEN
        year_prefix := EXTRACT(YEAR FROM NOW())::VARCHAR;
        
        -- Find the max counter for the current year with the new format
        SELECT COALESCE(MAX(CAST(SUBSTRING(permit_number FROM 1 FOR 6) AS INTEGER)), 0) + 1
        INTO counter
        FROM permits
        WHERE permit_number LIKE '%' || '/RWB/' || year_prefix;
        
        new_number := LPAD(counter::VARCHAR, 6, '0') || '/RWB/' || year_prefix;
        NEW.permit_number := new_number;
    END IF;
    
    RETURN NEW;
END;
$function$
```

New (fixed):
```sql
CREATE OR REPLACE FUNCTION public.generate_permit_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
```

- [ ] **Step 2: Verify the diff looks clean**

```bash
git diff database/schema-from-supabase/09-functions.sql
```

Expected: only the `generate_permit_number` block changed — no other functions touched.

- [ ] **Step 3: Commit the schema update**

```bash
git add database/schema-from-supabase/09-functions.sql
git commit -m "fix: update generate_permit_number() to use counter table, 4-digit format"
```

---

### Task 3: Apply migration to DB and verify

**Prerequisites:** SSH access to the database server (`qtgentil@10.10.82.199`) or a direct `psql` connection via `DATABASE_URL`.

- [ ] **Step 1: Apply the migration**

```bash
psql "$DATABASE_URL" -f database/migrations/2026-04-19-permit-number-counter-seed.sql
```

Expected output:
```
CREATE TABLE
INSERT 0 1
CREATE FUNCTION
```

If `CREATE TABLE` shows `NOTICE: relation "permit_number_counters" already exists` that's fine — the `IF NOT EXISTS` handles it.

- [ ] **Step 2: Confirm seed row**

```sql
SELECT * FROM permit_number_counters;
```

Expected:
```
 year | last_issued
------+-------------
 2026 |         917
```

- [ ] **Step 3: Confirm function was replaced**

```sql
SELECT prosrc FROM pg_proc WHERE proname = 'generate_permit_number';
```

Expected: the new function body referencing `permit_number_counters` (not the old MAX+SUBSTRING approach).

- [ ] **Step 4: Insert a test permit and verify number**

```sql
-- Use any existing application UUID, or create a dummy one
-- Replace <real-application-uuid> with an actual UUID from the applications table:
-- SELECT id FROM applications LIMIT 1;

INSERT INTO permits (application_id, permit_number, status, issued_date, expiry_date)
SELECT id, NULL, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years'
FROM applications
LIMIT 1;

SELECT permit_number FROM permits ORDER BY created_at DESC LIMIT 1;
```

Expected: `0918/RWB/2026`

- [ ] **Step 5: Confirm counter incremented**

```sql
SELECT * FROM permit_number_counters;
```

Expected:
```
 year | last_issued
------+-------------
 2026 |         918
```

- [ ] **Step 6: Clean up test permit and reset counter**

```sql
DELETE FROM permits WHERE permit_number = '0918/RWB/2026';
UPDATE permit_number_counters SET last_issued = 917 WHERE year = 2026;
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Table creation ✓, seed at 917 ✓, function fix ✓, 4-digit format ✓, year rollover (auto via INSERT) ✓, atomic ✓, schema file updated ✓
- [x] **No placeholders:** All steps have exact SQL/bash commands and expected output
- [x] **Type consistency:** `counter INTEGER`, `current_year INTEGER`, `LPAD(counter::TEXT, 4, '0')` consistent across both tasks
