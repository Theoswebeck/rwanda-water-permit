# Assessment Report Validation, Residence Dropdowns, and Source Flow Units

## Context

Assessors can now edit assessment report fields, but recent fixes exposed two important failure modes:

1. A field can appear editable while still failing to save because it has no real state update path.
2. A saved assessor value can be overwritten later by report hydration from prefilled application data.

This design extends the assessment report editor while explicitly preventing both issues.

## Goals

- Let assessors enter Section 2 source flow as a numeric value plus a selectable unit.
- Support only `m3/day` and `m3/year` for the Section 2 source flow unit.
- Make `Residence` editable through Rwanda administrative dropdowns:
  - Province
  - District
  - Sector
  - Cell
  - Village
- Store and display residence as one combined string for compatibility with existing report data.
- Validate edited report fields before sending for review.
- Preserve assessor-edited values after save, send-for-review, assessment reload, reviewer view, and approver view.

## Non-Goals

- Do not redesign the whole assessment report layout.
- Do not alter applicant-side application forms.
- Do not change the database schema. Existing JSON report data supports the new fields.
- Do not modify unrelated assessment workflow statuses.

## Current Code Paths

- UI editor: `components/inspection/assessment-report-form.tsx`
- Report prefill/merge: `lib/assessment-report-utils.ts`
- Assessment submit/save path: `app/assessment/application/[id]/page.tsx`
- Reviewer read path: `app/review/application/[id]/page.tsx`
- Rwanda admin data source: `lib/rwanda-administrative-data.ts`
- Existing applicant form pattern: `components/dashboard/application-form.tsx`

## Data Model

Extend `AssessmentReportData` with explicit Section 2 source flow fields:

```ts
sourceFlowValue?: string;
sourceFlowUnit?: "m3/day" | "m3/year";
```

Keep current fields for compatibility:

```ts
sourceFlowLps?: string;
sourceFlowM3Day?: string;
```

The UI should read in this order:

1. `sourceFlowValue` and `sourceFlowUnit` when present.
2. Existing `sourceFlowM3Day` as `sourceFlowValue` with `m3/day` for old saved rows.
3. Empty value with default unit `m3/day`.

Residence remains stored as:

```ts
residence?: string;
```

The dropdown state is local UI state derived from `residence`. On each dropdown change, the component writes the combined residence string back into `reportData.residence`.

## Residence Dropdown Behavior

Use the same helpers already used by the applicant form:

- `getFormattedProvinceOptions()`
- `getFormattedDistrictOptions(province)`
- `getFormattedSectorOptions(province, district)`
- `getFormattedCellOptions(province, district, sector)`
- `getFormattedVillageOptions(province, district, sector, cell)`

When a parent dropdown changes:

- Province change clears district, sector, cell, and village.
- District change clears sector, cell, and village.
- Sector change clears cell and village.
- Cell change clears village.

The combined residence string format is:

```text
Village, Cell, Sector, District, Province
```

If village is empty:

```text
Cell, Sector, District, Province
```

Existing residence strings should be parsed best-effort from right to left:

- Last segment -> province
- Previous -> district
- Previous -> sector
- Previous -> cell
- Previous -> village

If parsing fails, keep the original text available as a fallback and require the assessor to choose valid dropdown values before sending for review.

## Source Flow Unit Behavior

In Section 2, replace the current fixed `L/sec` and derived `m3/day` pair with:

- Numeric input: source flow value.
- Unit select:
  - `m3/day`
  - `m3/year`

On change:

- `sourceFlowValue` updates immediately.
- `sourceFlowUnit` updates immediately.
- Legacy `sourceFlowM3Day` may be populated only when the selected unit is `m3/day`.
- Do not auto-overwrite manually entered values during hydration.

## Validation

Validation must run before send-for-review. Draft saves should remain allowed so assessors can save incomplete work.

Required validation rules:

- `contactTel` must not contain letters.
  - Allowed characters: digits, spaces, `+`, `-`, `(`, `)`.
  - Invalid example: `+250786544386 test`.
- `sourceFlowValue` must be numeric for abstraction reports, where Section 2 source flow is shown and required.
- `sourceFlowUnit` must be either `m3/day` or `m3/year`.
- Residence must resolve to valid Rwanda administrative values before send-for-review:
  - province exists
  - district belongs to province
  - sector belongs to district
  - cell belongs to sector
  - village belongs to cell when village is provided

Validation errors should be shown in the assessment page before the send-for-review dialog opens, not after status changes.

## Persistence and Hydration Rules

Saved `technical_assessments.assessment_report_data` values must win over prefilled application data for assessor-editable fields.

This prevents repeating the previous `sourceName` issue where:

1. the UI became editable,
2. the value saved,
3. hydration later overwrote the saved value with a prefilled value.

`mergeAssessmentReportData(prefilled, existing)` should keep existing values for all editable assessment report fields. Application-derived prefill is only a starting point when no saved value exists.

Reviewer and approver pages should show the saved assessment report JSON exactly as merged by the same utility. They should not recompute or overwrite assessor edits from application fields.

## Error Handling

- If Rwanda dropdown parsing fails, show dropdowns empty or partially filled and preserve the existing text until the assessor saves valid selections.
- If validation fails, keep the application in its current status and show a clear list of fields to fix.
- Do not send notification or change application status when validation fails.

## Testing Plan

Manual verification:

1. Open an editable assessment.
2. Enter source flow value `3333`.
3. Select `m3/day`, save or send for review, reopen assessment, confirm value and unit persist.
4. Change unit to `m3/year`, send for review, open reviewer page, confirm value and unit persist.
5. Enter `+250786544386 test` in contact phone and confirm send-for-review is blocked.
6. Select residence Province -> District -> Sector -> Cell -> Village and confirm combined residence displays correctly.
7. Send for review, open reviewer page, confirm residence persists.
8. Reopen assessment and confirm values are not overwritten by prefilled data.

Code verification:

- Run lint diagnostics for changed files.
- Run targeted review against:
  - editable UI state
  - validation gate
  - hydration precedence
  - reviewer/approver read behavior

## Rollout Notes

No database migration is required because assessment report data is stored as JSON.

Existing saved reports without `sourceFlowValue` and `sourceFlowUnit` continue to load through the legacy fallback from `sourceFlowM3Day`.
