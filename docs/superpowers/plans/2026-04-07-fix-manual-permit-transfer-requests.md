# Fix Manual Permit Transfer Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix manual permits (not in the permits DB) not appearing in the transferee's incoming transfers list after staff approval.

**Architecture:** Two-part fix — (1) drop the `NOT NULL` constraint on `transfer_requests.original_permit_id` so manual permits (which have no DB permit row) can be stored with `null`, and (2) fix the backfill logic in `transfer-pending-terms.ts` which passes the raw sentinel string `"manual-..."` as a UUID parameter, causing an exception that aborts the notification flow.

**Tech Stack:** PostgreSQL (migration), TypeScript (Node/Next.js API route)

---

### Task 1: Migration — make `original_permit_id` nullable

**Files:**
- Create: `database/migrations/allow-null-original-permit-id-for-manual-transfers.sql`
- Modify: `database/migrations/create-transfer-requests.sql` (line 18)
- Modify: `database/migrations/ensure-transfer-requests-and-backfill.sql` (line 13)

- [ ] **Step 1: Create the migration file**

```sql
-- Make original_permit_id nullable to support manual (non-system) permits in transfers.
-- For permits not in the permits table the column is stored as NULL; the actual permit
-- number is kept in applications.internal_notes->>'originalPermitNumber'.
ALTER TABLE public.transfer_requests
  ALTER COLUMN original_permit_id DROP NOT NULL;
```

- [ ] **Step 2: Update create-transfer-requests.sql so future fresh installs get the right schema**

Change line 18 from:
```sql
  original_permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE RESTRICT,
```
to:
```sql
  original_permit_id UUID REFERENCES permits(id) ON DELETE RESTRICT,
```

- [ ] **Step 3: Update ensure-transfer-requests-and-backfill.sql for the same reason**

Change line 13 from:
```sql
  original_permit_id UUID NOT NULL REFERENCES public.permits(id) ON DELETE RESTRICT,
```
to:
```sql
  original_permit_id UUID REFERENCES public.permits(id) ON DELETE RESTRICT,
```

- [ ] **Step 4: Commit**

```bash
git add database/migrations/allow-null-original-permit-id-for-manual-transfers.sql \
        database/migrations/create-transfer-requests.sql \
        database/migrations/ensure-transfer-requests-and-backfill.sql
git commit -m "fix(db): make transfer_requests.original_permit_id nullable for manual permits"
```

---

### Task 2: Fix backfill logic in `transfer-pending-terms.ts`

**Files:**
- Modify: `lib/notifications/transfer-pending-terms.ts` (~line 238-265)

- [ ] **Step 1: Resolve `original_permit_id` to null for manual sentinel IDs**

In `notifyOnTransferPendingTerms`, find the backfill block (around line 238) and add sentinel detection before the INSERT:

```ts
const resolvedBackfillPermitId =
  notesContact.originalPermitId.startsWith('manual-') ? null : notesContact.originalPermitId;
```

Then use `resolvedBackfillPermitId` instead of `notesContact.originalPermitId` in the INSERT parameters.

- [ ] **Step 2: Commit**

```bash
git add lib/notifications/transfer-pending-terms.ts
git commit -m "fix(transfers): resolve manual permit sentinel to null in transfer_requests backfill"
```

---

### Task 3: Verify end-to-end

- [ ] Apply the migration to the DB (run the new SQL file against the Postgres instance)
- [ ] Submit a transfer with a manual permit (use the "Permit Not Listed?" flow)
- [ ] Confirm the `/api/transfers/create` response is `{ success: true }` (no longer 500)
- [ ] Have staff approve the transfer application
- [ ] Log in as transferee — confirm the incoming transfer appears in the dashboard
- [ ] Push all changes to both remote branches

```bash
git push origin chore/stage-unstaged-2026-03-01
git push origin chore/stage-unstaged-2026-03-01:chore/stage-unstaged-2026-03-01-uat
```
