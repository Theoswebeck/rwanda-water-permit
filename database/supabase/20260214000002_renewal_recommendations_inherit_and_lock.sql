-- =====================================================
-- Renewal Applications: Inherit & Lock Assessor Recommendations
--
-- Goal:
-- - For renewal applications, "Assessor Recommended" values must match the
--   previous permit's (previous application's) assessor recommendations.
-- - Those fields must NOT be editable on renewals.
--
-- Implementation:
-- 1) BEFORE INSERT trigger: copy prior recommendations into the new renewal application:
--    - proposed_duration_years
--    - assessor_recommended_volume_m3
--    - internal_notes JSON: _assessorAdjustments.permitLengthYears / recommendedVolumeM3
-- 2) BEFORE UPDATE trigger: prevent later edits to those values for renewal rows.
--
-- Notes:
-- - We treat internal_notes as JSON text; parsing is protected with exceptions.
-- - We only lock the recommendation keys/columns, not the entire internal_notes.
-- =====================================================

-- 1) Inherit on INSERT
CREATE OR REPLACE FUNCTION public.apply_renewal_assessor_recommendations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prev_app RECORD;
  prev_notes JSONB := '{}'::jsonb;
  prev_adjust JSONB := '{}'::jsonb;
  new_notes JSONB := '{}'::jsonb;

  prev_duration_int INTEGER := NULL;
  prev_volume_num NUMERIC := NULL;

  txt TEXT;
BEGIN
  IF NEW.is_renewal IS DISTINCT FROM TRUE OR NEW.renewed_from_permit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.*
  INTO prev_app
  FROM public.permits p
  JOIN public.applications a ON a.id = p.application_id
  WHERE p.id = NEW.renewed_from_permit_id
  LIMIT 1;

  IF prev_app IS NULL THEN
    -- Nothing to inherit from; allow insert.
    RETURN NEW;
  END IF;

  -- Parse previous internal_notes (safe)
  BEGIN
    IF prev_app.internal_notes IS NOT NULL AND btrim(prev_app.internal_notes) <> '' THEN
      prev_notes := (prev_app.internal_notes)::jsonb;
    END IF;
  EXCEPTION WHEN others THEN
    prev_notes := '{}'::jsonb;
  END;

  prev_adjust := COALESCE(prev_notes->'_assessorAdjustments', '{}'::jsonb);

  -- Resolve previous duration (years): adjustments > proposed_duration_years
  txt := prev_adjust->>'permitLengthYears';
  IF txt IS NOT NULL THEN
    BEGIN
      prev_duration_int := (txt)::integer;
    EXCEPTION WHEN others THEN
      prev_duration_int := NULL;
    END;
  END IF;
  IF prev_duration_int IS NULL THEN
    IF prev_app.proposed_duration_years IS NOT NULL THEN
      prev_duration_int := prev_app.proposed_duration_years;
    END IF;
  END IF;
  IF prev_duration_int IS NOT NULL AND (prev_duration_int < 1 OR prev_duration_int > 15) THEN
    prev_duration_int := NULL;
  END IF;

  -- Resolve previous volume: adjustments > assessor_recommended_volume_m3 > max_yearly_volume_m3
  txt := prev_adjust->>'recommendedVolumeM3';
  IF txt IS NOT NULL THEN
    BEGIN
      prev_volume_num := (txt)::numeric;
    EXCEPTION WHEN others THEN
      prev_volume_num := NULL;
    END;
  END IF;
  IF prev_volume_num IS NULL THEN
    IF prev_app.assessor_recommended_volume_m3 IS NOT NULL THEN
      prev_volume_num := prev_app.assessor_recommended_volume_m3;
    ELSIF prev_app.max_yearly_volume_m3 IS NOT NULL THEN
      prev_volume_num := prev_app.max_yearly_volume_m3;
    END IF;
  END IF;

  -- Parse NEW.internal_notes (safe) so we can merge without overwriting other keys
  BEGIN
    IF NEW.internal_notes IS NOT NULL AND btrim(NEW.internal_notes) <> '' THEN
      new_notes := (NEW.internal_notes)::jsonb;
    END IF;
  EXCEPTION WHEN others THEN
    new_notes := '{}'::jsonb;
  END;

  -- Ensure _assessorAdjustments object exists
  IF jsonb_typeof(new_notes->'_assessorAdjustments') IS DISTINCT FROM 'object' THEN
    new_notes := jsonb_set(new_notes, '{_assessorAdjustments}', '{}'::jsonb, true);
  END IF;

  IF prev_duration_int IS NOT NULL THEN
    NEW.proposed_duration_years := prev_duration_int;
    new_notes := jsonb_set(new_notes, '{_assessorAdjustments,permitLengthYears}', to_jsonb(prev_duration_int), true);
  END IF;

  IF prev_volume_num IS NOT NULL THEN
    NEW.assessor_recommended_volume_m3 := prev_volume_num;
    new_notes := jsonb_set(new_notes, '{_assessorAdjustments,recommendedVolumeM3}', to_jsonb(prev_volume_num), true);
  END IF;

  NEW.internal_notes := new_notes::text;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_renewal_assessor_recommendations ON public.applications;
