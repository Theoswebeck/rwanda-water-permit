# Payment Waiver for Legacy Pre-IremboPay Applicants

**Date:** 2026-04-26
**Status:** Approved
**Scope:** Up to ~10 applicants who paid offline before IremboPay was integrated

---

## Problem

When IremboPay was introduced, some applicants had already paid offline. Their applications were left at `pending_payment` status with no IremboPay payment record. The payment tab permanently blocks them from submitting — there is no path forward without charging them again.

## Goal

Allow specifically identified legacy applicants to submit without going through IremboPay. No other applicants must be affected. The bypass must be auditable and operator-controlled (not self-settable by applicants).

---

## Solution: `payment_waived` column

A boolean column `payment_waived` on `public.applications`. When `TRUE`, the payment gate is skipped for that application. Operators set it via SQL for named application numbers. Applicants cannot set it themselves (blocked at the API layer).

---

## Database

### Migration

File: `database/migrations/add-payment-waived.sql`

```sql
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_waived BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.applications.payment_waived IS
  'TRUE for applicants who paid offline before IremboPay was integrated. Bypasses the payment gate.';
```

Run on prod DB via SSH after deploying the code.

### Applying the waiver

```sql
UPDATE public.applications
SET payment_waived = true
WHERE application_number IN (
  'RWB-2026-000014'
  -- add more as confirmed by RWB staff
);
```

### Safety verification query

Run before and after to confirm no collateral damage:

```sql
SELECT application_number, applicant_id, status, payment_waived
FROM public.applications
WHERE payment_waived = true;
```

Expected: only the explicitly listed application numbers.

---

## Code Changes

### 1. `components/dashboard/application-form-new.tsx` — payment gate flag

Line ~1201, `shouldShowApplicantPaymentWidgetTab`:

```ts
const shouldShowApplicantPaymentWidgetTab =
  !readOnly &&
  !isStaffView &&
  !isModification &&
  !currentApplication?.payment_waived &&          // ← skip payment tab for waived apps
  (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));
```

The submit handler gate at line ~3157 already derives from this flag — no additional change needed there.

### 2. `app/api/dashboard/applications/[id]/route.ts` — block self-service

Add `payment_waived` to the `blocked` set in `toSafeApplicationPayload` so applicants cannot PATCH it themselves:

```ts
const blocked = new Set(['id', 'applicant_id', 'created_at', 'payment_waived'])
```

### 3. TypeScript types — add field

Add `payment_waived?: boolean` to the application type definition so the component can read it without errors.

---

## Deployment Sequence

1. Write migration file and commit to both prod + UAT branches
2. SSH into `qtgentil@10.10.82.199`
3. Run migration SQL against prod DB (`ALTER TABLE`)
4. Run safety SELECT — confirm `payment_waived = true` returns 0 rows
5. Run UPDATE for known affected application numbers
6. Re-run safety SELECT — confirm only targeted rows affected
7. Cron pulls new code within ~2 min; no manual restart needed

---

## Security Properties

- `payment_waived` is in the `blocked` set — applicants cannot set it via PATCH
- Only operators with DB access (SSH to prod) can activate the waiver
- The column defaults to `FALSE` — no existing applications are affected by the migration
- Safety SELECT after migration confirms zero unintended rows before any UPDATE runs

---

## What Does NOT Change

- All other applicants continue through the normal IremboPay payment flow
- The payment tab still renders for `draft` and `pending_payment` applications
- Staff views are unaffected
- Webhook, payment initiation, and notification flows are untouched

---

## Affected Files

| File | Change |
|------|--------|
| `database/migrations/add-payment-waived.sql` | New migration |
| `components/dashboard/application-form-new.tsx` | Add `payment_waived` to gate condition |
| `app/api/dashboard/applications/[id]/route.ts` | Block in `toSafeApplicationPayload` |
| `types/` (application type) | Add `payment_waived?: boolean` |
