-- Cleanup duplicate users for the current issue
-- This will merge the good data into the auth user and remove the duplicate

-- Step 1: Update the auth user with the real profile data
UPDATE public.users 
SET 
  first_name = 'NOURU',
  last_name = 'MUNEZA',
  phone = '+250788598603',
  id_number = '1 1990 9 0000000 2 00',
  profile_completed = true,
  updated_at = NOW()
WHERE 
  id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2'
  AND email = 'nizzogentl1@gmail.com';

-- Step 2: Delete the duplicate user (the one with the real data but wrong ID)
DELETE FROM public.users 
WHERE 
  id = 'e807f4bd-5105-4a82-ae81-1e710d73b8ad'
  AND email = 'NIZZOGENTL1@GMAIL.COM';

-- Step 3: Verify the result
SELECT 
  id, 
  email, 
  first_name, 
  last_name, 
  phone, 
  id_number,
  profile_completed,
  created_at,
  updated_at
FROM public.users 
WHERE email ILIKE '%nizzogentl1%'
ORDER BY created_at DESC;

-- Expected result: Only one user with:
-- - id: d3a8bf45-f01c-4e48-940a-54d2cc8995e2
-- - email: nizzogentl1@gmail.com  
-- - first_name: NOURU
-- - last_name: MUNEZA
-- - phone: +250788598603
