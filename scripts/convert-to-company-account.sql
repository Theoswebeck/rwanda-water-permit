-- Convert current user to company account with sample data
UPDATE public.users 
SET 
  account_type = 'company',
  company_name = 'NOURU TECH SOLUTIONS',
  company_tin = '123456789',
  company_address = 'KN 3 Avenue, Kigali',
  company_phone = '+250788999888',
  first_name = null,
  last_name = null,
  phone = null,
  id_number = null,
  profile_completed = true,
  updated_at = NOW()
WHERE 
  id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2'
  AND email = 'nizzogentl1@gmail.com';

-- Verify the update
SELECT 
  id, 
  email, 
  account_type,
  company_name, 
  company_tin,
  company_address,
  company_phone,
  first_name, 
  last_name, 
  phone,
  profile_completed,
  created_at,
  updated_at
FROM public.users 
WHERE id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2';
