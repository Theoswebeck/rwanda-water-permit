# 💳 IremboPay Payment Integration - Implementation Guide

## ✅ Implementation Status

**Completed:** ✅ Backend + Frontend + Database Schema

This guide explains the IremboPay payment integration for the Rwanda Water Board Water Permit System.

---

## 📋 What Has Been Implemented

### ✅ Database Layer
- **File:** `database/irembopay-payments-migration.sql`
- **Tables Created:**
  - `merchants` - IremboPay merchant configuration
  - `payments` - Main payment records
  - `payment_transactions` - Detailed transaction logs
  - `webhook_logs` - Webhook event audit trail
  - `payment_receipts` - Generated receipts
- **New Application Status:** `pending_payment`

### ✅ TypeScript Types
- **File:** `types/payment.ts`
- Complete type definitions for all payment entities
- IremboPay API request/response types
- Webhook payload types

### ✅ Backend APIs
1. **Payment Initiation:** `app/api/payments/initiate/route.ts`
   - POST `/api/payments/initiate`
   - Creates payment record and initiates IremboPay session

2. **Webhook Handler:** `app/api/payments/webhook/route.ts`
   - POST `/api/payments/webhook`
   - Processes IremboPay payment status callbacks
   - Updates payment and application status
   - Generates receipts

3. **Status Check:** `app/api/payments/[id]/status/route.ts`
   - GET `/api/payments/[id]/status`
   - Checks payment status from database
   - Optionally verifies with IremboPay API

### ✅ Core Libraries
- **File:** `lib/irembopay-client.ts`
  - IremboPay API client
  - Webhook signature validation
  - Payment status checking

- **File:** `lib/payment-utils.ts`
  - Payment utility functions
  - Amount formatting
  - Validation helpers

### ✅ React Hooks
- **File:** `hooks/usePayment.ts`
  - Custom hook for payment operations
  - Auto-polling for status updates
  - Error handling

### ✅ UI Components
1. **IremboPay Widget:** `components/payments/irembopay-widget.tsx`
   - Embeds IremboPay payment interface
   - Handles payment methods selection
   - Payment completion callbacks

2. **Payment Status:** `components/payments/payment-status.tsx`
   - Displays payment status with icons
   - Shows payment details
   - Retry and receipt download options

3. **Payment Tab:** `components/dashboard/payment-tab.tsx`
   - Main payment interface
   - Application summary
   - Payment flow management

### ✅ Configuration
- **File:** `config/environment.example`
- Updated with IremboPay environment variables

---

## 🚀 Setup Instructions

### Step 1: Get IremboPay Credentials

1. **Contact IremboPay:**
   - Email: irembopay@irembo.com
   - Website: https://irembo.com/irembopay/
   - Provide business registration documents

2. **Complete KYC Process:**
   - Business registration certificate
   - Tax identification number (TIN)
   - ID documents of key business owners

3. **Receive Credentials:**
   - API Key (keep secret!)
   - Public Key
   - Webhook Secret

4. **Access Dashboard:**
   - Sandbox: https://dashboard.sandbox.irembopay.com/auth/login
   - Production: https://dashboard.irembopay.com/auth/login

---

### Step 2: Run Database Migration

```bash
# In Supabase SQL Editor, run this file:
database/irembopay-payments-migration.sql
```

This will:
- ✅ Create all payment tables
- ✅ Add `pending_payment` status to applications
- ✅ Set up Row Level Security (RLS) policies
- ✅ Create indexes for performance

---

### Step 3: Configure Environment Variables

Update your `.env.local` file:

