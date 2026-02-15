-- =============================================
-- Permit modification tagging + change history
-- =============================================
-- Goals:
-- - Tag permits that have been modified (business-field changes) with fast lookup
-- - Keep a durable, queryable history of permit modifications (who/when/what)
-- - Avoid UI-only logging (can be bypassed); use DB trigger for consistency
--
-- Notes:
-- - This migration is intentionally defensive (IF NOT EXISTS) because some
--   environments previously applied the "PERMIT_MODIFICATION_SQL.sql" manually.
-- =============================================

-- 1) Ensure modification-related columns exist (app expects these)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS is_modification BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS modified_from_application_id UUID REFERENCES public.applications(id);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS modification_changes JSONB DEFAULT NULL;

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS is_modification BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Add fast tag fields on permits (denormalized)
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS modification_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES public.users(id);

-- 3) Create change events table
CREATE TABLE IF NOT EXISTS public.permit_change_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permit_id UUID NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,

  -- Actor + time
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES public.users(id),

  -- Classification for display / filtering
  event_type TEXT NOT NULL CHECK (event_type IN ('modification', 'renewal', 'transfer', 'document', 'update')),

  -- What changed (diff only, not full rows)
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  diff JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Optional: tie back to the application that caused the change (best-effort)
  -- The app can set this later; trigger does not require it.
  source_application_id UUID REFERENCES public.applications(id),

  -- Lightweight display string (kept simple on purpose)
  summary TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permit_change_events_permit_id_changed_at
  ON public.permit_change_events(permit_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_permit_change_events_event_type
  ON public.permit_change_events(event_type);

-- 4) RLS (readable by permit owners + staff). Inserts are done by SECURITY DEFINER trigger.
ALTER TABLE public.permit_change_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view change events for their permits" ON public.permit_change_events;
CREATE POLICY "Users can view change events for their permits"
  ON public.permit_change_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.permits p
      JOIN public.applications a ON a.id = p.application_id
      WHERE p.id = permit_change_events.permit_id
        AND a.applicant_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view all permit change events" ON public.permit_change_events;
CREATE POLICY "Staff can view all permit change events"
  ON public.permit_change_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'approver', 'reviewer', 'inspector', 'assessor', 'verifier')
    )
  );

-- 5) Trigger: log meaningful changes + maintain modification tag fields on permits
CREATE OR REPLACE FUNCTION public.log_permit_change_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  k TEXT;
  ignored_keys TEXT[] := ARRAY[
    'updated_at',
    'created_at',
    'modification_count',
    'last_modified_at',
    'last_modified_by'
  ];
  changed_fields TEXT[] := ARRAY[]::TEXT[];
  diff JSONB := '{}'::JSONB;
  event_type TEXT := 'update';
  actor UUID := NULL;
  changed_field_count INTEGER := 0;
BEGIN
  -- Compute diff of OLD vs NEW (excluding internal/denormalized fields)
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOR k IN
    SELECT jsonb_object_keys(new_json)
  LOOP
    IF k = ANY(ignored_keys) THEN
      CONTINUE;
    END IF;

    IF (old_json -> k) IS DISTINCT FROM (new_json -> k) THEN
      changed_fields := array_append(changed_fields, k);
      diff := diff || jsonb_build_object(
        k,
        jsonb_build_object('previous', old_json -> k, 'current', new_json -> k)
      );
    END IF;
  END LOOP;

  changed_field_count := COALESCE(array_length(changed_fields, 1), 0);
  IF changed_field_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Identify actor (best-effort)
  actor := auth.uid();

  -- Classify the change for UI
  IF array_length(changed_fields, 1) = 1 AND changed_fields[1] = 'permit_pdf_url' THEN
    event_type := 'document';
  ELSIF NEW.is_renewal IS TRUE AND (
    OLD.issued_date IS DISTINCT FROM NEW.issued_date OR
    OLD.expiry_date IS DISTINCT FROM NEW.expiry_date
  ) THEN
    event_type := 'renewal';
  ELSIF NEW.is_transfer IS TRUE AND (
    OLD.original_permit_id IS DISTINCT FROM NEW.original_permit_id OR
    OLD.transfer_reason IS DISTINCT FROM NEW.transfer_reason
  ) THEN
    event_type := 'transfer';
  ELSIF (
    OLD.water_source IS DISTINCT FROM NEW.water_source OR
    OLD.purpose IS DISTINCT FROM NEW.purpose OR
    OLD.water_allowance IS DISTINCT FROM NEW.water_allowance OR
    OLD.allowance_unit IS DISTINCT FROM NEW.allowance_unit OR
    OLD.conditions IS DISTINCT FROM NEW.conditions OR
    (OLD.is_modification IS DISTINCT FROM NEW.is_modification AND NEW.is_modification = TRUE)
  ) THEN
    event_type := 'modification';
  ELSE
    event_type := 'update';
  END IF;

  -- Maintain "modified" tag fields (only for real modifications)
  IF event_type = 'modification' THEN
    NEW.modification_count := COALESCE(OLD.modification_count, 0) + 1;
    NEW.last_modified_at := NOW();
    NEW.last_modified_by := actor;
  END IF;

  -- Insert history event
  INSERT INTO public.permit_change_events (
    permit_id,
    changed_at,
    changed_by,
    event_type,
    changed_fields,
    diff,
    summary
  ) VALUES (
    NEW.id,
    NOW(),
    actor,
    event_type,
    changed_fields,
    diff,
    CASE
      WHEN event_type = 'modification' THEN 'Permit modified'
      WHEN event_type = 'renewal' THEN 'Permit renewed'
      WHEN event_type = 'transfer' THEN 'Permit transfer update'
      WHEN event_type = 'document' THEN 'Permit document updated'
      ELSE 'Permit updated'
    END
  );

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS trigger_log_permit_change_event ON public.permits;
CREATE TRIGGER trigger_log_permit_change_event
  BEFORE UPDATE ON public.permits
  FOR EACH ROW
  EXECUTE FUNCTION public.log_permit_change_event();

