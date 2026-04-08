-- Make original_permit_id nullable to support manual (non-system) permits in transfers.
-- For permits not in the permits table the column is stored as NULL; the actual permit
-- number is kept in applications.internal_notes->>'originalPermitNumber'.
ALTER TABLE public.transfer_requests
  ALTER COLUMN original_permit_id DROP NOT NULL;
