# Fix Payment Retry Stuck State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the payment page so that when a payment attempt fails, users can immediately retry without needing to refresh, and prevent duplicate invoices from being created on each retry.

**Architecture:** Three coordinated fixes: (1) resolve the `awaitingGatewayConfirmation` stuck-state in `payment-tab.tsx`, (2) make the initiation API return the existing pending invoice instead of creating a new one, and (3) ensure the IremboPay widget always shows the "Open Payment Page" escape hatch.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL via `query()` helper, IremboPay JS SDK

---

## Root Cause Analysis

### Bug 1 (Critical) — UI frozen after payment callback failure

**File:** `components/dashboard/payment-tab.tsx:376-399`

Flow:
1. IremboPay modal fires `onFailed` callback (wrong PIN, user cancels, timeout)
2. `handlePaymentFailed` sets `setShowWidget(false)` + `setAwaitingGatewayConfirmation(true)`
3. `checkStatus(payment.id)` is called
4. If webhook hasn't arrived yet, DB still shows `pending` → neither `completed` nor `failed/cancelled` branch fires
5. `awaitingGatewayConfirmation` stays `true` forever → "Confirming payment with gateway…" spinner shown indefinitely
6. Auto-show widget effect (line 178) is guarded by `!awaitingGatewayConfirmation`, so widget never re-appears
7. Only a page refresh recovers the user

### Bug 2 (Critical) — New IremboPay invoice created on every retry

**File:** `app/api/payments/initiate/route.ts:296-323`

The duplicate-check only blocks `status = 'completed'` payments. If payment is `pending`, a new invoice is created in IremboPay AND a new payment row inserted every time the user clicks "Retry payment". Multiple invoices pile up for the same application.

### Bug 3 (Minor) — "Open Payment Page" URL constructed instead of using stored URL

**File:** `components/payments/irembopay-widget.tsx:74-76`

The widget builds `https://checkout.{env}.irembopay.com/{invoiceNumber}` independently. The actual URL returned by IremboPay (stored in `payment.payment_url`) should be used instead to avoid mismatches.

### Bug 4 (Minor) — Error state hides "Open Payment Page" button

**File:** `components/payments/irembopay-widget.tsx:262-274`

When the widget has a local `error` (e.g. failed callback), it renders only a "Retry Payment" (page reload) button. The "Open Payment Page" link disappears, leaving users with no escape hatch.

---

## Files Modified

| File | Change |
|------|--------|
| `components/dashboard/payment-tab.tsx` | Fix Bug 1: handle `pending` result in `handlePaymentFailed`; add timeout safety valve |
| `app/api/payments/initiate/route.ts` | Fix Bug 2: return existing pending payment instead of creating duplicate |
| `components/payments/irembopay-widget.tsx` | Fix Bug 3: accept `paymentPageUrl` prop; Fix Bug 4: show "Open Payment Page" in error state |

---

## Task 1 — Fix `handlePaymentFailed` stuck state (Bug 1)

**Files:**
- Modify: `components/dashboard/payment-tab.tsx:376-399`

The `else` branch (neither completed nor failed) is missing. When status is still `pending` after a failure callback, we must clear `awaitingGatewayConfirmation` and give the user a way to retry.

- [ ] **Step 1: Read the current `handlePaymentFailed` function**

Open `components/dashboard/payment-tab.tsx` and locate lines 349-399. Understand the existing branches: `isAlreadyPaid`, `completed`, `failed/cancelled`.

- [ ] **Step 2: Add the missing `pending` branch**

Replace the existing `checkStatus` promise chain inside `handlePaymentFailed` with one that also handles the `pending` case. The full updated function body (lines 349-400) should be:

```typescript
const handlePaymentFailed = (error?: any) => {
  console.log('❌ [PAYMENT TAB] Widget onFailed callback triggered at:', new Date().toISOString());
  console.log('❌ [PAYMENT TAB] Error details:', {
    message: error?.message,
    detail: error?.detail,
    code: error?.code,
    errors: error?.errors,
    fullError: error ? JSON.stringify(error, null, 2) : 'no error object',
  });

  const isAlreadyPaid = error?.code === 'BAD_INVOICES_PAID';
  if (isAlreadyPaid) {
    console.log('ℹ️ [PAYMENT TAB] Invoice already paid - treating as completed');
    setGatewayError(null);
    setPauseAutoPolling(false);
    setAwaitingGatewayConfirmation(true);
    setShowWidget(false);
    if (payment?.id) {
      checkStatus(payment.id);
    }
    return;
  }

  console.log('⚠️ [PAYMENT TAB] Gateway returned an error callback; verifying status before marking as failed');
  setGatewayError(null);
  setPauseAutoPolling(false);
  setAwaitingGatewayConfirmation(true);
  setShowWidget(false);

  if (payment?.id) {
    void checkStatus(payment.id)
      .then((latestPayment) => {
        if (latestPayment?.status === 'completed') {
          setGatewayError(null);
          setCompletedApplication(latestPayment.application);
          setPaymentCompleted(true);
          setAwaitingGatewayConfirmation(false);
          return;
        }

        if (latestPayment?.status === 'failed' || latestPayment?.status === 'cancelled') {
          setGatewayError(getGatewayErrorMessage(error));
          setAwaitingGatewayConfirmation(false);
          return;
        }

        // Payment is still pending (webhook not yet received).
        // The invoice is still active in IremboPay — let the user retry with it.
        console.log('⏳ [PAYMENT TAB] Payment still pending after failure callback — resetting for retry');
        setAwaitingGatewayConfirmation(false);
        setShowWidget(true);
        setGatewayError(
          'The payment attempt did not complete. Please try again using the payment options below.'
        );
      })
      .catch((statusError) => {
        console.error('❌ [PAYMENT TAB] Status verification after gateway error failed:', statusError);
        // On network error fall back to letting user retry
        setAwaitingGatewayConfirmation(false);
        setShowWidget(true);
        setGatewayError('Could not verify payment status. Please try again.');
      });
  } else {
    // No payment ID — cannot check status, just reset
    setAwaitingGatewayConfirmation(false);
    setGatewayError(getGatewayErrorMessage(error));
  }
};
```

