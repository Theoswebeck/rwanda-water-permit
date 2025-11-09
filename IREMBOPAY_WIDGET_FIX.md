# IremboPay Widget Integration Fix

## 🐛 Problem

The previous implementation was **redirecting users to a checkout URL** like:
```
https://checkout.sandbox.irembopay.com/881108696904
```

This caused the error: **"Sorry, we are unable to proceed with your transaction. Kindly try again!"**

## ✅ Solution

According to [IremboPay's official documentation](https://irembopay.gitbook.io/irembopay-api-docs/integration/accepting-payments-on-your-website/openapi), we should use the **JavaScript Widget Integration** instead of redirecting.

### What Changed

#### Before (WRONG ❌)
```tsx
// Redirected user to external URL
window.location.href = paymentUrl; // https://checkout.sandbox.irembopay.com/[invoiceNumber]
```

#### After (CORRECT ✅)
```tsx
// Load IremboPay inline script
<Script src="https://dashboard.sandbox.irembopay.com/assets/payment/inline.js" />

// Call IremboPay.initiate() to open modal on YOUR website
window.IremboPay.initiate({
  publicKey: "your_public_key",
  invoiceNumber: "881108696904",
  locale: IremboPay.locale.EN,
  callback: (err, resp) => {
    if (!err) {
      // Payment success
    } else {
      // Payment error
    }
  }
});
```

## 📋 Implementation Details

### 1. Updated Widget Component

**File:** `components/payments/irembopay-widget.tsx`

**New Props:**
- `invoiceNumber` (string) - The invoice number from IremboPay API
- `publicKey` (string) - Your IremboPay public key
- `amount` (number) - Payment amount for display
- `currency` (string) - Currency code (default: RWF)
- `onSuccess` (function) - Success callback
- `onFailed` (function) - Error callback
- `onClose` (function) - Close callback

**Key Features:**
- ✅ Loads IremboPay inline script dynamically
- ✅ Opens payment modal on your own website (not redirect)
- ✅ Handles success/error callbacks
- ✅ Auto-detects sandbox vs production from public key
- ✅ Shows proper loading states
- ✅ Displays helpful error messages

### 2. Updated Payment Tab Component

**File:** `components/dashboard/payment-tab.tsx`

**Changes:**
```tsx
// Before
<IremboPayWidget
  paymentUrl={payment.payment_url}  // ❌ Wrong
  amount={payment.amount}
  // ...
/>

// After
<IremboPayWidget
  invoiceNumber={payment.irembo_payment_ref}  // ✅ Correct
  publicKey={process.env.NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY}  // ✅ Correct
  amount={payment.amount}
  // ...
/>
```

### 3. Environment Variables

**File:** `env.template`

Added required environment variables:
```bash
# IremboPay Payment Gateway Configuration
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=your_public_key_here
IREMBOPAY_SECRET_KEY=your_secret_key_here
IREMBOPAY_WEBHOOK_SECRET=your_webhook_secret_here
IREMBOPAY_PRODUCT_CODE=WATER_PERMIT_FEE
IREMBOPAY_ACCOUNT_ID=RWANDA_WATER_BOARD
```

**IMPORTANT:** Make sure to add `NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY` to your `.env.local` and `.env.production` files.

## 🚨 Error Codes Reference

Based on [IremboPay documentation](https://irembopay.gitbook.io/irembopay-api-docs/integration/accepting-payments-on-your-website/openapi#specific-error-scenarios), here are the possible errors:

### 1. INVALID_KEY
```json
{
  "message": "Invalid request",
  "success": false,
  "errors": [
    {
      "code": "INVALID_KEY",
      "detail": "Public key is not valid"
    }
  ]
}
```
**Solution:** Check your `NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY` in `.env.local`

### 2. INVOICE_NOT_FOUND
```json
{
  "message": "Invalid request",
  "success": false,
  "errors": [
    {
      "code": "INVOICE_NOT_FOUND",
      "detail": "Invoice not found"
    }
  ]
}
```
**Solution:** The invoice number doesn't exist. Check your payment initiation API.

### 3. BAD_INVOICES_PAID
```json
{
  "message": "Invalid request",
  "success": false,
  "errors": [
    {
      "code": "BAD_INVOICES_PAID",
      "detail": "Invoice has already been paid"
    }
  ]
}
```
**Solution:** This invoice was already paid. Create a new invoice.

### 4. BAD_INVOICES_PAYMENT_EXPIRED
```json
{
  "message": "Invalid request",
  "success": false,
  "errors": [
    {
      "code": "BAD_INVOICES_PAYMENT_EXPIRED",
      "detail": "Invoice has expired"
    }
  ]
}
```
**Solution:** The invoice expired. Create a new invoice.

### 5. BAD_INVOICES_IN_BATCH
```json
{
  "message": "Invalid request",
  "success": false,
  "errors": [
    {
      "code": "BAD_INVOICES_IN_BATCH",
      "detail": "Invoice is already linked to a Batch Invoice"
    }
  ]
}
```
**Solution:** This invoice is part of a batch. Use the batch invoice number instead.

### 6. INVOICE_MISSING
```json
{
  "code": "INVOICE_MISSING",
  "message": "Invoice required"
}
```
**Solution:** No invoice number provided. Check your widget props.

### 7. BAD_LOCALE
```json
{
  "code": "BAD_LOCALE",
  "message": "Unsupported locale"
}
```
**Solution:** Use valid locale: `IremboPay.locale.EN`, `IremboPay.locale.FR`, or `IremboPay.locale.RW`

## 🧪 Testing

### Sandbox Mode
- Uses: `https://dashboard.sandbox.irembopay.com/assets/payment/inline.js`
- API: `https://api.sandbox.irembopay.com`
- Public Key: Should contain "sandbox" or start with "test_"

### Production Mode
- Uses: `https://dashboard.irembopay.com/assets/payment/inline.js`
- API: `https://api.irembopay.com`
- Public Key: Production key from IremboPay dashboard

## 📚 Documentation References

- [IremboPay JavaScript Widget Integration](https://irembopay.gitbook.io/irembopay-api-docs/integration/accepting-payments-on-your-website/openapi)
- [IremboPay API Documentation](https://irembopay.gitbook.io/irembopay-api-docs)
- [Next.js Script Component](https://nextjs.org/docs/app/api-reference/components/script)

## ✅ Verification Checklist

Before testing payments, ensure:

- [ ] `NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY` is set in `.env.local`
- [ ] `IREMBOPAY_SECRET_KEY` is set in `.env.local`
- [ ] Public key matches the environment (sandbox/production)
- [ ] Product code exists in IremboPay dashboard
- [ ] Account ID is configured in IremboPay dashboard
- [ ] Webhook URL is configured (for payment notifications)
- [ ] Database migrations are applied (payments table exists)

## 🎯 Expected Behavior

1. User clicks "Proceed to Payment"
2. System calls `/api/payments/initiate`
3. API creates invoice with IremboPay
4. API returns invoice number and stores in database
5. Widget loads IremboPay inline script
6. Widget calls `IremboPay.initiate()` with invoice number and public key
7. **Payment modal opens ON YOUR WEBSITE** (not redirect)
8. User completes payment in the modal
9. Callback receives success/error response
10. System updates payment status via webhook

## 🔧 Troubleshooting

### Modal doesn't open
- Check browser console for errors
- Verify IremboPay script loaded successfully
- Check public key is correct
- Ensure invoice number exists

### Error: "Invalid request"
- Check the specific error code in the callback
- Refer to error codes section above
- Verify environment variables are set

### Payment not updating
- Check webhook configuration
- Verify webhook URL is accessible
- Check webhook secret matches
- Look at webhook logs in IremboPay dashboard

## 📞 Support

If you encounter issues:
1. Check browser console for detailed error messages
2. Review error codes in this document
3. Contact IremboPay support with error code and invoice number
4. Check IremboPay dashboard for transaction logs

---

**Last Updated:** 2025-11-09  
**Version:** 2.0 (JavaScript Widget Integration)

