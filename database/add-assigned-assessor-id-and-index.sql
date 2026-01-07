-- Add assigned_assessor_id to applications for assessor ownership routing
-- Non-destructive: keeps legacy assigned_inspector_id in place for older environments.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS assigned_assessor_id UUID REFERENCES users(id);

-- Backfill from legacy column if present (safe no-op if assigned_inspector_id doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'applications'
      AND column_name = 'assigned_inspector_id'
  ) THEN
    EXECUTE '
      UPDATE applications
      SET assigned_assessor_id = assigned_inspector_id
      WHERE assigned_assessor_id IS NULL
        AND assigned_inspector_id IS NOT NULL
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_assigned_assessor ON applications(assigned_assessor_id);