```bash
# IremboPay Configuration
IREMBOPAY_SANDBOX=true  # Set to false for production
IREMBOPAY_API_KEY=your_api_key_here
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=your_public_key_here
IREMBOPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Application Fee
NEXT_PUBLIC_APPLICATION_FEE_AMOUNT=35000
NEXT_PUBLIC_APPLICATION_FEE_CURRENCY=RWF

# Callback URLs
IREMBOPAY_CALLBACK_URL=https://yourdomain.com/api/payments/webhook
IREMBOPAY_SUCCESS_URL=https://yourdomain.com/dashboard?payment=success
IREMBOPAY_FAILURE_URL=https://yourdomain.com/dashboard?payment=failed

# Supabase Service Role Key (for webhooks)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

### Step 4: Update Merchant Configuration

After running the migration, update the merchant record in Supabase:

```sql
UPDATE merchants
SET 
  api_key = 'your_actual_irembopay_api_key',
  public_key = 'your_actual_irembopay_public_key',
  callback_url = 'https://yourdomain.com/api/payments/webhook',
  success_url = 'https://yourdomain.com/dashboard?payment=success',
  failure_url = 'https://yourdomain.com/dashboard?payment=failed',
  is_sandbox = TRUE  -- Change to FALSE for production
WHERE id = (SELECT id FROM merchants LIMIT 1);
```

---

### Step 5: Configure IremboPay Webhook

In your IremboPay dashboard:

1. Navigate to **Integration Details**
2. Set **Webhook URL:** `https://yourdomain.com/api/payments/webhook`
3. Enable these events:
   - `payment.initiated`
   - `payment.processing`
   - `payment.success`
   - `payment.failed`
   - `payment.cancelled`

---

### Step 6: Integrate Payment Tab into Application Form

**⚠️ MANUAL STEP REQUIRED**

You need to add the payment tab to your application form. Here's how:

#### Option A: Add as 5th Tab in `application-form-new.tsx`

```tsx
// components/dashboard/application-form-new.tsx

// 1. Import the PaymentTab component
import { PaymentTab } from '@/components/dashboard/payment-tab';

// 2. Add "payment" tab to the tabs array (around line 1744)
const tabs = ["applicant-info", "water-source", "intended-activity", "land-ownership", "payment"];

// 3. Add TabsTrigger for payment (around line 1484)
<TabsTrigger value="payment" className="flex items-center gap-1 text-xs">
  <CreditCard className="h-4 w-4" />
  <span>Payment</span>
</TabsTrigger>

// 4. Add TabsContent for payment (around line 3712, after land-ownership TabsContent)
<TabsContent value="payment" className="pt-6 space-y-6">
  <PaymentTab
    application={currentApplication}
    onPaymentSuccess={() => {
      // Handle payment success
      router.push('/dashboard?tab=applications&payment=success');
    }}
    onBack={() => setActiveTab('land-ownership')}
  />
</TabsContent>

// 5. Update submit logic to go to payment tab instead of submitting
// When user clicks "Submit Application" on land-ownership tab,
// instead of calling onSubmit, navigate to payment tab:
const handleSubmit = async (data: any) => {
  // Save as draft with status pending_payment
  await onSaveAsDraft(data, 'pending_payment');
  
  // Move to payment tab
  setActiveTab('payment');
};
```

#### Option B: Create Separate Payment Page

```tsx
// app/dashboard/payment/[id]/page.tsx

import { PaymentTab } from '@/components/dashboard/payment-tab';
import { useApplications } from '@/hooks/useApplications';

export default function PaymentPage({ params }: { params: { id: string } }) {
  const { getApplication } = useApplications();
  const [application, setApplication] = useState(null);

  useEffect(() => {
    getApplication(params.id).then(setApplication);
  }, [params.id]);

  if (!application) return <div>Loading...</div>;

  return (
    <DashboardLayout>
      <PaymentTab
        application={application}
        onPaymentSuccess={() => router.push('/dashboard')}
        onBack={() => router.back()}
      />
    </DashboardLayout>
  );
}
```

Then redirect to this page after application submission:
```tsx
router.push(`/dashboard/payment/${applicationId}`);
```

---

## 📊 Payment Flow Diagram

