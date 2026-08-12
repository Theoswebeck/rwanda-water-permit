-- Allow notifications for inspections and water-use-reports which have no application_id.
-- The FK to applications is preserved but made optional (nullable).

ALTER TABLE public.notifications
  ALTER COLUMN application_id DROP NOT NULL;
