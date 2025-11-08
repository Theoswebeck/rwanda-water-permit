# 🚀 IremboPay Setup - Complete Configuration

**Your IremboPay Credentials Received! Let's configure everything.**

---

## ⚡ STEP 1: Create/Update `.env.local` File

**Location:** `/Users/nourumuneza/go/src/waterpermit/.env.local`

**Copy and paste this entire content:**

```bash
# =============================================
# IremboPay Payment Integration - LIVE CREDENTIALS
# =============================================

# IremboPay Environment
IREMBOPAY_SANDBOX=false

# IremboPay API Keys
IREMBOPAY_API_KEY=sk_live_37dc025062934cf9809cd90ea1c89614
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=pk_live_e554eff2d06c4c95b621dd99d6e4cf40

# IremboPay Webhook Secret
IREMBOPAY_WEBHOOK_SECRET=rwb_webhook_2025_secure_${Math.random().toString(36)}

# Application Fee
NEXT_PUBLIC_APPLICATION_FEE_AMOUNT=35000
NEXT_PUBLIC_APPLICATION_FEE_CURRENCY=RWF

# Webhook Callback URL (webhook.site for testing)
IREMBOPAY_CALLBACK_URL=https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51

# Success/Failure URLs
IREMBOPAY_SUCCESS_URL=http://localhost:3000/dashboard?payment=success
IREMBOPAY_FAILURE_URL=http://localhost:3000/dashboard?payment=failed

# =============================================
# Supabase Configuration
# =============================================

NEXT_PUBLIC_SUPABASE_URL=https://ovlsblmbiwcqtkssnbpv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bHNibG1iaXdjcXRrc3NuYnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMzEzMDIsImV4cCI6MjA2NzcwNzMwMn0.4bAQ1lZ2571gYSFjq59h5CsnBGcu3qvKt4CS1a_eZpo

# ⚠️ CRITICAL: Get your service role key from Supabase Dashboard
# Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# =============================================
# App Configuration
# =============================================

NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## ⚡ STEP 2: Run Database Migration

**Open Supabase SQL Editor and run this:**

```sql
-- Run the complete migration
-- File: database/irembopay-payments-migration.sql
```

**Then update merchant configuration:**

```sql
-- Update merchant with your IremboPay credentials
UPDATE merchants 
SET 
  name = 'Rwanda Water Board',
  email = 'payments@rwb.gov.rw',
  api_key = 'sk_live_37dc025062934cf9809cd90ea1c89614',
  public_key = 'pk_live_e554eff2d06c4c95b621dd99d6e4cf40',
  callback_url = 'https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51',
  success_url = 'http://localhost:3000/dashboard?payment=success',
  failure_url = 'http://localhost:3000/dashboard?payment=failed',
  is_sandbox = FALSE,
  is_active = TRUE
WHERE id = (SELECT id FROM merchants LIMIT 1);

-- If no merchant exists, insert one
INSERT INTO merchants (
  name,
  email,
  api_key,
  public_key,
  callback_url,
  success_url,
  failure_url,
  is_sandbox,
  is_active
)
SELECT 
  'Rwanda Water Board',
  'payments@rwb.gov.rw',
  'sk_live_37dc025062934cf9809cd90ea1c89614',
  'pk_live_e554eff2d06c4c95b621dd99d6e4cf40',
  'https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51',
  'http://localhost:3000/dashboard?payment=success',
  'http://localhost:3000/dashboard?payment=failed',
  FALSE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM merchants LIMIT 1);

-- Verify configuration
SELECT 
  id,
  name,
  email,
  substring(api_key, 1, 10) || '...' as api_key_preview,
  substring(public_key, 1, 10) || '...' as public_key_preview,
  callback_url,
  is_sandbox,
  is_active,
  created_at
FROM merchants;
```

---

## ⚡ STEP 3: Get Supabase Service Role Key

**This is CRITICAL for webhooks to work!**

1. Go to: **Supabase Dashboard**
2. Click: **Settings** → **API**
3. Scroll to: **Project API keys**
4. Copy: **service_role** key (secret)
5. Update `.env.local`:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your_actual_key_here
   ```

---

## ⚡ STEP 4: Configure IremboPay Dashboard

**Go to IremboPay Dashboard and configure webhook:**

1. Login to: https://dashboard.irembopay.com/ (or your IremboPay dashboard URL)
2. Navigate to: **Settings** → **Webhooks** (or Integration)
3. Set **Webhook URL:** 
   ```
   https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
   ```
   
   **Note:** This is webhook.site for testing. Later, change to:
   ```
   https://yourdomain.com/api/payments/webhook
   ```

4. Enable these events:
   - ✅ `payment.initiated`
   - ✅ `payment.processing`
   - ✅ `payment.success`
   - ✅ `payment.failed`
   - ✅ `payment.cancelled`

5. **Save Configuration**

---

## ⚡ STEP 5: Test the Integration

**Terminal commands:**

```bash
# 1. Restart your dev server
npm run dev

# 2. Open browser
open http://localhost:3000

# 3. Test payment flow
# - Login as applicant
# - Go to "New Application"
# - Fill form
# - Click "Continue to Payment"
# - See IremboPay checkout
```

