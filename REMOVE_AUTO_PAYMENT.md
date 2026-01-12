# 🚨 URGENT: Remove Auto-Payment Demo Mode

## Environment Variables to Update

Add these to your `.env.local` or Vercel environment variables:

```env
# Disable payment demo mode
NEXT_PUBLIC_PAYMENT_DEMO_MODE=false
PAYMENT_DEMO_MODE=false

# Remove or comment out this line
# PAYMENT_DEMO_COMPLETE_AFTER_MS=18000
```

## Code Changes Implemented

1. ✅ Removed auto-completion logic from payment status route
2. ✅ Removed demo mode flags from payment initiation 
3. ✅ Cleaned up demo mode checks

## Testing Instructions

1. Update your environment variables as shown above
2. Restart your Next.js development server
3. Test a payment flow - it should now use real IremboPay integration
4. Payment will NOT auto-complete after countdown
5. Users must complete payment through IremboPay gateway

## Important Notes

- The real payment flow requires valid IremboPay credentials
- Ensure these environment variables are set:
  - `IREMBOPAY_CLIENT_ID`
  - `IREMBOPAY_CLIENT_SECRET`
  - `IREMBOPAY_BASE_URL`
  - `IREMBOPAY_ACCOUNT_ID`
  - `IREMBOPAY_PRODUCT_CODE`