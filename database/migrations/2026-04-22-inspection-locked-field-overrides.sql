-- =============================================
-- Inspection: locked-field overrides storage
-- =============================================
--
-- The inspection editor lets the assessor type values into auto-populated
-- ("locked") permit fields when the source permit is missing data. Those
-- entries are kept in the form state under `locked_field_overrides`
-- (a {fieldKey: value} map) and POSTed to public.inspections on save.
--
-- Until now the column did not exist. The /api/internal/query route's
-- silent column-strip retry was dropping the field on every save, so
-- the yellow "(missing — editable)" overrides were lost on refresh.
--
-- This adds a JSONB column to persist them.

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS locked_field_overrides jsonb;
