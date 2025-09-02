-- Check current user's company profile data
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
WHERE email = 'nizzogentl1@gmail.com'
ORDER BY created_at DESC;
