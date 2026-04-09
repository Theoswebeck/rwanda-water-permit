# Registry Sync — Transfer, Renewal, and Modification

**Date:** 2026-04-08

## Problem

When a permit is transferred (digital or manual), renewed, or modified, the `permit_registry` table is not updated with the new holder or the new dates. Modifications are partially synced (status, volume, location — but never `permit_holder`). Renewals and transfers have no sync at all.

This means the public-facing registry shows stale holder names and expired dates for permits that have been actively renewed or transferred.

## Desired Behaviour

After any terms-acceptance event that changes a permit:

| Event | Fields synced to `permit_registry` |
|-------|-------------------------------------|
| Modification (existing) | Add `permit_holder` to existing sync calls |
| Renewal | `status = 'active'`, `issuance_date`, `expiration_date`, `permit_holder` |
| Digital transfer | `permit_holder` (new holder = transferee), `status = 'active'` |
| Manual transfer | `permit_holder`, `status = 'active'`, `issuance_date`, `expiration_date`, `volume_or_area` |

Sync is **non-blocking** — errors are logged but never surface to the user.

## Architecture

### `syncPermitToRegistry()` — no changes needed

Located at `lib/permit/permit-registry-sync.ts`. Accepts `permit_holder` in its `RegistrySyncUpdates` interface (already defined). Looks up by permit_number (exact then ILIKE), updates only if a matching row exists. No inserts. No changes to this file required.

### `permit_holder` resolution

`applicationData.applicant` is already joined in the page query (line 210 and 489 of `terms/page.tsx`). Build permit_holder from it:

```ts
const permitHolder: string | undefined =
  applicationData.applicant?.company_name?.trim() ||
  [applicationData.applicant?.first_name, applicationData.applicant?.last_name]
    .filter(Boolean).join(' ').trim() ||
  undefined;
```

For **transfers**, the new holder is the **transferee** (the person accepting the terms), not the original applicant. The transferee is the currently logged-in user — use the same `profile` that's already fetched in the page.

```ts
const transfereeHolder: string | undefined =
  profile?.company_name?.trim() ||
  [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
  undefined;
```

### Permit number resolution per branch

| Branch | Permit number source |
|--------|---------------------|
| Modification (DB permit) | `currentPermit.permit_number` (already in `permitNumForSync`) |
| Modification (registry-only) | `registryPermitNumber` (already resolved) |
| Renewal | `permitData.permit_number` (from the updated permit row) |
| Digital transfer | `permitData.permit_number` (from `/api/transfers/issue` response) |
| Manual transfer | `permitData.permit_number` (from the INSERT result) |

## Files Changed

| File | Change |
|------|--------|
| `app/dashboard/application/[id]/terms/page.tsx` | Add `permitHolder` / `transfereeHolder` resolution; add `permit_holder` to modification sync calls; add sync calls after renewal, digital transfer, and manual transfer branches |

## Implementation Detail

### 1. Add holder resolution (once, before the branch chain)

Add near line 648, after `let transferOwnershipReassigned = false`:

```ts
const permitHolder: string | undefined =
  applicationData.applicant?.company_name?.trim() ||
  [applicationData.applicant?.first_name, applicationData.applicant?.last_name]
    .filter(Boolean).join(' ').trim() ||
  undefined;

const transfereeHolder: string | undefined =
  (profile as any)?.company_name?.trim() ||
  [(profile as any)?.first_name, (profile as any)?.last_name]
    .filter(Boolean).join(' ').trim() ||
  undefined;
```

### 2. Add `permit_holder` to existing modification sync calls

Two modification sync calls exist (lines 786 and 815). Add `permit_holder: permitHolder` to both.

### 3. Add sync after renewal (after line 923)

```ts
// Forward-sync renewal to permit_registry (non-blocking)
if (permitData?.permit_number) {
  syncPermitToRegistry(supabase, permitData.permit_number, {
    status: 'active',
    issuance_date: newIssuedDate,
    expiration_date: newExpiryDate || undefined,
    permit_holder: permitHolder,
  }).catch(err => console.warn('⚠️ registry-sync (renewal) failed:', err));
}
```

### 4. Add sync after digital transfer (after line 947)

```ts
// Forward-sync transfer to permit_registry (non-blocking)
if (permitData?.permit_number) {
  syncPermitToRegistry(supabase, permitData.permit_number, {
    status: 'active',
    permit_holder: transfereeHolder,
  }).catch(err => console.warn('⚠️ registry-sync (digital transfer) failed:', err));
}
```

### 5. Add sync after manual transfer (after line 1007)

```ts
// Forward-sync manual transfer to permit_registry (non-blocking)
if (permitData?.permit_number) {
  const locationParts = [
    applicationData.province, applicationData.district,
    applicationData.sector, applicationData.cell, applicationData.village
  ].filter(Boolean);
  syncPermitToRegistry(supabase, permitData.permit_number, {
    status: 'active',
    permit_holder: transfereeHolder,
    issuance_date: newIssuedDate,
    expiration_date: newExpiryDate || undefined,
    volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : undefined,
    location: locationParts.length > 0 ? locationParts.join(', ') : undefined,
  }).catch(err => console.warn('⚠️ registry-sync (manual transfer) failed:', err));
}
```

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No matching `permit_registry` row | `syncPermitToRegistry` returns `{ synced: false }` — silently ignored |
| `permit_holder` is empty string | `undefined` is passed → field is not included in the UPDATE payload |
| Sync throws | `.catch()` logs warning, never re-throws |
| `profile` not yet loaded when terms accepted | `transfereeHolder` resolves to `undefined`, field omitted from sync |