CREATE TRIGGER trg_apply_renewal_assessor_recommendations
BEFORE INSERT ON public.applications
FOR EACH ROW
WHEN (NEW.is_renewal IS TRUE AND NEW.renewed_from_permit_id IS NOT NULL)
EXECUTE FUNCTION public.apply_renewal_assessor_recommendations();

-- 2) Lock on UPDATE (prevent edits to recommendation fields for renewals)
CREATE OR REPLACE FUNCTION public.lock_renewal_assessor_recommendations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_notes JSONB := '{}'::jsonb;
  new_notes JSONB := '{}'::jsonb;

  old_dur INTEGER := NULL;
  new_dur INTEGER := NULL;
  old_vol NUMERIC := NULL;
  new_vol NUMERIC := NULL;

  txt TEXT;
BEGIN
  IF OLD.is_renewal IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- If recommendation columns change, reject.
  IF NEW.proposed_duration_years IS DISTINCT FROM OLD.proposed_duration_years THEN
    RAISE EXCEPTION 'Renewal assessor recommendations are locked: proposed_duration_years cannot be modified.';
  END IF;
  IF NEW.assessor_recommended_volume_m3 IS DISTINCT FROM OLD.assessor_recommended_volume_m3 THEN
    RAISE EXCEPTION 'Renewal assessor recommendations are locked: assessor_recommended_volume_m3 cannot be modified.';
  END IF;

  -- Parse internal_notes (safe)
  BEGIN
    IF OLD.internal_notes IS NOT NULL AND btrim(OLD.internal_notes) <> '' THEN
      old_notes := (OLD.internal_notes)::jsonb;
    END IF;
  EXCEPTION WHEN others THEN
    old_notes := '{}'::jsonb;
  END;
  BEGIN
    IF NEW.internal_notes IS NOT NULL AND btrim(NEW.internal_notes) <> '' THEN
      new_notes := (NEW.internal_notes)::jsonb;
    END IF;
  EXCEPTION WHEN others THEN
    new_notes := '{}'::jsonb;
  END;

  -- Compare only the locked _assessorAdjustments keys (numeric-compare to avoid "100" vs "100.0" noise)
  txt := old_notes #>> '{_assessorAdjustments,permitLengthYears}';
  IF txt IS NOT NULL THEN
    BEGIN old_dur := (txt)::integer; EXCEPTION WHEN others THEN old_dur := NULL; END;
  END IF;
  txt := new_notes #>> '{_assessorAdjustments,permitLengthYears}';
  IF txt IS NOT NULL THEN
    BEGIN new_dur := (txt)::integer; EXCEPTION WHEN others THEN new_dur := NULL; END;
  END IF;
  IF new_dur IS DISTINCT FROM old_dur THEN
    RAISE EXCEPTION 'Renewal assessor recommendations are locked: internal_notes._assessorAdjustments.permitLengthYears cannot be modified.';
  END IF;

  txt := old_notes #>> '{_assessorAdjustments,recommendedVolumeM3}';
  IF txt IS NOT NULL THEN
    BEGIN old_vol := (txt)::numeric; EXCEPTION WHEN others THEN old_vol := NULL; END;
  END IF;
  txt := new_notes #>> '{_assessorAdjustments,recommendedVolumeM3}';
  IF txt IS NOT NULL THEN
    BEGIN new_vol := (txt)::numeric; EXCEPTION WHEN others THEN new_vol := NULL; END;
  END IF;
  IF new_vol IS DISTINCT FROM old_vol THEN
    RAISE EXCEPTION 'Renewal assessor recommendations are locked: internal_notes._assessorAdjustments.recommendedVolumeM3 cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_renewal_assessor_recommendations ON public.applications;
CREATE TRIGGER trg_lock_renewal_assessor_recommendations
BEFORE UPDATE ON public.applications
FOR EACH ROW
WHEN (OLD.is_renewal IS TRUE)
EXECUTE FUNCTION public.lock_renewal_assessor_recommendations();

