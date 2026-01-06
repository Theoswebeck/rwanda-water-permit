-- Add verifier staff role and assignment field for verifier stage

-- 1) Extend role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'verifier';

-- 2) Add assignment column to applications for verifier handoffs
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS assigned_verifier_id UUID REFERENCES users(id);

-- 3) Index for dashboard filtering / lookups
CREATE INDEX IF NOT EXISTS idx_applications_assigned_verifier ON applications(assigned_verifier_id);


