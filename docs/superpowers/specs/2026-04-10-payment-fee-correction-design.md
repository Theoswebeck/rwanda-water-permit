# Payment Fee Correction — 20 RWF → 35,000 RWF

**Date:** 2026-04-10

## Problem

`PAYMENT_CONFIG.DEFAULT_FEE` in `lib/payment-utils.ts` was set to `20` (RWF) instead of `35000`. All applications submitted during this period were charged 20 RWF. Application RWB-2026-000007 is the one known affected production case — it paid 20 RWF, is now `under_review` with an assessor assigned, and must pay the remaining 34,980 RWF before review can proceed.

## Goals

1. Fix the fee for all future applications: 20 → 35,000 RWF.
2. Charge RWB-2026-000007 exactly 34,980 RWF (35,000 − 20 already paid).
3. Credit the original 20 RWF — keep the completed payment row so reports show 20 + 34,980 = 35,000 RWF total collected.
4. The applicant must not see a false "Payment Completed" screen when the balance is still due.

## Design

### Part 1 — Code fix (1 line)

`lib/payment-utils.ts:13`: `DEFAULT_FEE: 20` → `DEFAULT_FEE: 35000`

### Part 2 — `payment_override_amount` column

A new nullable column `payment_override_amount NUMERIC(15,2)` on `applications`. When set, it overrides the default fee for that specific application. This is how the 34,980 correction is expressed without touching global config.

**Migration:** `database/migrations/add-payment-override-amount.sql`

```sql
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_override_amount NUMERIC(15,2) DEFAULT NULL;
```

### Part 3 — Payment tab reads override amount

`components/dashboard/payment-tab.tsx` line 136:

```ts
// Before:
const applicationFee = getApplicationFee();

// After:
const applicationFee = (application as any)?.payment_override_amount != null
  ? Number((application as any).payment_override_amount)
  : getApplicationFee();
```

**Guard the "completed" auto-trigger** — when `payment_override_amount` is set and the existing completed payment's amount is less than it, the balance is not yet settled; skip the success screen:

```ts
useEffect(() => {
  if (payment && payment.status === 'completed' && !paymentCompleted && !isCompletingPayment) {
    const overrideAmount = (application as any)?.payment_override_amount != null
      ? Number((application as any).payment_override_amount)
      : null;
    // If a correction override is active and this payment covers less than the override, balance still due
    if (overrideAmount !== null && Number(payment.amount) < overrideAmount) return;
    // ... rest of existing completion logic unchanged
  }
}, [...]);
```

### Part 4 — Initiate API skips duplicate check when override is set

`app/api/payments/initiate/route.ts` — the `else` branch of the duplicate check (lines 295–323). The `application` object is already fetched before this point, so `application.payment_override_amount` is directly available.

```ts
// Before:
if (existingPayment) {
  return NextResponse.json({ success: false, error: 'Payment already completed...' }, { status: 400 });
}

// After:
if (existingPayment) {
  const hasOverride = application?.payment_override_amount != null;
  if (!hasOverride) {
    return NextResponse.json({ success: false, error: 'Payment already completed...' }, { status: 400 });
  }
  console.log('ℹ️ [PAYMENT INITIATE] Existing completed payment found but override amount is set — allowing correction payment');
}
```

### Part 5 — One-time DB fix for RWB-2026-000007

Run on production **after** deploying the code changes:

```sql
-- Revert to pending payment and set the correction override amount.
-- The existing 20 RWF completed payment row is intentionally left untouched —
-- it represents a real collection and counts as credit toward the 35,000 total.
UPDATE public.applications
SET  status                  = 'pending_payment',
     payment_override_amount = 34980,
     updated_at              = now()
WHERE application_number = 'RWB-2026-000007';
```

### Part 6 — Notify the applicant

Send via existing `sendSmtpEmail` + Pindo SMS after the DB fix:

> Subject: Action Required — Balance Payment for Application RWB-2026-000007
>
> Dear [Name],
>
> We identified a billing error on your water permit application RWB-2026-000007. The correct application fee is 35,000 RWF. You have already paid 20 RWF, which has been credited toward your balance.
>
> Please log in to your dashboard and complete the remaining payment of **34,980 RWF** to continue processing your application.
>
> Dashboard: https://waterpermit.rwb.rw/dashboard
>
> We apologise for the inconvenience.
>
> Rwanda Water Resources Board

## Post-Payment Flow

1. Applicant pays 34,980 RWF → IremboPay webhook fires
2. Webhook sets application `status → submitted`
3. Admin re-assigns the same assessor (one click — assessor identity is visible in the application's audit trail)

## Reporting

Both `payments` rows have `status = 'completed'` for this application:

| Amount | Purpose | Status |
|--------|---------|--------|
| 20 RWF | application_fee | completed |
| 34,980 RWF | application_fee | completed |
| **35,000 RWF** | | **total** |

Any report that sums `payments.amount WHERE status = 'completed'` will show the correct 35,000 RWF.

## Files Changed

| File | Change |
|------|--------|
| `lib/payment-utils.ts` | `DEFAULT_FEE: 20 → 35000` |
| `database/migrations/add-payment-override-amount.sql` | New migration — add `payment_override_amount` column |
| `components/dashboard/payment-tab.tsx` | Read override amount; guard completed auto-trigger |
| `app/api/payments/initiate/route.ts` | Skip duplicate-completed block when override is set |

## Edge Cases

| Case | Behaviour |
|------|-----------|
| `payment_override_amount` is NULL | Normal flow — `getApplicationFee()` used (35,000) |
| Override equals default fee | No functional difference — treated as normal payment |
| Applicant pays but webhook fails | Application stays `pending_payment`; applicant can retry from dashboard |
| Second correction needed | Set a new `payment_override_amount` — same mechanism reapplies |
