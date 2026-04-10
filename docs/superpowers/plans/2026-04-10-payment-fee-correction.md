# Payment Fee Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the application fee from 20 RWF to 35,000 RWF, and allow RWB-2026-000007 to pay the exact 34,980 RWF balance while crediting the 20 RWF already paid.

**Architecture:** A `payment_override_amount` column on `applications` lets admins set a one-off fee for a specific application. The payment tab reads it to show the correct amount; the initiate API reads it to skip the duplicate-payment guard that would otherwise block a second payment on an application that already has a completed row.

**Tech Stack:** Next.js (TypeScript), PostgreSQL, Supabase JS client, IremboPay

---

## File Structure

| File | What changes |
|------|-------------|
| `lib/payment-utils.ts` | `DEFAULT_FEE: 20 → 35000` |
| `database/migrations/add-payment-override-amount.sql` | New — adds `payment_override_amount` column |
| `components/dashboard/payment-tab.tsx` | Read override amount; guard completed auto-trigger |
| `app/api/payments/initiate/route.ts` | Skip duplicate-completed block when override is set |

---

### Task 1: Fix DEFAULT_FEE

**Files:**
- Modify: `lib/payment-utils.ts:13`

- [ ] **Step 1: Edit the constant**

In `lib/payment-utils.ts` change line 13:

```ts
export const PAYMENT_CONFIG = {
  DEFAULT_FEE: 35000,
  CURRENCY: 'RWF',
  PAYMENT_TIMEOUT_MINUTES: 3 * 24 * 60,
  RECEIPT_PREFIX: 'RWB-RCPT',
};
```

- [ ] **Step 2: Verify no other hardcoded 20-RWF references exist**

```bash
grep -r "DEFAULT_FEE\|getApplicationFee\b" /Users/nourumuneza/go/src/waterpermit --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v worktrees | grep -v ".next"
```

Expected: all callers use `getApplicationFee()` or `PAYMENT_CONFIG.DEFAULT_FEE` — no raw `20` fee literals.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add lib/payment-utils.ts
git commit -m "fix: correct DEFAULT_FEE from 20 to 35000 RWF"
```

---

### Task 2: Add payment_override_amount migration

**Files:**
- Create: `database/migrations/add-payment-override-amount.sql`

- [ ] **Step 1: Write the migration file**

Create `database/migrations/add-payment-override-amount.sql`:

```sql
-- Add optional per-application fee override.
-- When set, the payment tab and initiate API use this amount instead of DEFAULT_FEE.
-- NULL means use the system default.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_override_amount NUMERIC(15,2) DEFAULT NULL;
```

- [ ] **Step 2: Apply on local / dev database**

```bash
psql -U waterpermit_app -h localhost -d waterpermit -f database/migrations/add-payment-override-amount.sql
```

Expected output:
```
ALTER TABLE
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/add-payment-override-amount.sql
git commit -m "feat: add payment_override_amount column to applications"
```

---

### Task 3: Update payment-tab to read override amount

**Files:**
- Modify: `components/dashboard/payment-tab.tsx:136` (fee line)
- Modify: `components/dashboard/payment-tab.tsx:141-165` (completed useEffect)

- [ ] **Step 1: Replace the fee line (line 136)**

Find this exact line:

```ts
  const applicationFee = getApplicationFee();
```

Replace with:

```ts
  const applicationFee =
    (application as any)?.payment_override_amount != null
      ? Number((application as any).payment_override_amount)
      : getApplicationFee();