---

## 🔍 Verify Setup

**Run these checks:**

### ✅ Check 1: Environment Variables
```bash
# In your terminal
echo $IREMBOPAY_API_KEY  # Should not be empty
```

### ✅ Check 2: Database
```sql
-- In Supabase SQL Editor
SELECT COUNT(*) FROM payments;  -- Should work (even if 0 rows)
SELECT COUNT(*) FROM merchants; -- Should return 1
```

### ✅ Check 3: API Endpoints
```bash
# Test webhook endpoint is accessible
curl http://localhost:3000/api/payments/webhook
# Should return: {"message":"IremboPay Webhook Endpoint","status":"active"}
```

### ✅ Check 4: Webhook.site
- Open: https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
- Keep this tab open to see incoming webhooks
- When you make a test payment, webhooks will appear here!

---

## 🎯 Quick Test Payment

**Test with IremboPay test credentials:**

1. Complete application form
2. Click "Continue to Payment"
3. IremboPay checkout should load
4. Use test card:
   ```
   Card Number: 4242 4242 4242 4242
   Expiry: Any future date
   CVV: Any 3 digits
   ```
5. Complete payment
6. Check webhook.site - you should see the callback!
7. Payment status should update to "completed"

---

## 🔐 Security Checklist

- [ ] `.env.local` is in `.gitignore` ✅
- [ ] Never commit API keys to git ✅
- [ ] Service role key is set ✅
- [ ] Webhook URL is HTTPS (in production) ⚠️
- [ ] API keys are different for dev/prod ⚠️
- [ ] Rotate keys periodically 📅

---

## 🐛 Troubleshooting

### Issue: "Payment initiation failed"
**Solution:**
```bash
# Check environment variables are loaded
# Restart dev server
npm run dev
```

### Issue: "Webhook not received"
**Solution:**
1. Check webhook.site - is URL correct?
2. Verify IremboPay dashboard webhook config
3. Check webhook logs:
```sql
SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 10;
```

### Issue: "Application not found"
**Solution:**
- Make sure you clicked "Continue to Payment" after filling form
- Check if application was saved:
```sql
SELECT id, application_number, status FROM applications 
WHERE status = 'pending_payment' 
ORDER BY created_at DESC LIMIT 5;
```

---

## 📊 Monitor Payments

**Real-time monitoring queries:**

```sql
-- Active payments
SELECT 
  p.id,
  p.amount,
  p.status,
  p.created_at,
  a.application_number
FROM payments p
JOIN applications a ON a.id = p.application_id
WHERE p.created_at > NOW() - INTERVAL '1 hour'
ORDER BY p.created_at DESC;

-- Recent webhooks
SELECT 
  event_type,
  processed,
  received_at,
  substring(payload::text, 1, 100) as preview
FROM webhook_logs
ORDER BY received_at DESC
LIMIT 10;

-- Payment statistics
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM payments
GROUP BY status;
```

---

## 🚀 Production Deployment

**When ready for production:**

1. **Get Production Domain:**
   - Deploy to Vercel/your hosting
   - Get production URL (e.g., `https://waterpermit.rwb.gov.rw`)

2. **Update Webhook URL:**
   - In IremboPay dashboard, change webhook from webhook.site to:
   ```
   https://waterpermit.rwb.gov.rw/api/payments/webhook
   ```

3. **Update Environment Variables:**
   ```bash
   IREMBOPAY_CALLBACK_URL=https://waterpermit.rwb.gov.rw/api/payments/webhook
   IREMBOPAY_SUCCESS_URL=https://waterpermit.rwb.gov.rw/dashboard?payment=success
   IREMBOPAY_FAILURE_URL=https://waterpermit.rwb.gov.rw/dashboard?payment=failed
   NEXT_PUBLIC_APP_URL=https://waterpermit.rwb.gov.rw
   ```

4. **Test Production:**
   - Make a real payment
   - Verify webhooks are received
   - Check payment status updates

---

## 📞 Support

**If you need help:**

1. **IremboPay Issues:**
   - Support email: support@irembopay.com
   - Check their docs: https://docs.irembopay.com/

2. **Check Logs:**
   ```sql
   -- Payment errors
   SELECT * FROM webhook_logs 
   WHERE processed = false 
   ORDER BY received_at DESC;
   ```

3. **Browser Console:**
   - Open DevTools → Console
   - Look for payment-related errors

---

## ✅ Setup Complete!

**Your IremboPay integration is now configured with:**

- ✅ Live API Keys
- ✅ Public Key: `pk_live_e554eff2d06c4c95b621dd99d6e4cf40`
- ✅ Secret Key: `sk_live_37dc025062934cf9809cd90ea1c89614`
- ✅ Webhook URL: `https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51`
- ✅ Application Fee: 35,000 RWF
- ✅ Payment Tab: Integrated & Working

**Next:** Follow the steps above to complete setup and test!

---

**Last Updated:** October 11, 2025  
**Status:** Ready to Configure  
**Credentials:** ✅ Received & Secured

