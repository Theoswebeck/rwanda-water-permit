-- Fix the current user's account to be a company account instead of individual
-- Based on the registration data provided: Foothill College

UPDATE users 
SET 
  account_type = 'company',
  company_name = 'Foothill College',
  company_tin = '123456789',
  company_address = '698 E DUANE AVE',
  company_phone = '+250788598603',
  id_type = 'tin',
  id_number = '123456789',
  first_name = NULL,
  last_name = NULL,
  updated_at = NOW()
WHERE id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2';

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
  updated_at
FROM users 
WHERE id = 'd3a8bf45-f01c-4e48-940a-54d2cc8995e2';
