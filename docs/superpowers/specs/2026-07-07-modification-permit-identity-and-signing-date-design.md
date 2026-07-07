# Modification permit — original identity & signing-date design

Date: 2026-07-07
Status: approved (brainstorm)

## Problem

For **modification** applications the permit/contract must show the ORIGINAL
permit's identity and validity, not the modification application's own. Two
distinct concerns were previously conflated or mis-sourced:

1. **Permit number** — the contract preview (and contract editor) showed the
   application-derived number `000102/RWB/2026` instead of the original permit
   number `0647/RWB/2023`. The permit-preview PDF was already fixed to resolve
   the original number, but the contract derivation only checks
   `notes.originalPermitNumber` (empty for registry/manual permits, where the
   number lives under `permitReference.registrySnapshot.permit_number`).

2. **Dates** — three independent dates were collapsed into one `issueDate`:
   - **Validity window** ("valid from → to"): must be the ORIGINAL permit's
     issue/expiry (`22/08/2023 → 21/08/2028`), preserved. (Already correct on
     the permit preview; still defaulted to today/today+duration in the
     permit *editor*.)
   - **Signing date** ("Done at Kigali, On …"): must be the **approval date**
     of the modification — NOT the original issue date. In a preview before
     approval it shows **today** (existing convention; locks to `approved_at`
     on approval). This was wrongly rendered from the preserved `issueDate`.

The contract document has **no issue/expiry date fields** (only a duration in
years), so on contract surfaces only the NUMBER needs fixing.

## Date model (permit document)

| Rendered field | Value | Source |
| --- | --- | --- |
| valid from | validity start | preserved original issue date (modifications) |
| … to … | validity end | preserved original expiry date (modifications) |
| Done at … On | signing date | `approved_at` (or today in preview); for a real issued modified permit, the latest `conditions.modification_history[].modified_at` |

Uniform for all types; only modifications visibly change (new/renewal/transfer
already have signingDate == issueDate).

## Number model

Shared pure resolver `resolveOriginalPermitNumber(notes): string | null` —
first non-empty of: `originalPermitNumber`,
`permitReference.normalizedPermitNumber`, `permitReference.inputPermitNumber`,
`permitReference.registrySnapshot.permit_number`,
`transferFormData.permitNumber`, `transferFormData.originalPermitNumber`.
Returns null when none resolve (caller keeps its own fallback). A
`resolvePreviewPermitNumber(notes)` wrapper adds the `XXXX/RWB/<year>`
placeholder for the permit-preview PDF.

## Surfaces & edit points

1. **Shared** — extract `lib/permit/resolve-preview-permit-number.ts`
   (`resolveOriginalPermitNumber` + `resolvePreviewPermitNumber`); permit-preview
   route imports it.
2. **Permit slot context** — add `signingDate: Date` to
   `PermitSlotContextExtras`, `BuildPermitContextInput`, and `PermitRenderOpts`;
   `buildSlotCtx`/`buildPermitSlotContext` default it to `issueDate`.
   `permit-slots.ts` closing slot `permit.shared.closing.date.bilingual` renders
   `p.signingDate` (only that slot; validity slots keep `issueDate/expiryDate`).
3. **Permit-preview route** — compute `signingDate = resolvePermitIssueDate({ approvedAt })`
   and pass it (validity `issuedDate` unchanged).
4. **Public issued-permit PDF route** — compute `signingDate` from the latest
   `conditions.modification_history[].modified_at` when the permit is a
   modification, else `resolvePermitIssueDate({ approvedAt })`; pass it.
5. **Contract number** — in `lib/contract-placeholders.ts` widen the
   modification/renewal branch of `buildContractPlaceholderContext` to use
   `resolveOriginalPermitNumber(notes)` (single point → fixes contract preview
   AND contract editor).
6. **Permit editor** — in `document-text-overrides/route.ts`: add `approved_at`
   to the query, make `buildEditorPayload` async, resolve number + preserved
   validity + signingDate (mirroring the permit-preview route), and pass them
   into `buildPermitSlotContext`; pass the resolved number into
   `buildContractSlotContext`.

## Non-goals / notes

- **No data migration.** All render-time resolution. `permits.issued_date`
  stays the preserved validity start; the signing date is derived, not stored.
- New/renewal/transfer behaviour is unchanged (signingDate == issueDate there).
