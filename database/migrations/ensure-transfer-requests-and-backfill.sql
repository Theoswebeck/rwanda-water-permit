-- =============================================
-- ENSURE TRANSFER REQUESTS + BACKFILL FOR RWB POSTGRES
-- =============================================
-- Purpose:
-- - Create transfer_requests if it is missing on the self-hosted RWB Postgres server
-- - Backfill rows from existing transfer application payloads stored in applications.internal_notes
-- - Make the transferee notification + transferee approval flow work for already-created transfer apps
-- =============================================

CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  original_permit_id UUID REFERENCES public.permits(id) ON DELETE RESTRICT,
  transferor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  transferee_email TEXT NOT NULL,
  transferee_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_requests_application_id_unique
  ON public.transfer_requests(application_id);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_transferee_email
  ON public.transfer_requests(LOWER(transferee_email));

CREATE INDEX IF NOT EXISTS idx_transfer_requests_transferee_phone
  ON public.transfer_requests(transferee_phone);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_status
  ON public.transfer_requests(status);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_created_at
  ON public.transfer_requests(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_transfer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_transfer_requests_updated_at ON public.transfer_requests;
CREATE TRIGGER trigger_update_transfer_requests_updated_at
  BEFORE UPDATE ON public.transfer_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transfer_requests_updated_at();

-- Preserve the original app policy shape for environments where RLS is enabled.
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Transferees can view transfer requests by email" ON public.transfer_requests;
CREATE POLICY "Transferees can view transfer requests by email"
  ON public.transfer_requests FOR SELECT
  TO authenticated
  USING (
    LOWER(transferee_email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );

INSERT INTO public.transfer_requests (
  application_id,
  original_permit_id,
  transferor_user_id,
  transferee_email,
  transferee_phone,
  status,
  created_at,
  updated_at
)
SELECT
  a.id AS application_id,
  ((a.internal_notes::jsonb) ->> 'originalPermitId')::uuid AS original_permit_id,
  a.applicant_id AS transferor_user_id,
  LOWER(TRIM(a.internal_notes::jsonb #>> '{transferFormData,transfereeEmail}')) AS transferee_email,
  RIGHT(REGEXP_REPLACE(COALESCE(a.internal_notes::jsonb #>> '{transferFormData,transfereePhone}', ''), '\D', '', 'g'), 9) AS transferee_phone,
  CASE
    WHEN a.status = 'rejected' THEN 'rejected'
    ELSE 'pending'
  END AS status,
  COALESCE(a.created_at, NOW()) AS created_at,
  NOW() AS updated_at
FROM public.applications a
WHERE (a.application_type = 'transfer' OR COALESCE((a.internal_notes::jsonb) ->> 'isTransfer', 'false') = 'true')
  AND jsonb_typeof(a.internal_notes::jsonb) = 'object'
  AND COALESCE((a.internal_notes::jsonb) ->> 'originalPermitId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND POSITION('@' IN LOWER(TRIM(COALESCE(a.internal_notes::jsonb #>> '{transferFormData,transfereeEmail}', '')))) > 1
  AND LENGTH(RIGHT(REGEXP_REPLACE(COALESCE(a.internal_notes::jsonb #>> '{transferFormData,transfereePhone}', ''), '\D', '', 'g'), 9)) = 9
ON CONFLICT (application_id) DO UPDATE SET
  original_permit_id = EXCLUDED.original_permit_id,
  transferor_user_id = EXCLUDED.transferor_user_id,
  transferee_email = EXCLUDED.transferee_email,
  transferee_phone = EXCLUDED.transferee_phone,
  updated_at = NOW();
