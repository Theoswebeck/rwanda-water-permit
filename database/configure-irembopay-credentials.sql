-- =============================================
-- IremboPay Configuration - Set Your Credentials
-- Run this AFTER running irembopay-payments-migration.sql
-- =============================================

-- Step 1: Update or Insert Merchant Configuration
DO $$
BEGIN
  -- Try to update existing merchant
  UPDATE merchants 
  SET 
    name = 'Rwanda Water Resources Board',
    email = 'payments@rwb.gov.rw',
    phone = '+250788000000',
    api_key = 'sk_live_37dc025062934cf9809cd90ea1c89614',
    public_key = 'pk_live_e554eff2d06c4c95b621dd99d6e4cf40',
    callback_url = 'https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51',
    success_url = 'http://localhost:3000/dashboard?payment=success',
    failure_url = 'http://localhost:3000/dashboard?payment=failed',
    is_sandbox = FALSE,  -- Using LIVE credentials
    is_active = TRUE,
    updated_at = NOW()
  WHERE id = (SELECT id FROM merchants LIMIT 1);
  
  -- If no rows updated, insert new merchant
  IF NOT FOUND THEN
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
      FALSE,  -- Using LIVE credentials
      TRUE
    );
  END IF;
END $$;

-- Step 2: Verify Configuration
SELECT 
  '✅ Merchant Configuration' as status,
  id,
  name,
  email,
  substring(api_key, 1, 15) || '...' as api_key_preview,
  substring(public_key, 1, 15) || '...' as public_key_preview,
  callback_url,
  CASE 
    WHEN is_sandbox THEN '🧪 Sandbox Mode' 
    ELSE '🚀 Live Mode' 
  END as environment,
  CASE 
    WHEN is_active THEN '✅ Active' 
    ELSE '❌ Inactive' 
  END as status,
  created_at,
  updated_at
FROM merchants;

-- Step 3: Verify Tables Exist
SELECT 
  '✅ Database Tables' as status,
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('merchants', 'payments', 'payment_transactions', 'webhook_logs', 'payment_receipts')
ORDER BY table_name;

-- Step 4: Check Application Status Enum
SELECT 
  '✅ Application Statuses' as status,
  enumlabel as available_status
FROM pg_enum
WHERE enumtypid = 'application_status'::regtype
ORDER BY enumsortorder;

-- =============================================
-- IMPORTANT NOTES
-- =============================================

-- 📝 NEXT STEPS:
-- 
-- 1. Update .env.local file with these values:
--    IREMBOPAY_API_KEY=sk_live_37dc025062934cf9809cd90ea1c89614
--    NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=pk_live_e554eff2d06c4c95b621dd99d6e4cf40
--    IREMBOPAY_CALLBACK_URL=https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
--
-- 2. Get Supabase Service Role Key:
--    - Go to Supabase Dashboard → Settings → API
--    - Copy the 'service_role' key
--    - Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your_key_here
--
-- 3. Configure IremboPay Dashboard:
--    - Set webhook URL: https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
--    - Enable payment events
--
-- 4. Restart dev server:
--    npm run dev
--
-- 5. Test payment flow!
--
-- =============================================

-- Display success messages
DO $$
BEGIN
  RAISE NOTICE '✅ IremboPay configuration complete!';
  RAISE NOTICE '📝 Update .env.local with credentials';
  RAISE NOTICE '🔑 Get Supabase service_role key';
  RAISE NOTICE '🌐 Configure IremboPay dashboard webhook';
  RAISE NOTICE '🚀 Restart dev server and test!';
END $$;