- [ ] **Step 3: Add a safety-valve timeout for `awaitingGatewayConfirmation`**

After the existing `useEffect` at line 167 (the one that clears `awaitingGatewayConfirmation` on `failed/cancelled`), add a new effect that clears the flag after 30 seconds if no status update arrives:

```typescript
// Safety valve: if awaiting confirmation for > 30 s with no update, show retry
useEffect(() => {
  if (!awaitingGatewayConfirmation) return;

  const timer = setTimeout(() => {
    console.warn('⚠️ [PAYMENT TAB] Gateway confirmation timed out — resetting for retry');
    setAwaitingGatewayConfirmation(false);
    setShowWidget(!!payment?.irembo_payment_ref);
    setGatewayError(
      'Payment confirmation timed out. If you approved on your phone, click "Check payment status". Otherwise, try again.'
    );
  }, 30_000);

  return () => clearTimeout(timer);
}, [awaitingGatewayConfirmation, payment?.irembo_payment_ref]);
```

- [ ] **Step 4: Verify the fix manually**

Start the dev server. Open the payment tab for a test application. Trigger a payment failure (use the sandbox — attempt payment and cancel on the phone prompt). Confirm:
- The "Confirming payment with gateway…" spinner appears briefly
- Within ~2-3 seconds (status check response), the widget reappears with the error message
- The "Open Payment Page" button is visible
- No page refresh needed

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/payment-tab.tsx
git commit -m "fix: resolve stuck awaitingGatewayConfirmation state after payment failure

When IremboPay fires onFailed but the DB payment is still pending (webhook
not yet received), the UI was stuck forever at 'Confirming payment with
gateway...'. Now correctly resets to show the widget + retry options.
Adds a 30s safety-valve timeout as a secondary guard."
```

---

## Task 2 — Return existing pending invoice on retry (Bug 2)

**Files:**
- Modify: `app/api/payments/initiate/route.ts:264-323` (section 2: CHECK EXISTING PAYMENT)

Currently the duplicate check only blocks `completed` payments. We need an additional check: if there is an existing `pending` (non-expired) payment for this application, return it directly instead of creating a new IremboPay invoice.

- [ ] **Step 1: Add the pending-payment check**

In `app/api/payments/initiate/route.ts`, inside the `else` branch (default application_fee purpose, lines 296-323), replace the entire section with:

```typescript
} else {
  // Default behavior: block duplicate completed application fee payments
  if (applicationIdToUse) {
    // 1. Block if already completed
    const existingCompletedRes = await query(
      `
      select *
      from public.payments
      where application_id = $1
        and status = 'completed'
      order by created_at desc nulls last
      limit 1
      `,
      [applicationIdToUse]
    );
    if (existingCompletedRes.rows[0]) {
      console.warn('⚠️  [PAYMENT INITIATE] Payment already completed');
      return NextResponse.json(
        {
          success: false,
          error: 'Payment already completed for this application',
          payment: existingCompletedRes.rows[0],
        },
        { status: 400 }
      );
    }

    // 2. Reuse existing pending/processing invoice if not expired
    const existingPendingRes = await query(
      `
      select *
      from public.payments
      where application_id = $1
        and status in ('pending', 'processing')
        and (expires_at is null or expires_at > now())
      order by created_at desc nulls last
      limit 1
      `,
      [applicationIdToUse]
    );
    const existingPending = existingPendingRes.rows[0];
    if (existingPending) {
      console.log('♻️  [PAYMENT INITIATE] Reusing existing pending invoice:', existingPending.irembo_payment_ref);
      return NextResponse.json(
        {
          success: true,
          payment: existingPending,
          payment_url: existingPending.payment_url || '',
        },
        { status: 200 }
      );
    }
  }
}
```

- [ ] **Step 2: Verify the fix**

With the dev server running, check that hitting "Retry payment" no longer creates a new row in `public.payments`. Query:
```sql
select id, status, irembo_payment_ref, created_at
from public.payments
where application_id = '<your-test-app-id>'
order by created_at;
```
After multiple retries there should be only one `pending` row.

- [ ] **Step 3: Commit**

```bash
git add app/api/payments/initiate/route.ts
git commit -m "fix: reuse existing pending invoice instead of creating duplicates on retry

