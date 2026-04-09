# Manual Permit Transfer — Preserve Original Permit Number

**Date:** 2026-04-08

## Problem

When a transferee accepts terms for a manual permit transfer (permit not in the permits DB, sentinel ID `manual-*`), the system falls into the generic "create new permit" branch and generates a new RWB permit number (e.g., `000026/RWB/2026`). This is wrong — a transfer does not issue a new permit. The original permit number (e.g., `0004/MINIRENA/IWRM/2014`) must be preserved.

Additionally, the generated permit and PDF show `N/A` for authorized volume and flow rate because `resolveVolumeOrAreaFromAssessor` does not check `internal_notes.transferFormData` (already fixed in a prior commit — included here for completeness).

## Desired Behaviour

When a manual permit transfer is accepted:
- A permit row is inserted into the `permits` table with `permit_number = originalPermitNumber` (the user-entered number from the transfer form).
- `is_transfer = true`, `transfer_reason` set to reference the transfer application.
- `water_allowance` and `allowance_unit` are correctly populated from `transferFormData`.
- No new RWB permit number is generated.

## Architecture

### How the DB trigger works

`generate_permit_number()` is a BEFORE INSERT trigger that only sets `permit_number` when `NEW.permit_number IS NULL`. Passing an explicit value skips auto-generation safely.

### Branch structure in `terms/page.tsx`

The terms acceptance code has a conditional chain that determines how the permit is created:

| Branch | Condition | Action |
|--------|-----------|--------|
| Modification | `isModificationApplication` | Updates existing permit |
| Renewal | `isRenewalApplication` | Updates existing permit dates |
| Digital transfer | `isTransfer && !permitId.startsWith('manual-')` | Reassigns existing permit via `/api/transfers/issue` |
| **Manual transfer (new)** | **`isTransfer && permitId.startsWith('manual-')`** | **Inserts permit with original permit number** |
| New permit | `else` | Inserts permit, trigger auto-generates number |

The new branch sits between the digital transfer branch and the `else`. It is identical to the `else` branch except:
1. `permit_number: originalPermitNumber` is included in the INSERT (trigger skips auto-generation)
2. `is_transfer: true` and `transfer_reason` are set
3. `originalPermitNumber` is read from `parsedNotes.originalPermitNumber` (written to `internal_notes` at transfer submission time)

### Revoke step is already safe

Lines 1065–1068 guard the permit revoke call with `!transferOriginalPermitId.startsWith('manual-')`, so manual transfers never attempt to revoke a non-existent permit row.

### Volume/unit resolution (already fixed)

- `resolveVolumeOrAreaFromAssessor()` falls back to `parsedNotes.transferFormData.waterAllowance`
- `resolvedAllowanceUnit` reads `parsedNotes.transferFormData.allowanceUnit`

## Files Changed

| File | Change |
|------|--------|
| `app/dashboard/application/[id]/terms/page.tsx` | Add manual transfer branch (between digital transfer branch and `else`) |

## One-Time DB Fix (UAT)

The existing incorrectly-created permit must be corrected directly in the database:

```sql
UPDATE public.permits
SET permit_number  = '0004/MINIRENA/IWRM/2014',
    water_allowance = 343,
    allowance_unit  = 'm³/day',
    is_transfer     = true
WHERE application_id = '1aea2602-dc7d-48db-a31c-d9ea9e63b207';
```

## Edge Cases

| Case | Behaviour |
|------|-----------|
| `originalPermitNumber` is null/undefined | `permit_number` omitted from INSERT → trigger auto-generates (graceful fallback) |
| Original number already exists in `permits` table | INSERT fails with unique violation → surfaced to user as an error (acceptable — indicates data issue upstream) |
| Volume not provided in transfer form | `resolvedVolumeM3 = 0` → `water_allowance = 0` on permit (pre-existing limitation, not in scope) |
