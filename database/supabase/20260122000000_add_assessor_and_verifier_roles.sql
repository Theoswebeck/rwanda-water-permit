-- Ensure staff roles used by the app exist in the user_role enum.
-- Some environments were initialized before 'assessor'/'verifier' were introduced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'user_role' AND t.typtype = 'e'
  ) THEN
    -- Assessor role (technical assessment stage)
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assessor';

    -- Verifier role (verification stage)
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'verifier';
  END IF;
END
$$;

