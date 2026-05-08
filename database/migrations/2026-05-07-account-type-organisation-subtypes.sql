-- Preserve the exact legal-entity subtype selected during applicant registration.
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'cooperative';
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'organization';
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'institution';
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'ngo_association';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS chk_organizational_fields;

ALTER TABLE public.users
  ADD CONSTRAINT chk_organizational_fields CHECK (
    (
      account_type::text IN ('company', 'cooperative', 'organization', 'institution', 'ngo_association')
      AND company_name IS NOT NULL
      AND company_tin IS NOT NULL
      AND company_address IS NOT NULL
      AND company_phone IS NOT NULL
    )
    OR account_type = 'individual'::public.account_type
  );