```

- [ ] **Step 2: Guard the completed auto-trigger (lines 141-165)**

Find this exact block:

```ts
  useEffect(() => {
    if (payment && payment.status === 'completed' && !paymentCompleted && !isCompletingPayment) {
      console.log('✅ Payment completed detected via polling');
      setAwaitingGatewayConfirmation(false);
```

Replace with:

```ts
  useEffect(() => {
    if (payment && payment.status === 'completed' && !paymentCompleted && !isCompletingPayment) {
      // If a correction override is active and this completed payment covers less than
      // the override amount, the balance is not yet settled — don't trigger success screen.
      const overrideAmount =
        (application as any)?.payment_override_amount != null
          ? Number((application as any).payment_override_amount)
          : null;
      if (overrideAmount !== null && Number(payment.amount) < overrideAmount) return;

      console.log('✅ Payment completed detected via polling');
      setAwaitingGatewayConfirmation(false);
```

- [ ] **Step 3: Verify the component compiles**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep -i "payment-tab" | head -20
```

Expected: no errors for payment-tab.tsx.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/payment-tab.tsx
git commit -m "feat: payment tab reads payment_override_amount for per-application fee"
```

---

### Task 4: Allow correction payment in initiate API

**Files:**
- Modify: `app/api/payments/initiate/route.ts:311-320`

- [ ] **Step 1: Update the duplicate-payment guard**

Find this exact block (lines 311-320):

```ts
        if (existingPayment) {
          console.warn('⚠️  [PAYMENT INITIATE] Payment already completed');
          return NextResponse.json(
            {
              success: false,
              error: 'Payment already completed for this application',
              payment: existingPayment,
            },
            { status: 400 }
          );
        }
```

Replace with:

```ts
        if (existingPayment) {
          const hasOverride = application?.payment_override_amount != null;
          if (!hasOverride) {
            console.warn('⚠️  [PAYMENT INITIATE] Payment already completed');
            return NextResponse.json(
              {
                success: false,
                error: 'Payment already completed for this application',
                payment: existingPayment,
              },
              { status: 400 }
            );
          }
          console.log('ℹ️  [PAYMENT INITIATE] Existing completed payment found but override amount is set — allowing correction payment');
        }
```

- [ ] **Step 2: Verify the route compiles**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep -i "initiate" | head -20
```

Expected: no errors for the initiate route.

- [ ] **Step 3: Commit**

```bash
git add app/api/payments/initiate/route.ts
git commit -m "feat: allow correction payment when application has payment_override_amount set"
```

---

### Task 5: Push to UAT branch

- [ ] **Step 1: Push**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git push origin chore/stage-unstaged-2026-03-01:chore/stage-unstaged-2026-03-01-uat
```

Expected: branch updated on remote.

---

### Task 6: Apply migration + one-time DB fix on production

> **Run these on the production server after the code is deployed.**

- [ ] **Step 1: Apply the migration**

```bash
psql -U waterpermit_app -h localhost -d waterpermit \
  -f /opt/waterpermit/database/migrations/add-payment-override-amount.sql
```

Expected:
```
ALTER TABLE
```

- [ ] **Step 2: Apply the one-time fix for RWB-2026-000007**

```sql
-- Revert to pending_payment and set the 34,980 RWF override.
-- The existing 20 RWF completed payment is intentionally kept —
-- it counts as credit toward the 35,000 total in payment reports.
UPDATE public.applications
SET  status                  = 'pending_payment',
     payment_override_amount = 34980,
     updated_at              = now()
WHERE application_number = 'RWB-2026-000007';
```

Expected:
```
UPDATE 1
```

- [ ] **Step 3: Verify**

```sql
SELECT application_number, status, payment_override_amount
FROM public.applications
WHERE application_number = 'RWB-2026-000007';
```

Expected:
```
 application_number | status          | payment_override_amount
--------------------+-----------------+-------------------------
 RWB-2026-000007    | pending_payment | 34980.00
```

---

### Task 7: Notify the applicant

- [ ] **Step 1: Look up the applicant's contact details**

```sql
SELECT u.first_name, u.last_name, u.company_name, u.email, u.phone
FROM public.applications a
JOIN public.users u ON u.id = a.applicant_id
WHERE a.application_number = 'RWB-2026-000007';
```

- [ ] **Step 2: Send email + SMS**

Use the existing admin notification tools (or trigger manually via the notification helper). Message template:

**Subject:** Action Required — Balance Payment for Application RWB-2026-000007

**Body:**
```
Dear [Name],

We identified a billing error on your water permit application RWB-2026-000007.
The correct application fee is 35,000 RWF. You have already paid 20 RWF,
which has been credited toward your balance.

Please log in to your dashboard and complete the remaining payment of 34,980 RWF
to continue processing your application.

Dashboard: https://waterpermit.rwb.rw/dashboard

We apologise for the inconvenience.

Rwanda Water Resources Board
```

- [ ] **Step 3: Verify applicant can see payment tab correctly**

Log in as the applicant (or check server logs) and confirm:
- Application shows status `pending_payment`
- Payment tab shows amount **34,980 RWF** (not 35,000)
- No "Payment Completed" flash from the old 20 RWF row
- Clicking Pay generates a new IremboPay invoice for 34,980 RWF
