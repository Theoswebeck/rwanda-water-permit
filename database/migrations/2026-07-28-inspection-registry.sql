-- Inspection Registry: manually-imported "Water Users Inspection Register" rows.
-- Applied on prod 2026-07-28 (table created + 635 rows imported from
-- "Water Users Inspection Register (for System).xlsx").
-- The staff Inspection Registry tab UNIONs this table with approved system
-- inspections (see app/api/staff/inspection-registry/route.ts).

CREATE TABLE IF NOT EXISTS public.inspection_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_index integer,
  inspection_number text UNIQUE,
  permit_holder text,
  permit_number text,
  activity text,
  district text,
  compliance_status text,
  observation text,
  action text,
  inspection_date_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_registry_permit_number
  ON public.inspection_registry (lower(permit_number));
CREATE INDEX IF NOT EXISTS idx_inspection_registry_row_index
  ON public.inspection_registry (row_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_registry TO waterpermit_app;
