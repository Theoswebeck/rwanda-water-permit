-- =============================================
-- TERMINATED STATUS MIGRATION (RWB point 12)
-- =============================================
-- Adds a distinct TERMINAL status for applications that fall under an
-- EXEMPTED water use (e.g. irrigation on land <= 1 ha needs no permit).
-- Previously staff had to (mis)use "return for revision" for these cases.
--
--   - terminated: application closed because the water use is exempted;
--     clearly distinguished from returned-for-revision statuses.
--
-- Also adds columns to store the mandatory termination reason and timestamp
-- (mirrors rejection_reason / rejected_at).
--
-- Statuses are enforced via the application_status enum type
-- (see RETURNED_STATUS_MIGRATION.sql precedent).
--
-- Run this SQL manually (e.g. in the SQL editor / psql). DO NOT run in
-- the same transaction as any statement that uses the new enum value.
--
-- MIGRATION ORDER: this migration and the application code are order tolerant,
-- but they behave DIFFERENTLY per write path. 'terminated' is already in the
-- APPLICATION_STATUS allow-set of lib/db/application-enum-sanitizer.ts.
--
--   * Staff Terminate action (app/api/staff/applications/[id]/terminate/route.ts):
--     if this migration has NOT been applied, the update fails atomically
--     (22P02 on the enum, or 42703 on termination_reason/terminated_at) and the
--     route REFUSES cleanly with HTTP 503 code=MIGRATION_PENDING and a message
--     naming this file. NOTHING is written: the application keeps its current
--     status, no misleading 'cancelled' row is stored, and no applicant email
--     goes out. It does NOT fall back to 'cancelled' — that would lose the
--     mandatory termination reason (its column is missing too), skip the
--     applicant notification (which only fires for status='terminated') and
--     tell the applicant their file was cancelled rather than exempted.
--     Terminate starts working the moment this SQL is applied — no redeploy.
--   * Applicant/dashboard write paths (app/api/dashboard/applications/route.ts
--     and .../[id]/route.ts): these must never block an applicant, so they keep
--     the generic 22P02 retry with the legacy terminal status 'cancelled'
--     (LEGACY_ENUM_FALLBACKS in lib/db/application-enum-sanitizer.ts). In
--     practice they never write 'terminated' — only staff terminate.
--   * this migration applied (before or after the deploy) -> 'terminated' is
--     accepted on the first attempt and persists correctly. No code change or
--     restart is required after applying it.
-- =============================================

-- Step 1: Add 'terminated' to the application_status enum type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'terminated'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
    ) THEN
        ALTER TYPE application_status ADD VALUE 'terminated';
    END IF;
END $$;

-- Step 2: Columns for the mandatory termination reason + timestamp
ALTER TABLE public.applications
    ADD COLUMN IF NOT EXISTS termination_reason TEXT,
    ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.applications.termination_reason IS
    'Mandatory staff-provided reason when an application is terminated because the water use is exempted (no permit required).';
COMMENT ON COLUMN public.applications.terminated_at IS
    'When the application was terminated (exempted water use).';

-- Step 3: Verification (optional)
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
-- ORDER BY enumsortorder;
