-- =============================================
-- Simple IremboPay Setup - Quick & Easy
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Update or create merchant with your credentials
INSERT INTO merchants (
  name,
  email,
  phone,
  api_key,
  public_key,
  callback_url,
  success_url,
  failure_url,
  is_sandbox,
  is_active
) VALUES (
  'Rwanda Water Resources Board',
  'payments@rwb.gov.rw',
  '+250788000000',
  'sk_live_37dc025062934cf9809cd90ea1c89614',
  'pk_live_e554eff2d06c4c95b621dd99d6e4cf40',
  'https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51',
  'http://localhost:3000/dashboard?payment=success',
  'http://localhost:3000/dashboard?payment=failed',
  FALSE,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  api_key = EXCLUDED.api_key,
  public_key = EXCLUDED.public_key,
  callback_url = EXCLUDED.callback_url,
  success_url = EXCLUDED.success_url,
  failure_url = EXCLUDED.failure_url,
  is_sandbox = EXCLUDED.is_sandbox,
  updated_at = NOW();

-- Step 2: Verify configuration
SELECT 
  id,
  name,
  email,
  substring(api_key, 1, 15) || '...' as api_key,
  substring(public_key, 1, 15) || '...' as public_key,
  callback_url,
  is_sandbox,
  is_active
FROM merchants;

