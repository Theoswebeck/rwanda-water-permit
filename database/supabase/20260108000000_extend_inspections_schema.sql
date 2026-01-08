-- =====================================================
-- Extend public.inspections to match the app payloads
-- Fixes PostgREST errors like:
--   "Could not find the 'actual_quantity' column of 'inspections' in the schema cache"
--
-- Safe/idempotent migration (ADD COLUMN IF NOT EXISTS).
-- After running, also reload PostgREST schema cache.
-- =====================================================

BEGIN;

-- Template selector + locked fields
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspection_template TEXT,
  ADD COLUMN IF NOT EXISTS operator_name TEXT,
  ADD COLUMN IF NOT EXISTS operator_id_tin TEXT,
  ADD COLUMN IF NOT EXISTS operator_residence TEXT,
  ADD COLUMN IF NOT EXISTS catchment_level1 TEXT,
  ADD COLUMN IF NOT EXISTS catchment_level2 TEXT;

-- Uploaded documents (JSONB)
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspection_documents JSONB;

-- Reviewer workflow fields
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS review_status TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Section 2: Activity Details
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS activity_type TEXT,
  ADD COLUMN IF NOT EXISTS activity_starting_date DATE;

-- Section 5: Allowed Water Abstraction
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS allowed_quantity DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS allowed_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS authorized_abstraction_method TEXT;

-- Section 6: Actual Water Abstraction
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS actual_quantity DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS actual_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS actual_abstraction_method TEXT,
  ADD COLUMN IF NOT EXISTS measurement_device_type TEXT,
  ADD COLUMN IF NOT EXISTS measurement_device_notes TEXT,
  ADD COLUMN IF NOT EXISTS measurement_device_photo_taken BOOLEAN DEFAULT FALSE;

-- Section 7: Wastewater Management
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS wastewater_system_type TEXT,
  ADD COLUMN IF NOT EXISTS wastewater_system_effectiveness VARCHAR(50),
  ADD COLUMN IF NOT EXISTS wastewater_system_photos_taken BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wastewater_notes TEXT;

-- Section 8: Fees Payment Verification
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS fees_payment_verified BOOLEAN,
  ADD COLUMN IF NOT EXISTS fees_payment_amount DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS fees_payment_proof TEXT,
  ADD COLUMN IF NOT EXISTS fees_outstanding_amount DECIMAL(15,2);

-- Section 9: Reports Submission
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS reports_submitted BOOLEAN,
  ADD COLUMN IF NOT EXISTS reports_submission_date DATE,
  ADD COLUMN IF NOT EXISTS reports_reference_number TEXT,
  ADD COLUMN IF NOT EXISTS reports_proof TEXT;

-- Section 10: Water Use Conflicts
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS water_use_conflicts TEXT,
  ADD COLUMN IF NOT EXISTS conflict_severity VARCHAR(50);

-- Section 11: Catchment Protection Initiatives
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS catchment_protection_initiatives TEXT,
  ADD COLUMN IF NOT EXISTS protection_photos_taken BOOLEAN DEFAULT FALSE;

-- Section 12: Overall Assessment
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS general_conclusion TEXT,
  ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(50);

-- Concession-specific (template = concession)
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS authorized_surface_area_ha DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS actual_surface_area_ha DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS authorized_concession_boundaries JSONB,
  ADD COLUMN IF NOT EXISTS actual_concession_boundaries JSONB;

-- Social/Gender + OHS
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS employment_gender_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS ohs_gender_sensitive JSONB;

-- -----------------------------------------------------
-- Constraints (safe)
-- -----------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.inspections
    ADD CONSTRAINT inspections_inspection_template_chk
    CHECK (inspection_template IN ('authorization', 'concession'));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint inspections_inspection_template_chk already exists, skipping...';
END $$;

DO $$
BEGIN
  ALTER TABLE public.inspections
    ADD CONSTRAINT inspections_review_status_chk
    CHECK (review_status IN ('pending', 'reviewed', 'changes_requested'));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint inspections_review_status_chk already exists, skipping...';
END $$;

-- -----------------------------------------------------
-- Indexes (safe)
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inspections_template ON public.inspections(inspection_template);
CREATE INDEX IF NOT EXISTS idx_inspections_operator_name ON public.inspections(operator_name);

CREATE INDEX IF NOT EXISTS idx_inspections_documents_gin
  ON public.inspections
  USING GIN (inspection_documents);

CREATE INDEX IF NOT EXISTS idx_inspections_compliance_status ON public.inspections(compliance_status);
CREATE INDEX IF NOT EXISTS idx_inspections_fees_verified ON public.inspections(fees_payment_verified);
CREATE INDEX IF NOT EXISTS idx_inspections_reports_submitted ON public.inspections(reports_submitted);

CREATE INDEX IF NOT EXISTS idx_inspections_review_status ON public.inspections(review_status);
CREATE INDEX IF NOT EXISTS idx_inspections_reviewed_at ON public.inspections(reviewed_at);

-- -----------------------------------------------------
-- Trigger: reviewers can only update review fields
-- (matches database/add-inspection-review-workflow.sql)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_inspection_review_only_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_reviewer BOOLEAN;
  old_clean JSONB;
  new_clean JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
      AND public.users.role IN ('reviewer', 'admin', 'approver')
  ) INTO is_reviewer;

  IF NOT is_reviewer THEN
    RETURN NEW;
  END IF;

  old_clean := to_jsonb(OLD)
    - 'review_status'
    - 'review_notes'
    - 'reviewed_by'
    - 'reviewed_at'
    - 'updated_at';

  new_clean := to_jsonb(NEW)
    - 'review_status'
    - 'review_notes'
    - 'reviewed_by'
    - 'reviewed_at'
    - 'updated_at';

  IF new_clean IS DISTINCT FROM old_clean THEN
    RAISE EXCEPTION 'Reviewers may only update review fields (review_status, review_notes, reviewed_by, reviewed_at).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspections_review_only_update ON public.inspections;
CREATE TRIGGER trg_inspections_review_only_update
BEFORE UPDATE ON public.inspections
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inspection_review_only_update();

COMMIT;

-- Reload PostgREST schema cache (Supabase)
-- If this errors, just use the Supabase Dashboard: Settings → API → "Reload Schema" / restart.
SELECT pg_notify('pgrst', 'reload schema');


