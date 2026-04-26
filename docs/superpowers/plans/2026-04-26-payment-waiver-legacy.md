# Payment Waiver for Legacy Pre-IremboPay Applicants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `payment_waived` boolean column to `public.applications` that, when true, bypasses the IremboPay payment gate so legacy offline-paying applicants can submit their applications.

**Architecture:** Single DB column + three small code touch points. The column defaults to `FALSE`, so no existing applications are affected. Operators set it via SQL for specific application numbers. The client-side payment gate reads the flag and skips the payment tab. The PATCH route blocks applicants from self-setting the flag.

**Tech Stack:** PostgreSQL (migration SQL), TypeScript (types), React/Next.js (component + API route)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `database/migrations/add-payment-waived.sql` | Create | DB migration — adds column |
| `types/database.ts` | Modify ~line 364 | Add `payment_waived?: boolean` to `Application` interface |
| `components/dashboard/application-form-new.tsx` | Modify ~line 1204 | Skip payment tab when `payment_waived` is true |
| `app/api/dashboard/applications/[id]/route.ts` | Modify ~line 25 | Block applicants from self-setting the flag |

---

## Task 1: Write the migration file

**Files:**
- Create: `database/migrations/add-payment-waived.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- database/migrations/add-payment-waived.sql
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_waived BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.applications.payment_waived IS
  'TRUE for applicants who paid offline before IremboPay was integrated. Bypasses the payment gate.';
```

- [ ] **Step 2: Commit**

```bash
git add database/migrations/add-payment-waived.sql
git commit -m "feat(db): add payment_waived column for legacy offline-pay applicants"
```

---

## Task 2: Add `payment_waived` to the TypeScript `Application` type

**Files:**
- Modify: `types/database.ts` ~line 362 (after `modification_reason?`, before `is_renewal?`)

- [ ] **Step 1: Add the field to the Application interface**

In `types/database.ts`, find the block that starts with `// Renewal tracking` (~line 362) and insert the new field directly above it:

```ts
  // Payment waiver for legacy offline-pay applicants (pre-IremboPay)
  payment_waived?: boolean

  // Renewal tracking
  is_renewal?: boolean
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors related to `payment_waived`.

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "feat(types): add payment_waived to Application interface"
```

---

## Task 3: Block applicants from self-setting `payment_waived` via PATCH

**Files:**
- Modify: `app/api/dashboard/applications/[id]/route.ts` ~line 25

- [ ] **Step 1: Add `payment_waived` to the blocked set**

In `app/api/dashboard/applications/[id]/route.ts`, find `toSafeApplicationPayload` (~line 24):

```ts
// BEFORE
const blocked = new Set(['id', 'applicant_id', 'created_at'])

// AFTER
const blocked = new Set(['id', 'applicant_id', 'created_at', 'payment_waived'])
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/applications/[id]/route.ts
git commit -m "feat(api): block applicants from self-setting payment_waived via PATCH"
```

---

## Task 4: Skip payment tab when `payment_waived` is true

**Files:**
- Modify: `components/dashboard/application-form-new.tsx` ~line 1201

- [ ] **Step 1: Update `shouldShowApplicantPaymentWidgetTab`**

Find the `shouldShowApplicantPaymentWidgetTab` constant (~line 1201):

```ts
// BEFORE
const shouldShowApplicantPaymentWidgetTab =
  !readOnly &&
  !isStaffView &&
  !isModification &&
  (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));

// AFTER
const shouldShowApplicantPaymentWidgetTab =
  !readOnly &&
  !isStaffView &&
  !isModification &&
  !currentApplication?.payment_waived &&
  (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. `payment_waived` is now typed as `boolean | undefined` on `Application`, so `?.payment_waived` resolves cleanly.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "feat(payment): skip payment tab for applications with payment_waived=true"
```

---

## Task 5: Push to both branches

- [ ] **Step 1: Push to prod branch**

```bash
git push origin chore/stage-unstaged-2026-03-01
```

- [ ] **Step 2: Fast-forward UAT branch**

```bash
git push origin chore/stage-unstaged-2026-03-01:chore/stage-unstaged-2026-03-01-uat
```

Expected: both pushes succeed with no conflicts.

---

## Task 6: Deploy migration to prod DB via SSH

> VPN must be connected to `10.10.82.199` before this task.

- [ ] **Step 1: SSH into prod and run the migration**

```bash
expect <<'EOF'
set timeout 60
spawn ssh -o StrictHostKeyChecking=no qtgentil@10.10.82.199
expect "password:"
send "Qgentil@123\r"
expect -re {\$ $}
send {PGPASSWORD='WP_Rwb2026!SecureDB' psql -U waterpermit_app -h 127.0.0.1 -d waterpermit -P pager=off -c "ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS payment_waived BOOLEAN NOT NULL DEFAULT FALSE;" -c "COMMENT ON COLUMN public.applications.payment_waived IS 'TRUE for applicants who paid offline before IremboPay was integrated. Bypasses the payment gate.';"}
send "\r"
expect -re {\$ $}
send "exit\r"
expect eof
EOF
```

Expected output:
```
ALTER TABLE
COMMENT
```

- [ ] **Step 2: Safety check — confirm zero rows have `payment_waived = true`**

```bash
expect <<'EOF'
set timeout 60
spawn ssh -o StrictHostKeyChecking=no qtgentil@10.10.82.199
expect "password:"
send "Qgentil@123\r"
expect -re {\$ $}
send {PGPASSWORD='WP_Rwb2026!SecureDB' psql -U waterpermit_app -h 127.0.0.1 -d waterpermit -P pager=off -c "SELECT application_number, status, payment_waived FROM public.applications WHERE payment_waived = true;"}
send "\r"
expect -re {\$ $}
send "exit\r"
expect eof
EOF
```

Expected output:
```
(0 rows)
```

If any rows appear that were NOT explicitly set, **stop and investigate** before continuing.

---

## Task 7: Apply waiver to affected applications

- [ ] **Step 1: Apply waiver to RWB-2026-000014 (and any other confirmed numbers)**

```bash
expect <<'EOF'
set timeout 60
spawn ssh -o StrictHostKeyChecking=no qtgentil@10.10.82.199
expect "password:"
send "Qgentil@123\r"
expect -re {\$ $}
send {PGPASSWORD='WP_Rwb2026!SecureDB' psql -U waterpermit_app -h 127.0.0.1 -d waterpermit -P pager=off -c "UPDATE public.applications SET payment_waived = true WHERE application_number IN ('RWB-2026-000014'); SELECT application_number, status, payment_waived FROM public.applications WHERE payment_waived = true;"}
send "\r"
expect -re {\$ $}
send "exit\r"
expect eof
EOF
```

Expected output:
```
UPDATE 1
 application_number |     status      | payment_waived
--------------------+-----------------+----------------
 RWB-2026-000014    | pending_payment | t
(1 row)
```

**To add more applications:** repeat the UPDATE with additional numbers in the `IN (...)` list.

- [ ] **Step 2: Verify applicant can now access the page without payment tab**

Wait ~2 minutes for cron to pull new code, then ask the affected applicant (hakizimanaeuhak80@gmail.com) to log in and check their application. The Payment tab should not appear. They should be able to submit directly.

---

## Rollback (if needed)

To undo the waiver for a specific application:
```sql
UPDATE public.applications SET payment_waived = false WHERE application_number = 'RWB-2026-000014';
```

To drop the column entirely (only if rolling back the full feature):
```sql
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_waived;
```
