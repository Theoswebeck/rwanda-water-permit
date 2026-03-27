# 🚀 Test IremboPay Payment NOW - Quick Guide

## ✅ What's Ready

✅ **Testing mode is ENABLED**  
✅ **Payment tab is accessible without completing application**  
✅ **All IremboPay integration code is in place**  
✅ **Database tables are created**

---

## 🎯 Test in 3 Steps

### Step 1: Configure Environment Variables

Create/update `.env.local` with these values:

```env
# ============================================
# IREMBOPAY CONFIGURATION (Live Credentials)
# ============================================
IREMBOPAY_PUBLIC_KEY=pk_live_e554eff2d06c4c95b621dd99d6e4cf40
IREMBOPAY_SECRET_KEY=sk_live_37dc025062934cf9809cd90ea1c89614
IREMBOPAY_API_URL=https://api.irembopay.com/v1
IREMBOPAY_WEBHOOK_URL=https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51

# Application Fee
NEXT_PUBLIC_APPLICATION_FEE=50

# ============================================
# SUPABASE CONFIGURATION
# ============================================
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```

**Important:** Get your `SUPABASE_SERVICE_ROLE_KEY` from:
👉 https://supabase.com/dashboard/project/ovlsblmbiwcqtkssnbpv/settings/api

---

### Step 2: Configure Database Credentials

**Option A: Run Simple SQL (Recommended)**

1. Go to: https://supabase.com/dashboard/project/ovlsblmbiwcqtkssnbpv/sql
2. Paste the content from `database/simple-irembopay-setup.sql`
3. Click **"Run"**

**Option B: Run Full Configuration**

1. Open the file: `database/configure-irembopay-credentials.sql`
2. Copy all content
3. Go to Supabase SQL Editor
4. Paste and click **"Run"**

This will insert your IremboPay credentials into the `merchants` table.

---

### Step 3: Test the Payment Flow

**Option A: Quick Test (Direct Payment Tab)**

```bash
# Start dev server
npm run dev

# Open browser to:
http://localhost:3000/dashboard/new-application

# Click directly on the "Payment" tab (5th tab)
# Click "Proceed to Payment"
# Watch IremboPay widget load!
```

**Option B: Full Flow Test**

1. Go to `/dashboard/new-application`
2. Fill out tabs 1-4 (Applicant, Water Source, Activity, Land)
3. Click **"Continue to Payment"** on Land tab
4. Payment tab opens automatically
5. Click **"Proceed to Payment"**
6. Complete payment in IremboPay widget

---

## 🔍 What to Watch For

### ✅ Success Indicators

1. **Browser Console Logs:**
   ```
   🚀 Initiating payment for application: test-app-1234567890
   ✅ Payment initialized successfully
   ```

2. **IremboPay Widget Appears:**
   - Modal/iframe with payment form
   - Shows 50 RWF amount
   - Payment methods: Mobile Money, Cards, Bank Transfer

3. **Database Records Created:**
   ```sql
   -- Check in Supabase SQL Editor:
   SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 1;
   ```

4. **Webhook Receives Callback:**
   - Go to: https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
   - Should see POST requests from IremboPay after payment completion

---

## 🚨 Troubleshooting

### Issue: "Environment variable not set" error

**Fix:** Make sure `.env.local` exists and has all required variables. Restart dev server:
```bash
# Stop server (Ctrl+C)
npm run dev
```

---

### Issue: "Merchant not configured" error

**Fix:** Run the database configuration SQL:
```sql
-- Copy and run in Supabase SQL Editor:
-- Content from database/simple-irembopay-setup.sql
```

---

### Issue: Payment widget doesn't load

**Check:**
1. Browser console for errors
2. Network tab for failed API calls
3. IremboPay API credentials are correct
4. CORS is not blocking the widget

---

### Issue: Webhook not receiving callbacks

**Fix:**
1. Verify webhook URL is accessible: https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
2. Check IremboPay dashboard webhook configuration
3. Ensure webhook endpoint is publicly accessible (use ngrok for local testing)

---

## 📊 Verify Everything is Working

Run these checks in Supabase SQL Editor:

```sql
-- 1. Check merchant is configured
SELECT * FROM merchants WHERE name = 'Rwanda Water Resources Board';
-- Should return 1 row with your API keys

-- 2. Check payments table exists
SELECT COUNT(*) FROM payments;
-- Should return 0 (or number of test payments)

-- 3. Check payment_transactions table exists
SELECT COUNT(*) FROM payment_transactions;
-- Should return 0 (or number of test transactions)

-- 4. Check webhook_logs table exists
SELECT COUNT(*) FROM webhook_logs;
-- Should return 0 (or number of webhook events)

-- 5. Check application_status enum includes 'pending_payment'
SELECT unnest(enum_range(NULL::application_status));
-- Should include 'pending_payment' in the list
```

---

## 🎬 Next Steps After Testing

Once payment testing is successful:

1. ✅ **Document Test Results**
   - Which payment methods work
   - Average transaction time
   - Any error scenarios encountered

2. ✅ **Update Webhook URL**
   - Replace webhook.site with your actual webhook endpoint
   - Format: `https://yourdomain.com/api/payments/webhook`

3. ✅ **Add Production Safeguards**
   - Email confirmations
   - SMS notifications
   - Admin payment dashboard

4. ✅ **Revert Testing Mode** (when ready)
   - Follow instructions in `IREMBOPAY_TESTING_MODE.md`
   - Require completed application before payment

---

## 📞 Need Help?

**Error in Browser Console?**
- Copy the full error message
- Check file path and line number
- Look for "IREMBOPAY" in the error

**Database Issues?**
- Check Supabase logs
- Verify table structure matches migration
- Ensure RLS policies allow inserts

**IremboPay API Issues?**
- Verify API keys are correct
- Check IremboPay dashboard for transaction history
- Ensure you're using the right environment (sandbox vs. live)

---

## ✨ Quick Test Command

```bash
# One command to test everything
npm run dev && open http://localhost:3000/dashboard/new-application
```

Then click the **"Payment" tab** and **"Proceed to Payment"** 🚀

---

**Status:** 🧪 **Ready for Testing**  
**Estimated Setup Time:** 5 minutes  
**Prerequisites:** .env.local configured, database migration run, merchant credentials configured

