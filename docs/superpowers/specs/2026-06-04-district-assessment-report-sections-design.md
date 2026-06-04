# Hide & Renumber Assessment-Report Sections for District Water Supply — Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Scope:** UAT. District Water Supply only.

---

## Problem

The assessment report sections **2. Water Source**, **3. Amount of water to be abstracted**,
**4. Water balance assessment**, and **5. Planned wastewater management system** do not apply to
District Water Supply applications (which use the per-network Water Supply Networks table
instead). They must be hidden — and the report renumbered — **only** for district; every other
activity keeps all sections unchanged (conditional toggle, not removal).

The district signal is the existing `isBulkApplication` prop (`= application.is_bulk`, set only
for district water supply).

---

## Changes

### A. `components/inspection/assessment-report-form.tsx`

1. **Hide for district** (`{!isBulkApplication && ( … )}`):
   - Section 2 Card ("2. Water Source").
   - The activity block ("3. Amount of water to be abstracted" / "4. Water balance assessment",
     plus their concession variants "3. Surface area" / "4. Other people's rights").
   - Section 5 Card ("5. Planned wastewater management system").

2. **Move the Water Supply Networks card up** to render immediately after Section 1 (it is
   already gated on `isBulkApplication`, so non-district is unaffected). This gives district a
   logical order: Identification → Networks → Completion → Recommendation.

3. **Renumber** (dynamic titles):
   - Water Supply Networks → **"2. Water Supply Networks"** (district-only).
   - "6. Assessment Report Completion" → `isBulkApplication ? "3." : "6."`.
   - "7. Assessor Recommendation" → `isBulkApplication ? "4." : "7."`.
   - Section 1 unchanged ("1. Permit Applicant Identification").

   Result — district: **1, 2 (Networks), 3 (Completion), 4 (Recommendation)**. Non-district:
   **1–7 unchanged**.

### B. `app/assessment/application/[id]/page.tsx` — validation (the "be careful" part)

`missingFieldReportRequirements` requires fields from the hidden sections
(`sourceFlowValue`, `flowRateM3Day`, `flowRateLps`, `waterBalanceDescription`, the water-balance
Q/D/ED/remaining/storage numbers, `waterUseConflict`, `wastewaterSystemDescription`,
`pollutionDescription`, plus the concession `surfaceAreaHa`/`existingWaterUses`). If left in
place, a district assessment could never be completed (required-but-hidden fields).

**Fix:** when the application is district (`(application as any)?.is_bulk`), skip the entire
abstraction/concession activity block **and** the wastewater checks. Keep the assessment-date
and Section 1 (contact/residence) checks. This validation only runs in the assessor's edit mode
(`isReadOnly` early-returns), so read-only staff views need no change.

---

## Non-goals / unaffected

- Read-only staff views (review/approver/verification) already pass `isBulkApplication` and
  early-return from validation — no change needed beyond the shared form edits.
- Permit/PDF generation for district uses the networks, not these single-source fields — unaffected.
- Non-district activities: every section and every validation stays exactly as today.

## Verification

- `npm run build` passes.
- District assessment: sections 2–5 hidden, numbering 1–4, and the assessor can **complete**
  the report (no phantom required fields).
- Non-district assessment: all sections present, numbered 1–7, validation unchanged.
