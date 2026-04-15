# Assessor-Set Contract Duration — Design

**Date:** 2026-04-15
**Status:** Implemented
**Author:** Claude (with nourumuneza)

## Problem

On the assessor review page for RWB-2026-000004 (a Transfer application), two data inconsistencies surfaced:

1. **Contract period mismatch.** The Application Details tab showed the old permit's dates (2021-11-30 → 2036-11-29, 15 years). The Contract Preview tab said "valid for 5 years" because `resolveDurationYears()` in `lib/contract-placeholders.ts` fell back to a hardcoded `"5"`. Nothing on the page represented the *new contract's* actual duration.
2. **Flow rate vs allowance inconsistency.** Water Allowance showed 5 m³/day; Flow Rate showed 0.2 m³/s (≈ 17,280 m³/day). Two independent columns, no validation between them. Allowance is the authoritative operational figure.

## Goal

Make the assessor the single source of truth for the new contract's duration. Remove the flow-rate field from displays so allowance is the only operational volume shown. Block send-for-review until the assessor has set a duration (where required by policy).

## Policy — duration in years

The contract only needs a single number: duration in years. Start date is resolved at permit issuance time, not at assessment time. Duration is stored in `internal_notes._assessorAdjustments.permitLengthYears` — the same bucket already used for volume adjustments.

| Type | Seeded default | Required before send-for-review |
|---|---|---|
| **new** | not seeded — assessor enters manually | yes |
| **renewal** | old permit's original term (`expiry − issued`, rounded to years) | yes |
| **transfer** | remaining validity (`old_expiry − today`, ceil'd) | yes |
| **modification** | current permit's original term (inherited from old permit) | no (inherited, not user-chosen) |

Rationale: transfers inherit the remaining validity so transferees get exactly what's left. Renewals default to the prior term as a sensible starting point the assessor can adjust. Modifications don't alter validity, so the duration is pass-through and the send-for-review gate is skipped. New permits have no anchor, so the assessor must pick a number consciously.

## Storage

No schema migration. Duration lives inside the existing `applications.internal_notes` JSON blob under `_assessorAdjustments`, matching the existing pattern for `permitLengthYears` and `recommendedVolumeM3`:

```jsonc
{
  "_assessorAdjustments": {
    "permitLengthYears": 5,
    "recommendedVolumeM3": 1200,
    "adjustedAt": "2026-04-15T09:20:00Z"
  }
}
```

Writes go through the existing `savePermitLengthAdjustment` helper in the assessment page, which also updates the `proposed_duration_years` column for the permit-generation pipeline. No new helper or migration was added.

## Data flow

1. **On assessor page load**, a seeder effect waits for the old-permit context (transfer/renewal/modification). Once available, it computes the type-specific default and calls `savePermitLengthAdjustment(seededYears)`. The seeder is gated by a `permitLengthSeeded` flag so it runs once per load and skips if `assessorPermitLength` is already set.
2. **Assessor UI** — the existing `AssessorRecommendations` component on the Assessment Report tab already renders a permit-duration input and wires up `savePermitLengthAdjustment`. It covers new / renewal / modification. **Transfer applications have no Assessment Report tab**, so a small inline "Permit Duration" card was added on the Application Details tab for the transfer path only.
3. **Send-for-review gate** — `canSendForReview` now requires `assessorPermitLength` in [1, 15] for every app type except `modification`. The existing missing-field-report-requirements gate still applies.
4. **Contract Preview** — `resolveDurationYears()` reads `_assessorAdjustments.permitLengthYears` (Priority 1), then falls back to `proposed_duration_years` (Priority 2), then `"5"` (Priority 3). No change to the placeholder logic was needed beyond what already existed.

## Flow rate removal

Hidden from two places:
- `components/dashboard/application-form-new.tsx` — removed the water-abstraction `flowRate` FormField, its zod refine rule, validation labels, and completeness check.
- `components/dashboard/permit-transfer-form.tsx` — removed the flow-rate input in the manual transfer form.

The `flow_rate_m3_per_second` DB column is retained (non-destructive). The `flowRate` field stays in the transfer-form zod schema as optional so existing drafts still round-trip cleanly.

## Non-goals

- Schema changes. The JSON-blob pattern is consistent with existing assessor adjustments and requires zero DB ops.
- Changing how `permits.issued_date` / `permits.expiry_date` are written at approval time. Permit issuance will continue to derive dates from the approval timestamp + duration.
- Removing the `flow_rate_m3_per_second` DB column.
- Revisiting allowance units or validation rules.
- A dedicated start/end date picker. The contract template only needs a single "N years" value.

## Conventions followed

- Assessor overrides: stored in `internal_notes._assessorAdjustments` JSON blob (same pattern as existing `permitLengthYears`, `recommendedVolumeM3`).
- Read-modify-write internal_notes: matches `savePermitLengthAdjustment` / `saveVolumeAdjustment`.
- Per-type branching: lowercase `applicationType` comparison in the seeder effect.
- Assessor state changes: direct `supabase.from('applications').update()` in the page component.

## Files touched

- `app/assessment/application/[id]/page.tsx` — permit-length seeder effect, current-permit dates fetch for modification, send-for-review duration gate, inline permit-duration card for transfer apps.
- `components/dashboard/application-form-new.tsx` — remove flow-rate field from water abstraction details.
- `components/dashboard/permit-transfer-form.tsx` — remove flow-rate field from manual transfer form.