```
┌─────────────────────────────────────────────────┐
│ 1. User Fills Application Form (4 tabs)        │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 2. Click "Submit" → Save as pending_payment     │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 3. Navigate to Payment Tab                      │
│    - Show application summary                   │
│    - Display payment amount (35,000 RWF)        │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 4. Click "Proceed to Payment"                   │
│    - POST /api/payments/initiate                │
│    - Create payment record in DB                │
│    - Get IremboPay payment URL                  │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 5. Show IremboPay Widget                        │
│    - User selects payment method                │
│    - Completes payment                          │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 6. IremboPay Webhook Callback                   │
│    - POST /api/payments/webhook                 │
│    - Update payment status → completed          │
│    - Update application status → submitted      │
│    - Generate receipt                           │
└────────────────┬────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────┐
│ 7. Show Success Message                         │
│    - Display payment receipt                    │
│    - Redirect to dashboard                      │
│    - Application enters review workflow         │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Security Features

### ✅ Implemented Security Measures

1. **Webhook Signature Validation**
   - HMAC SHA256 signature verification
   - Prevents unauthorized webhook calls

2. **Authentication Required**
   - All API endpoints require valid session
   - User can only access their own payments

3. **Row Level Security (RLS)**
   - Database policies enforce user isolation
   - Service role bypasses RLS for webhooks

4. **No Sensitive Data Storage**
   - Card/mobile money details not stored
   - Only transaction references kept

5. **HTTPS Only**
   - All communications encrypted
   - Secure API calls

6. **Payment Amount Validation**
   - Server-side amount verification
   - Prevents amount tampering

---

## 🧪 Testing Instructions

### Sandbox Testing

1. **Start Development Server:**
```bash
npm run dev
```

2. **Create Test Application:**
   - Fill out application form
   - Submit to trigger payment

3. **Test Payment Flow:**
   - Use IremboPay sandbox credentials
   - Test different payment methods:
     - Mobile Money (MTN/Airtel)
     - Card (Test cards provided by IremboPay)
     - Bank Transfer

4. **Test Scenarios:**
   - ✅ Successful payment
   - ❌ Failed payment
   - 🚫 Cancelled payment
   - ⏱️ Expired payment session

### Check Database

```sql
-- Check payment records
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

-- Check webhook logs
SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 10;

-- Check payment transactions
SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 10;

-- Check application status
SELECT id, application_number, status FROM applications 
WHERE status IN ('pending_payment', 'submitted')
ORDER BY created_at DESC LIMIT 10;
```

---

## 📊 Monitoring & Analytics

### Payment Statistics Query

```sql
-- Payment statistics
SELECT 
  COUNT(*) as total_payments,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue
FROM payments
WHERE created_at >= NOW() - INTERVAL '30 days';
```

### Webhook Health Check

```sql
-- Check webhook processing
SELECT 
  event_type,
  COUNT(*) as total,
  COUNT(CASE WHEN processed = true THEN 1 END) as processed,
  COUNT(CASE WHEN processed = false THEN 1 END) as failed
FROM webhook_logs
WHERE received_at >= NOW() - INTERVAL '7 days'
GROUP BY event_type;
```

---

## 🐛 Troubleshooting

### Issue: Payment Not Initiating

**Check:**
1. ✅ Environment variables set correctly
2. ✅ IremboPay API key is valid
3. ✅ Application exists and user has access
4. ✅ Check browser console for errors

**Solution:**
```bash
# Check API logs
tail -f .next/server.log | grep PAYMENT

# Test API endpoint
curl -X POST http://localhost:3000/api/payments/initiate \
  -H "Content-Type: application/json" \
  -d '{"application_id": "your-app-id"}'
```

### Issue: Webhook Not Received

**Check:**
1. ✅ Webhook URL configured in IremboPay dashboard
2. ✅ Server is accessible from internet (use ngrok for local testing)
3. ✅ Webhook secret matches

**Solution:**
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "payment.success", "data": {...}}'

# Check webhook logs in database
SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 5;
```

### Issue: Payment Stuck in Pending

