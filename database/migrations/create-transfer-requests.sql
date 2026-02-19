-- =============================================
-- TRANSFER REQUESTS (TRANSFEREE APPROVAL) MIGRATION
-- =============================================
-- Purpose:
-- - Track transferee-facing permit transfer requests (email + phone matched)
-- - Allow transferee to approve the transfer only when the transfer application
--   reaches the "approved_pending_permit" stage (terms acceptance stage).
--
-- Notes:
-- - This table is intentionally separate from legacy/unused permit_transfers.
-- - Access control is primarily enforced in server routes using the service role key.
--   RLS here is conservative (read-only for matching email).
-- =============================================

CREATE TABLE IF NOT EXISTS transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked transfer application (created by transferor)
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Permit being transferred (original permit)
  original_permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE RESTRICT,

  -- Transferor (current owner account who initiated the transfer)
  transferor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Transferee identity (matched to user profile at login time)
  transferee_email TEXT NOT NULL,
  transferee_phone TEXT NOT NULL,

  -- Transferee approval state
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One transfer request per transfer application
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_requests_application_id_unique
  ON transfer_requests(application_id);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_transferee_email
  ON transfer_requests(LOWER(transferee_email));

CREATE INDEX IF NOT EXISTS idx_transfer_requests_transferee_phone
  ON transfer_requests(transferee_phone);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_status
  ON transfer_requests(status);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_created_at
  ON transfer_requests(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_transfer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_transfer_requests_updated_at ON transfer_requests;
CREATE TRIGGER trigger_update_transfer_requests_updated_at
  BEFORE UPDATE ON transfer_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_transfer_requests_updated_at();

-- Enable RLS
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

-- RLS: allow transferee to read by matching email claim (phone matching is enforced in server routes)
DROP POLICY IF EXISTS "Transferees can view transfer requests by email" ON transfer_requests;
CREATE POLICY "Transferees can view transfer requests by email"
  ON transfer_requests FOR SELECT
  TO authenticated
  USING (
    LOWER(transferee_email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );

COMMENT ON TABLE transfer_requests IS 'Transferee-facing transfer requests matched by email+phone; approved before terms acceptance.';
COMMENT ON COLUMN transfer_requests.application_id IS 'Transfer application created by transferor (applications.application_type=transfer).';
COMMENT ON COLUMN transfer_requests.original_permit_id IS 'Original permit being transferred; new permit will reference this as original_permit_id.';
COMMENT ON COLUMN transfer_requests.transferee_email IS 'Lowercased email used to match transferee account login.';
COMMENT ON COLUMN transfer_requests.transferee_phone IS 'Normalized phone digits used to match transferee account login.';

