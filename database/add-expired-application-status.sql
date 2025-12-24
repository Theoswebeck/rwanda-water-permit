-- =============================================
-- Add "expired" application status + 6-month expiry support
-- Rwanda Water Resources Board Database Update (Supabase)
-- =============================================
--
-- Rule:
-- - An application expires 6 months after `submitted_at`
-- - If the permit has NOT been issued (no row in `permits` for application_id)
-- - Expired applications should be marked with status = 'expired'
--
-- NOTE:
-- Run this in the Supabase SQL editor. Do NOT run via migrations here.
--
-- IMPORTANT (Supabase/Postgres enum behavior):
-- ✅ You MUST run the enum alteration in its own execution, let it COMMIT,
-- then run the rest. Otherwise you'll hit:
--   "unsafe use of new value ... New enum values must be committed before they can be used."

-- ==========================================================
-- STEP 1 (RUN THIS ALONE, then click "RUN" and wait for success)
-- ==========================================================
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'expired';

-- ==========================================================
-- STEP 2 (RUN THIS IN A SEPARATE EXECUTION AFTER STEP 1 COMMITS)
-- ==========================================================

-- 2) Track expiry timestamp (optional but recommended for indexing and easy queries)
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_applications_expires_at ON applications(expires_at);

-- 3) Keep expires_at in sync when submitted_at is set
CREATE OR REPLACE FUNCTION set_application_expires_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL THEN
    -- Do not move the "first submission" expiry forward unless submitted_at itself is changed.
    NEW.expires_at := NEW.submitted_at + INTERVAL '6 months';
  ELSE
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_application_expires_at ON applications;
CREATE TRIGGER trg_set_application_expires_at
BEFORE INSERT OR UPDATE OF submitted_at
ON applications
FOR EACH ROW
EXECUTE FUNCTION set_application_expires_at();

-- 4) Backfill expires_at for existing applications that already have submitted_at
UPDATE applications
SET expires_at = submitted_at + INTERVAL '6 months'
WHERE submitted_at IS NOT NULL
  AND expires_at IS NULL;

-- 5) Expire applications that are past expiry and have no permit issued
CREATE OR REPLACE FUNCTION expire_old_applications()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE applications a
    SET status = 'expired',
        updated_at = NOW()
    WHERE
      a.submitted_at IS NOT NULL
      AND COALESCE(a.expires_at, a.submitted_at + INTERVAL '6 months') <= NOW()
      AND a.status NOT IN ('approved', 'rejected', 'cancelled', 'expired')
      AND NOT EXISTS (
        SELECT 1 FROM permits p WHERE p.application_id = a.id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;

-- Run once now (safe to re-run anytime)
SELECT expire_old_applications() AS expired_applications_updated;

-- Optional scheduling:
-- If your Supabase project has pg_cron enabled, you can schedule it:
--   SELECT cron.schedule(
--     'expire_old_applications_daily',
--     '0 2 * * *', -- daily at 02:00
--     $$SELECT expire_old_applications();$$
--   );


