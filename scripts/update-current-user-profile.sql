-- Update the currently logged-in user's profile with correct information
-- Replace the values below with your actual information

-- Current user ID from console: d3a8bf45-f01c-4e48-940a-54d2cc8995e2
-- Update this user's profile with the correct information

UPDATE public.users 
SET 
  first_name = 'NOURU',
  last_name = 'MUNEZA', 
  phone = '1 1990 9 00000000 2 00',
  profile_completed = true,
  updated_at = NOW()
WHERE 
  id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2'
  AND email = 'nizzogent11@gmail.com';

-- Verify the update
SELECT id, email, first_name, last_name, phone, profile_completed, updated_at 
FROM public.users 
WHERE id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2';
