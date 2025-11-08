# ⚡ IremboPay Integration - Quick Setup

## 5-Step Setup Process

---

### ✅ Step 1: Get IremboPay Credentials (30 mins - 3 days)

**Contact IremboPay:**
```
Email: irembopay@irembo.com
Website: https://irembo.com/irembopay/
```

**What you'll receive:**
- API Key (secret)
- Public Key  
- Webhook Secret
- Dashboard Access

---

### ✅ Step 2: Database Setup (2 mins)

**In Supabase SQL Editor, run:**
```sql
-- File: database/irembopay-payments-migration.sql
-- This creates all payment tables
```

**Verify:**
```sql
SELECT * FROM payments LIMIT 1;
SELECT * FROM merchants LIMIT 1;
```

---

### ✅ Step 3: Environment Configuration (5 mins)

**Create/Update `.env.local`:**
```bash
# IremboPay
IREMBOPAY_SANDBOX=true
IREMBOPAY_API_KEY=your_api_key_here
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=your_public_key_here
IREMBOPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Fee
NEXT_PUBLIC_APPLICATION_FEE_AMOUNT=35000
NEXT_PUBLIC_APPLICATION_FEE_CURRENCY=RWF

# Webhook URL
IREMBOPAY_CALLBACK_URL=https://yourdomain.com/api/payments/webhook

# Supabase Service Role
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Update Merchant Config:**
```sql
UPDATE merchants SET 
  api_key = 'your_actual_api_key',
  callback_url = 'https://yourdomain.com/api/payments/webhook'
WHERE id = (SELECT id FROM merchants LIMIT 1);
```

---

### ✅ Step 4: Add Payment Tab to Form (10 mins)

**In `components/dashboard/application-form-new.tsx`:**

```tsx
// 1. Import at top
import { PaymentTab } from '@/components/dashboard/payment-tab';

// 2. Add "payment" to tabs array (line ~1744)
const tabs = ["applicant-info", "water-source", "intended-activity", "land-ownership", "payment"];

// 3. Add TabsTrigger (line ~1480)
<TabsTrigger value="payment">
  <CreditCard className="h-4 w-4" />
  <span>Payment</span>
</TabsTrigger>

// 4. Add TabsContent AFTER land-ownership TabsContent (line ~3712)
<TabsContent value="payment" className="pt-6">
  <PaymentTab
    application={currentApplication}
    onPaymentSuccess={() => router.push('/dashboard?tab=applications&payment=success')}
    onBack={() => setActiveTab('land-ownership')}
  />
</TabsContent>

// 5. Update submit handler to go to payment tab
// Change from: onSubmit(formData, 'submitted')
// To:
await onSaveAsDraft(formData, 'pending_payment');
setActiveTab('payment');
```

---

### ✅ Step 5: Configure IremboPay Webhook (3 mins)

**In IremboPay Dashboard:**

1. Login to dashboard
2. Go to **Integration Details**
3. Set **Webhook URL:** `https://yourdomain.com/api/payments/webhook`
4. Enable these events:
   - ✅ payment.success
   - ✅ payment.failed
   - ✅ payment.processing
   - ✅ payment.cancelled
5. **Save**

---

## 🧪 Test (5 mins)

```bash
# 1. Start server
npm run dev

# 2. Test flow:
# - Create application
# - Fill form
# - Submit (goes to payment tab)
# - Click "Proceed to Payment"
# - Complete payment with test card

# 3. Check database
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 5;
```

---

## 🎯 File Locations

**Backend:**
- API Routes: `app/api/payments/`
- Client Library: `lib/irembopay-client.ts`
- Utilities: `lib/payment-utils.ts`

**Frontend:**
- Payment Tab: `components/dashboard/payment-tab.tsx`
- IremboPay Widget: `components/payments/irembopay-widget.tsx`
- Payment Status: `components/payments/payment-status.tsx`

**Database:**
- Migration: `database/irembopay-payments-migration.sql`

**Documentation:**
- Full Guide: `IREMBOPAY_IMPLEMENTATION_GUIDE.md`
- Summary: `IREMBOPAY_INTEGRATION_SUMMARY.md`

---

## 🔍 Quick Checks

**Is it working?**

1. ✅ Payment tab appears after filling form
2. ✅ Can click "Proceed to Payment"
3. ✅ IremboPay widget loads
4. ✅ Can select payment method
5. ✅ Payment completes successfully
6. ✅ Status updates automatically
7. ✅ Application goes to "submitted"

**Check logs:**
```bash
# Browser console
# Look for: "✅ Payment initiated successfully"

# Database
SELECT * FROM payments WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## 🐛 Quick Troubleshooting

**Payment button doesn't work:**
- Check .env.local has all variables
- Restart dev server: `npm run dev`

**Webhook not received:**
- Check webhook URL in IremboPay dashboard
- For local testing, use ngrok: `ngrok http 3000`
- Update webhook URL to ngrok URL

**Payment stuck in pending:**
```sql
-- Check webhook logs
SELECT * FROM webhook_logs WHERE payment_id = 'your-payment-id';

-- Manually update (testing only!)
UPDATE payments SET status = 'completed' WHERE id = 'your-payment-id';
UPDATE applications SET status = 'submitted' WHERE id = 'your-app-id';
```

---

## 📞 Quick Contacts

**IremboPay:**
- Email: irembopay@irembo.com
- Sandbox: https://dashboard.sandbox.irembopay.com/
- Docs: https://docs.irembopay.com/v2.0/

---

## ✅ Pre-Production Checklist

- [ ] IremboPay production credentials
- [ ] Set `IREMBOPAY_SANDBOX=false`
- [ ] Production webhook URL configured
- [ ] HTTPS enabled
- [ ] Test production payment
- [ ] Monitor webhook logs

---

**Total Setup Time:** ~30 minutes (excluding IremboPay account approval)

**For detailed instructions:** See `IREMBOPAY_IMPLEMENTATION_GUIDE.md`

🚀 **Ready to integrate!**

