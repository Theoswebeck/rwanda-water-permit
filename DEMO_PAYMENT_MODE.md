# Demo Payment Mode (IremboPay)

We’ve seen cases where **IremboPay sandbox checkout** shows a generic error (e.g. “Sorry, we are unable to proceed with your transaction…”) even though the invoice is created successfully.

For demos where we must simulate a full “successful payment” flow, we support **Demo Payment Mode**.

## What it does

When demo mode is enabled:

- ✅ We still call IremboPay to **create an invoice** (`invoice.created.success`).
- ✅ The UI **opens the IremboPay modal** so you can “attempt” the payment.
- ✅ The backend keeps the payment **pending** after invoice creation.
- ✅ During **status polling**, after a short delay, the backend **auto-completes** the payment and updates the application to **`submitted`**.
- ✅ Once the client observes the payment as `completed`, it closes the modal and follows the normal “success” UX.
  - `/dashboard?tab=applications&success=application-submitted`

This mimics a real success flow but **does not represent real money movement**.

## How to enable

Set these environment variables:

- **Client/UI**: `NEXT_PUBLIC_PAYMENT_DEMO_MODE=true`
- **Server/API**: `PAYMENT_DEMO_MODE=true`
- **Optional delay**: `PAYMENT_DEMO_COMPLETE_AFTER_MS=6000` (default 6000ms)

(`env.template` includes both.)

## Where it is implemented

- **Backend**: `app/api/payments/initiate/route.ts`
  - If demo mode is on, payment is inserted as `pending` (invoice creation only).
- **Backend**: `app/api/payments/[id]/status/route.ts`
  - If demo mode is on, payment is auto-completed during polling after `PAYMENT_DEMO_COMPLETE_AFTER_MS`.
- **Frontend**: `components/dashboard/payment-tab.tsx`
  - Closes modal when payment becomes `completed` and follows normal redirect UX.

## Cleanup plan (after the demo)

1. Set:
   - `NEXT_PUBLIC_PAYMENT_DEMO_MODE=false`
   - `PAYMENT_DEMO_MODE=false`
2. Remove demo-mode code paths in:
   - `app/api/payments/initiate/route.ts`
   - `components/dashboard/payment-tab.tsx`
3. Delete this document: `DEMO_PAYMENT_MODE.md`