**Check:**
1. ✅ Webhook was received and processed
2. ✅ Payment status in IremboPay dashboard
3. ✅ Check webhook_logs table

**Solution:**
```sql
-- Manually check payment status
SELECT * FROM payments WHERE id = 'payment-id';

-- Check webhook logs
SELECT * FROM webhook_logs WHERE payment_id = 'payment-id';

-- If needed, manually update (for testing only!)
UPDATE payments 
SET status = 'completed', completed_at = NOW() 
WHERE id = 'payment-id';
```

---

## 📝 API Reference

### POST /api/payments/initiate

**Request:**
```json
{
  "application_id": "uuid",
  "amount": 35000,
  "currency": "RWF",
  "customer": {
    "email": "user@example.com",
    "phone": "+250788123456",
    "name": "John Doe"
  }
}
```

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "uuid",
    "status": "pending",
    "amount": 35000,
    "currency": "RWF",
    "irembo_payment_ref": "IPY_REF_12345",
    "payment_url": "https://checkout.irembopay.com/..."
  },
  "payment_url": "https://checkout.irembopay.com/..."
}
```

### POST /api/payments/webhook

**Payload:**
```json
{
  "event": "payment.success",
  "data": {
    "reference": "IPY_REF_12345",
    "status": "SUCCESS",
    "amount": 35000,
    "currency": "RWF",
    "transaction_id": "IPY_TXN_67890",
    "payment_method": "mobile_money",
    "payment_channel": "mtn_momo"
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

### GET /api/payments/[id]/status

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "uuid",
    "status": "completed",
    "amount": 35000,
    "currency": "RWF",
    "completed_at": "2025-10-11T12:00:00Z"
  }
}
```

---

## 🎯 Next Steps

### Immediate Actions:
1. ✅ Get IremboPay credentials
2. ✅ Run database migration
3. ✅ Configure environment variables
4. ✅ Integrate payment tab into application form
5. ✅ Test in sandbox environment

### Future Enhancements:
- 📄 PDF receipt generation
- 📧 Email notifications with receipts
- 📊 Admin payment dashboard
- 💰 Payment refund handling
- 📱 Mobile app integration

---

## 💡 Tips & Best Practices

1. **Always Test in Sandbox First**
   - Use sandbox environment extensively
   - Test all payment methods
   - Verify webhook handling

2. **Monitor Webhook Logs**
   - Regularly check webhook_logs table
   - Set up alerts for failed webhooks
   - Implement retry logic if needed

3. **Handle Edge Cases**
   - Payment timeouts
   - Network interruptions
   - Duplicate payments
   - Concurrent payment attempts

4. **Security**
   - Never expose API keys in frontend
   - Validate webhook signatures
   - Use HTTPS in production
   - Rotate keys periodically

5. **User Experience**
   - Show clear payment instructions
   - Provide payment status updates
   - Enable payment retry
   - Display helpful error messages

---

## 📞 Support Contacts

**IremboPay Support:**
- Email: irembopay@irembo.com
- Website: https://irembo.com/irembopay/
- Dashboard: https://dashboard.irembopay.com/

**Technical Documentation:**
- API Docs: https://docs.irembopay.com/v2.0/
- Sandbox: https://dashboard.sandbox.irembopay.com/

---

## ✅ Checklist

Before going live:

- [ ] IremboPay account created and verified
- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] Merchant configuration updated
- [ ] Webhook URL configured in IremboPay
- [ ] Payment tab integrated into application form
- [ ] Tested successful payment flow
- [ ] Tested failed payment handling
- [ ] Tested webhook processing
- [ ] Verified payment receipts generation
- [ ] Checked application status updates
- [ ] Production API keys obtained
- [ ] HTTPS enabled on domain
- [ ] Monitoring and logging set up
- [ ] User documentation created
- [ ] Support contacts established

---

**Implementation Date:** October 11, 2025  
**Status:** ✅ Ready for Integration Testing  
**Version:** 1.0.0

