-- =============================================
-- CLOSED-DUE-TO-INCOMPLETION STATUS (RWB point 16)
-- =============================================
-- The Water Use Permit Law requires applications left incomplete for more
-- than six months to be closed. The six-month sweep
-- (lib/notifications/application-expiration-sweep.ts) previously wrote
-- 'expired', which reads as a lapsed permit rather than a closed file. RWB
-- asked for the law's own wording.
--
--   - closed_incomplete: application closed automatically because it stayed
--     incomplete for more than six months. Terminal; distinct from 'expired'
--     (which still means an approved application whose terms were never
--     accepted in time).
--
-- Run this SQL manually (psql). DO NOT run it in the same transaction as any
-- statement that uses the new enum value — Postgres will not see the label
-- until the adding transaction commits.
--
-- MIGRATION ORDER: code and migration are order tolerant. Until this runs,
-- expireApplication() catches 22P02 and falls back to 'expired'; see
-- LEGACY_ENUM_FALLBACKS in lib/db/application-enum-sanitizer.ts.
--
-- Apply on BOTH databases (production and UAT).

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'closed_incomplete';

-- Verify:
--   select unnest(enum_range(null::application_status))::text;
