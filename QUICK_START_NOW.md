# ⚡ QUICK START - IremboPay Payment Integration

**Everything you need to get payments working RIGHT NOW!**

---

## 🎯 Your Credentials (Received)

✅ **Public Key:** `pk_live_e554eff2d06c4c95b621dd99d6e4cf40`  
✅ **Secret Key:** `sk_live_37dc025062934cf9809cd90ea1c89614`  
✅ **Webhook URL:** `https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51`

---

## 🚀 3-Step Setup (5 Minutes)

### **STEP 1: Configure Environment Variables** (2 mins)

**Create/Edit file:** `.env.local` in your project root

**Copy this ENTIRE content:**

```bash
# IremboPay Live Credentials
IREMBOPAY_SANDBOX=false
IREMBOPAY_API_KEY=sk_live_37dc025062934cf9809cd90ea1c89614
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=pk_live_e554eff2d06c4c95b621dd99d6e4cf40
IREMBOPAY_WEBHOOK_SECRET=rwb_2025_secure_webhook

# Payment Configuration
NEXT_PUBLIC_APPLICATION_FEE_AMOUNT=35000
NEXT_PUBLIC_APPLICATION_FEE_CURRENCY=RWF
IREMBOPAY_CALLBACK_URL=https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51
IREMBOPAY_SUCCESS_URL=http://localhost:3000/dashboard?payment=success
IREMBOPAY_FAILURE_URL=http://localhost:3000/dashboard?payment=failed

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://ovlsblmbiwcqtkssnbpv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bHNibG1iaXdjcXRrc3NuYnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMzEzMDIsImV4cCI6MjA2NzcwNzMwMn0.4bAQ1lZ2571gYSFjq59h5CsnBGcu3qvKt4CS1a_eZpo

# ⚠️ GET THIS FROM SUPABASE DASHBOARD
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App Config
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Get Service Role Key:**
1. Go to: https://supabase.com/dashboard/project/ovlsblmbiwcqtkssnbpv/settings/api
2. Copy the **service_role** key (bottom section)
3. Replace `your_service_role_key_here` with actual key

---

### **STEP 2: Run Database Setup** (2 mins)

**Open Supabase SQL Editor:**
https://supabase.com/dashboard/project/ovlsblmbiwcqtkssnbpv/sql

**Run these 2 SQL files in order:**

**A. First, run the migration:**
```sql
-- Copy and paste ENTIRE content from:
database/irembopay-payments-migration.sql
```

**B. Then, configure credentials:**
```sql
-- Copy and paste ENTIRE content from:
database/configure-irembopay-credentials.sql
```

**Verify it worked:**
```sql
SELECT * FROM merchants;
-- Should show 1 row with your credentials
```

---

### **STEP 3: Start Dev Server** (1 min)

```bash
# Restart server to load new env variables
npm run dev
```

**Open:** http://localhost:3000

---

## ✅ Test Payment Flow (2 Minutes)

1. **Login** to your app
2. **Go to:** New Application
3. **Fill form** (all 4 tabs)
4. **Click:** "Continue to Payment"
5. **See:** IremboPay payment interface!

---

## 🔍 Monitor Webhooks

**Open this in a new tab:**
https://webhook.site/cfa1c7cd-1a14-45e1-a0f1-3e07def69c51

When you make a test payment, you'll see the webhook callback appear here in real-time!

---

## 🧪 Test Payment Methods

### **Option 1: IremboPay Test Card**
```
Card Number: 4242 4242 4242 4242
Expiry: 12/25 (any future date)
CVV: 123 (any 3 digits)
Name: Test User
```

### **Option 2: Mobile Money**
Use test MTN/Airtel numbers provided by IremboPay

---

## 🐛 Troubleshooting

### **Payment button does nothing:**
```bash
# Check browser console for errors
# F12 → Console tab

# Check env variables loaded:
echo $IREMBOPAY_API_KEY
```

### **"Payment initiation failed":**
```bash
# Restart dev server
npm run dev

# Check .env.local file exists and has correct values
cat .env.local | grep IREMBOPAY
```

### **Webhook not received:**
1. Check webhook.site is open
2. Verify URL in IremboPay dashboard matches
3. Make sure webhook URL is correct in `.env.local`

### **Database errors:**
```sql
-- Check tables exist:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%payment%';

-- Should show: payments, payment_transactions, payment_receipts, webhook_logs
```

---

## 📊 Check Payment Status

```sql
-- See all payments
SELECT 
  id,
  amount,
  status,
  created_at,
  irembo_payment_ref
FROM payments
ORDER BY created_at DESC
LIMIT 10;

-- See webhook logs
SELECT 
  event_type,
  processed,
  received_at
FROM webhook_logs
ORDER BY received_at DESC
LIMIT 10;
```

---

## 🎯 What Happens When Payment Succeeds?

1. ✅ User completes payment
2. 📨 IremboPay sends webhook to webhook.site
3. 🔄 Our webhook handler processes it
4. 💾 Payment status → "completed"
5. 📋 Application status → "submitted"
6. 🧾 Receipt generated automatically
7. ✅ User sees success message
8. 📧 (Optional) Send email confirmation

---

## 🚀 Production Deployment

**When ready for production:**

1. **Deploy to Vercel/Hosting**
2. **Update webhook URL** in IremboPay dashboard from:
   ```
   https://webhook.site/... 
   → 
   https://yourdomain.com/api/payments/webhook
   ```
3. **Update `.env.local`** with production URLs
4. **Test with real payment!**

---

## 📞 Need Help?

**IremboPay Support:**
- Email: support@irembopay.com
- Docs: https://docs.irembopay.com/

**Check Setup:**
- Environment: `IREMBOPAY_SETUP_COMMANDS.md`
- Full Guide: `IREMBOPAY_IMPLEMENTATION_GUIDE.md`

---

## ✅ Setup Checklist

- [ ] `.env.local` created with all variables
- [ ] Supabase service_role key added
- [ ] Database migration run (irembopay-payments-migration.sql)
- [ ] Credentials configured (configure-irembopay-credentials.sql)
- [ ] Dev server restarted
- [ ] Webhook.site tab open
- [ ] Test payment completed successfully
- [ ] Webhook received
- [ ] Payment status updated to "completed"

---

## You're Ready!

**All configured with:**
- ✅ Live API Keys
- ✅ Payment Tab Integrated
- ✅ Webhook Configured
- ✅ Database Ready
- ✅ Testing Enabled

**Start testing payments NOW!** 🚀

---

**Last Updated:** October 11, 2025  
**Status:** ✅ Credentials Configured  
**Next:** Test Payment Flow

