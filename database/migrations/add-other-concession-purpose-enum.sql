-- Add the 'other_concession' activity code to the water_purpose enum.
-- "Other water concession activities" is the concession-side counterpart of the
-- existing free-text "Other" (abstraction) activity: the category is still
-- auto-derived from the selected activity (never a manual selector), so a
-- second distinct activity code is required for concession-type "other" uses.
-- Mirrors add-port-construction-purpose-enum.sql.
--
-- MIGRATION ORDER: this migration and the application code are order tolerant.
-- 'other_concession' is already in the WATER_PURPOSE allow-set of
-- lib/db/application-enum-sanitizer.ts, and the dashboard write paths
-- (app/api/dashboard/applications/route.ts and .../[id]/route.ts) catch the
-- Postgres 22P02 "invalid input value for enum water_purpose" error and retry
-- once with the legacy value 'other', logging a warning that names this file.
-- So:
--   * code deployed BEFORE this migration -> applicants can still submit; the
--     purpose column is stored as 'other' until the migration runs, but the
--     TRUE activity stays in applications.intended_activities (JSONB) and a
--     durable breadcrumb is written to internal_notes.enumCoercions, so
--     classification is still correct and the BACKFILL below repairs the
--     column when this file is applied.
--   * this migration applied (before or after the deploy) -> 'other_concession'
--     is accepted on the first attempt and persists losslessly. No code change
--     or restart is required after applying it.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block that then
-- uses the new value in the same transaction. Keep this migration standalone.
-- Apply to UAT (staging) DB first, then to the production DB when this feature
-- is cherry-picked to the production branch.

ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'other_concession';

-- ---------------------------------------------------------------------------
-- BACKFILL — heal rows written while this migration was still pending.
-- ---------------------------------------------------------------------------
-- While the enum value did not exist, the dashboard write paths retried with
-- the legacy value 'other' (an ABSTRACTION purpose) and recorded the intended
-- value durably:
--   * applications.intended_activities (JSONB, never enum-constrained) keeps
--     the true activity code — this is the authoritative source and the reason
--     the feature classifies correctly even before this migration runs; and
--   * applications.internal_notes.enumCoercions gets a
--     {"column":"water_purpose","from":"other_concession","to":"other",...}
--     breadcrumb (see lib/db/application-enum-sanitizer.ts).
-- The statements below use those two sources to restore water_purpose, so
-- applying this migration also REPAIRS the data instead of leaving silently
-- mis-typed rows behind.
--
-- RUN WITHOUT AN EXPLICIT TRANSACTION (plain `psql -f`, never `psql -1` and
-- never wrapped in BEGIN/COMMIT): PostgreSQL refuses to use an enum value that
-- was added by ALTER TYPE in the same transaction.

-- 1) Authoritative source: the JSONB activity list.
UPDATE public.applications a
SET water_purpose = 'other_concession'
WHERE a.water_purpose = 'other'
  AND jsonb_typeof(a.intended_activities) = 'array'
  AND a.intended_activities @> '["other_concession"]'::jsonb;

-- 2) Fallback source: the coercion breadcrumb in internal_notes (covers rows
--    whose activity list is empty/absent). internal_notes is TEXT holding JSON,
--    so the cast is guarded by CASE (evaluation order is guaranteed) and by a
--    cheap textual pre-filter.
UPDATE public.applications a
SET water_purpose = 'other_concession'
WHERE a.water_purpose = 'other'
  AND a.internal_notes LIKE '%"enumCoercions"%'
  AND a.internal_notes LIKE '%other_concession%'
  AND CASE
        WHEN a.internal_notes ~ '^\s*\{' THEN
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   CASE
                     WHEN jsonb_typeof((a.internal_notes::jsonb) -> 'enumCoercions') = 'array'
                       THEN (a.internal_notes::jsonb) -> 'enumCoercions'
                     ELSE '[]'::jsonb
                   END
                 ) AS c
            WHERE c ->> 'column' = 'water_purpose'
              AND c ->> 'from' = 'other_concession'
          )
        ELSE false
      END;

-- 3) Verification — expect 0 rows left to heal.
-- SELECT count(*) AS unhealed
-- FROM public.applications
-- WHERE water_purpose = 'other'
--   AND jsonb_typeof(intended_activities) = 'array'
--   AND intended_activities @> '["other_concession"]'::jsonb;
