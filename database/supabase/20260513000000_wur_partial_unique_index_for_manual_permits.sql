-- Partial unique index for water_use_reports when permit_id IS NULL
--
-- The existing unique constraint (permit_id, reporting_year) does not catch
-- duplicate rows for manual/legacy permit renewals where permit_id is NULL,
-- because NULL != NULL in SQL. Without this index, every page-reload + save
-- would INSERT a second WUR row for the same renewal application and year.
--
-- This partial index enforces uniqueness on (application_id, reporting_year)
-- only for rows where permit_id IS NULL (i.e. manual registry permit renewals).

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS water_use_reports_unique_app_year_when_manual
    ON public.water_use_reports (application_id, reporting_year)
    WHERE permit_id IS NULL;

COMMIT;
