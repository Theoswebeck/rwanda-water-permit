-- =====================================================
-- Add reviewer workflow to inspections (safe migration)
-- Adds review fields + a trigger so reviewers can ONLY
-- update review fields (prevents editing inspection content).
-- =====================================================

-- 1) Review fields
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS review_status TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Optional check constraint for review_status (safe)
DO $$
BEGIN
  ALTER TABLE public.inspections
    ADD CONSTRAINT inspections_review_status_chk
    CHECK (review_status IN ('pending', 'reviewed', 'changes_requested'));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint inspections_review_status_chk already exists, skipping...';
END $$;

-- 2) Helpful indexes (safe)
CREATE INDEX IF NOT EXISTS idx_inspections_review_status ON public.inspections(review_status);
CREATE INDEX IF NOT EXISTS idx_inspections_reviewed_at ON public.inspections(reviewed_at);

-- 3) RLS policy: reviewers/admin/approver can UPDATE inspections
-- NOTE: The trigger below enforces column-level restrictions.
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers can update inspection review fields" ON public.inspections;
CREATE POLICY "Reviewers can update inspection review fields"
  ON public.inspections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('reviewer', 'admin', 'approver')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role IN ('reviewer', 'admin', 'approver')
    )
  );

-- 4) Trigger to prevent reviewers from changing non-review columns
-- We compare row JSONB excluding allowed review keys.
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


