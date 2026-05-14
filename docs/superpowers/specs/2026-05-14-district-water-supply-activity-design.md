# District Water Supply Activity — Design Spec

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** UAT only (`chore/stage-unstaged-2026-03-01-uat`)

---

## Problem

Bulk applicants (water utilities with `is_bulk_applicant = true` on their profile) currently always see the water supply networks section and have `is_bulk = true` on every application. They have no way to file a regular (non-district) water supply application.

The desired UX: bulk applicants choose between **"Water supply"** (regular, behaves like any other applicant) and **"District Water Supply"** (district-level, triggers the network table and bulk permit flow).

---

## Solution

Add `"district_water_supply"` as a new activity value, visible only to bulk applicants in the activity radio group. All existing bulk-specific behavior (networks table, `is_bulk` flag, annex B letter) is gated on this explicit choice rather than on the user's profile flag alone.

---

## Section 1 — Activity Radio Group

**File:** `components/dashboard/application-form-new.tsx` (~line 4245)

Inject one additional option into the `intendedActivities` RadioGroup **only when `isBulkApplicant`**:

```typescript
...(isBulkApplicant ? [{ value: "district_water_supply", label: tx("District Water Supply") }] : []),
```

Position: immediately after the `"water_supply"` entry.

Derive a local boolean:

```typescript
const isDistrictWaterSupply = watchedIntendedActivities?.includes("district_water_supply") ?? false;
```

---

## Section 2 — Field Visibility

| Section | Current render condition | New render condition |
|---|---|---|
| Water Use Category | `activities.length > 0 && !isPureConcession` | `&& !isDistrictWaterSupply` |
| Water Abstraction Point (LAT/LONG) | `effectiveWaterUseCategory === "abstraction" && activities.length > 0` | `&& !isDistrictWaterSupply` |
| Water Supply Details table | `activities.includes("water_supply")` | no change — "district_water_supply" ≠ "water_supply", already correct |
| Bulk networks section | `isBulkApplicant` | `isDistrictWaterSupply` |

When a bulk applicant selects any activity other than "district_water_supply" (including regular "water_supply"), the networks table is completely hidden and the form behaves identically to a non-bulk applicant.

---

## Section 3 — ANNEX B

**File:** `lib/annex-requirements.ts`

Add a new case before `"water_supply"`:

```typescript
case "district_water_supply":
  return {
    annexTitle: "ANNEX B (Only for Water Supply)",
    attachments: [
      req(applicationLetterLabel, "waterSupplyGeneralRequirements"),
      // feasibility study is NOT required for district water supply
    ],
  };
```

In the form, call `renderRequiredAttachmentsForActivity("district_water_supply")` inside the district water supply section (alongside the networks table), not in a separate annex section.

---

## Section 4 — Validation

Skip these validations when `isDistrictWaterSupply`:

- `waterSupplyPopulation` (currently required for `water_supply`)
- `waterSourceLatitude` / `waterSourceLongitude`
- `waterUseCategory`

Add these validations when `isDistrictWaterSupply`:

- `waterSourceDistrict` must be selected (province + district dropdowns)
- `bulkNetworks` must have at least one row with `networkName` filled

---

## Section 5 — Save Payload

**Current:**
```typescript
...(isBulkApplicant && { bulk_networks: bulkNetworks, bulk_district: ... })
```

**New:**
```typescript
...(isDistrictWaterSupply && { bulk_networks: bulkNetworks, bulk_district: form.getValues("waterSourceDistrict"), is_bulk: true }),
```

When a bulk applicant selects regular "water_supply", `is_bulk` is NOT set (or set to `false`), and `bulk_networks` is not included in the payload.

Setting `is_bulk: true` explicitly ensures all existing downstream code (terms page, PDF template, public permit view) that reads `is_bulk` continues to work without modification.

---

## Files Changed

| File | Change |
|---|---|
| `components/dashboard/application-form-new.tsx` | Add "district_water_supply" to radio group (bulk only); derive `isDistrictWaterSupply`; update 3 visibility conditions; change networks section gate; update save payload |
| `lib/annex-requirements.ts` | Add `"district_water_supply"` case |

No DB migration needed — `"district_water_supply"` is stored as a string value in the existing `intended_activities` JSONB column, and `is_bulk` already exists on the `applications` table.

---

## Non-Goals

- No changes to assessment, PDF, or terms page — `is_bulk` continues to drive those flows
- No changes to non-bulk applicants — they never see "District Water Supply"
- No changes to prod branch until UAT is signed off
