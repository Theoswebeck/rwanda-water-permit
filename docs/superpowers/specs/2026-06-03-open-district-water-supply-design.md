# Open District Water Supply to All Users — Design Spec

**Date:** 2026-06-03
**Status:** Approved
**Scope:** UAT (`chore/stage-unstaged-2026-03-01-uat`). Prod does not have the bulk/district feature.

---

## Problem

The "District Water Supply" activity is gated to bulk applicants via the `isBulkApplicant`
prop (derived from the `users.is_bulk_applicant` profile flag). Two consequences:

1. Non-bulk users cannot select District Water Supply at all.
2. When a saved District Water Supply application is reopened and `isBulkApplicant` is
   `false` (non-bulk user, or the profile flag is unset/late-loading), the activity radio
   option is **not injected**, so the saved selection has no matching option and renders as
   unselected — even though the networks section (gated on the activity) still shows. This
   is the reported "intended activity doesn't show on reopen" bug.

## Solution

Drive **all** District Water Supply behavior off the **selected activity**
(`isDistrictWaterSupply = watchedIntendedActivities.includes("district_water_supply")`),
never off the `isBulkApplicant` profile flag. Remove the radio-option gate so the activity
is available to everyone.

### Two distinct flags (do not conflate)

- `applications.is_bulk` — "this *application* is a district one." Set in the save payload
  whenever District Water Supply is selected. Drives staff views and parent/child permit
  generation. **Unchanged.**
- `users.is_bulk_applicant` — "this *user* is allowed bulk." The gate being removed. Left
  **dormant** (column + admin toggle stay, but no longer gate anything).

---

## Changes (all in `components/dashboard/application-form-new.tsx`)

| # | Location | Change |
|---|---|---|
| 1 | Activity radio injection (~4354) | Remove the `isBulkApplicant ? [...] : []` gate — always inject the "District Water Supply" option |
| 2 | Water Source simplification (~1830 `validateWaterSourceTab`, ~2302 `isNextButtonDisabled`, ~3955 hide fields 10–14, ~4272 renumber "10."/"15.") | `isBulkApplicant` → `isDistrictWaterSupply` |
| 3 | Skip land-ownership tab (~2187 `getTabs`, ~3457 TabsTrigger) | `isBulkApplicant` → `isDistrictWaterSupply` |
| 4 | Networks seeding (~1042 `useState` init + effect) | `useState` init returns saved rows or `[]`; a new effect keyed on `isDistrictWaterSupply` seeds 5 empty rows when the activity is selected and the table is empty. (Init no longer seeds based on `isBulkApplicant`.) |
| 5 | `superRefine` (~476, ~504) | Skip water-source field validation (name/province/district/sector/cell) when the activity is `district_water_supply`, instead of when `_isBulk === true`. The district block validates `waterSourceDistrict` for everyone. |

### Left unchanged
- Staff view pages pass `isBulkApplicant={application.is_bulk}` — correct, since `is_bulk`
  is reliably set for district apps. No change.
- New-application page `isBulkApplicant = userProfile.is_bulk_applicant` — still passed but
  no longer gates district behavior in the form.
- Admin "Mark as bulk applicant" toggle, BULK badge, `is_bulk_applicant` column — dormant.
- `isBulkApplicant` prop in the form interface — kept (ignored for district gating).
- `_isBulk` form field/default/effect/payload-stripping — becomes dead but harmless; left
  in place to keep the diff minimal.
- The legacy `application-form.tsx` is dead code (imported nowhere) — out of scope.

---

## Use cases

1. **New user picks District Water Supply** → option visible; networks seed 5 rows;
   simplified Water Source tab (only "10. Requested Permit Duration"); land-ownership tab
   skipped; Annex B application letter required; Water Use Category / LAT-LONG / Section 9
   hidden; saves `is_bulk: true`.
2. **Reopen saved District draft** (the bug) → option always present → saved selection
   renders; networks (saved rows), simplified tab, skipped land-ownership all follow the
   activity. Works regardless of the profile flag. ✅
3. **Bulk-flagged user picks a non-district activity** → normal full form (fields 10–14,
   land-ownership, full validation); `is_bulk` NOT set. (Approved behavior change.)
4. **Staff view / permit generation** → unchanged; driven by saved `is_bulk`.
5. **User selects District, fills rows, switches to another activity, submits** →
   `bulk_networks`/`is_bulk` omitted from payload; non-district app is not bulk. Correct.

---

## Validation / verification

- `npm run build` must pass before any push (webpack catches errors `tsc` misses).
- Manually verify on UAT after deploy: (a) non-bulk user can select District Water Supply
  and complete the flow; (b) reopening a saved district draft shows the activity selected;
  (c) a normal (non-district) application still validates the full Water Source tab.
- Confirm Water Use Category, LAT/LONG, and Section 9 remain hidden for district (guard
  against the auto-derive badge regression seen in testing).

## Non-goals
- No removal of the `is_bulk_applicant` column or admin UI (left dormant by decision).
- No changes to staff views, permit generation, contract/PDF templates, or prod branch.