POST /api/payments/initiate now checks for a non-expired pending/processing
payment before hitting IremboPay. Returns the existing record so the widget
reuses the same invoice number, preventing duplicate invoices per application."
```

---

## Task 3 — Use stored `payment_url` and show "Open Payment Page" in error state (Bugs 3 & 4)

**Files:**
- Modify: `components/payments/irembopay-widget.tsx` (props + error state + URL)
- Modify: `components/dashboard/payment-tab.tsx` (pass `paymentPageUrl` prop)

- [ ] **Step 1: Add `paymentPageUrl` prop to the widget interface**

In `irembopay-widget.tsx`, update the `IremboPayWidgetProps` interface:

```typescript
interface IremboPayWidgetProps {
  invoiceNumber: string;
  publicKey: string;
  amount: number;
  currency?: string;
  isSandbox?: boolean;
  paymentPageUrl?: string; // Stored URL from IremboPay response (preferred over constructed URL)
  onSuccess?: () => void;
  onFailed?: (error?: any) => void;
  onClose?: () => void;
}
```

- [ ] **Step 2: Use `paymentPageUrl` when available**

In the widget function body, update the `paymentUrl` derivation (currently lines 73-76):

```typescript
// Use stored URL from gateway response when provided; fall back to constructed URL
const constructedPaymentUrl = isSandbox
  ? `https://checkout.sandbox.irembopay.com/${invoiceNumber}`
  : `https://checkout.irembopay.com/${invoiceNumber}`;
const paymentUrl = paymentPageUrl || constructedPaymentUrl;
```

Add `paymentPageUrl` to the destructured props:

```typescript
export function IremboPayWidget({
  invoiceNumber,
  publicKey,
  amount,
  currency = 'RWF',
  isSandbox = true,
  paymentPageUrl,
  onSuccess,
  onFailed,
  onClose,
}: IremboPayWidgetProps) {
```

- [ ] **Step 3: Show "Open Payment Page" in the error state**

Replace the current error state render (lines 262-274) with one that also includes the payment link:

```typescript
if (error) {
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Button
        onClick={() => window.open(paymentUrl, '_blank')}
        size="lg"
        className="w-full"
      >
        Open Payment Page
      </Button>
      <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
        Refresh Page
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Pass `paymentPageUrl` from `payment-tab.tsx`**

In `components/dashboard/payment-tab.tsx`, find every `<IremboPayWidget ...>` usage (lines ~703-715 and ~772-782) and add the `paymentPageUrl` prop:

```tsx
<IremboPayWidget
  invoiceNumber={payment.irembo_payment_ref}
  publicKey={IREMBOPAY_PUBLIC_KEY}
  amount={payment.amount}
  currency={payment.currency}
  isSandbox={IREMBOPAY_IS_SANDBOX}
  paymentPageUrl={payment.payment_url || undefined}
  onSuccess={handlePaymentSuccess}
  onFailed={handlePaymentFailed}
  onClose={() => console.log('Payment modal closed')}
/>
```

Do this for both occurrences.

- [ ] **Step 5: Verify**

Check that:
- `payment.payment_url` is non-null for a real payment (query the DB: `select payment_url from payments where id = '...'`)
- Clicking "Open Payment Page" opens the correct IremboPay checkout URL in a new tab
- When the widget shows an error state, both "Open Payment Page" and "Refresh Page" buttons are visible

- [ ] **Step 6: Commit**

```bash
git add components/payments/irembopay-widget.tsx components/dashboard/payment-tab.tsx
git commit -m "fix: use stored payment_url for checkout link; show Open Payment Page in error state

Widgets now accept paymentPageUrl prop and prefer it over the constructed
checkout URL, preventing mismatches if IremboPay uses a different URL format.
Error state now always shows an Open Payment Page escape hatch instead of
forcing a page reload."
```

---

## Self-Review

**Spec coverage:**

| Issue | Task covering it |
|-------|-----------------|
| UI stuck after payment failure (awaitingGatewayConfirmation) | Task 1 |
| Refresh needed to retry payment | Task 1 (now auto-resets) |
| New invoice created on every retry | Task 2 |
| "Open Payment Page" may point to wrong URL | Task 3 |
| Error state hides "Open Payment Page" | Task 3 |
| Multiple people affected (same code path) | All tasks |

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `paymentPageUrl?: string` prop added consistently in both interface and destructuring
- `payment.payment_url` is `string | null` in the `Payment` type — the `|| undefined` cast handles null correctly for the optional prop
- `awaitingGatewayConfirmation` and `showWidget` are existing `boolean` state vars — no type changes
