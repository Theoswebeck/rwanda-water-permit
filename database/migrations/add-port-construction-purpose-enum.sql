-- Add the 'port_construction' activity code to the water_purpose enum.
-- Port Construction is a distinct pure-concession activity (lake-based) used by
-- the application form, annex requirements, permit variant logic, and PDFs.
-- Without this value, inserting a port_construction application would fall back
-- to a generic enum member (lossy). Mirrors add-water-supply-purpose-enum.sql.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block that then
-- uses the new value in the same transaction. Keep this migration standalone.
-- Apply to UAT (staging) DB first, then to the production DB when this feature
-- is cherry-picked to the production branch.

ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'port_construction';
