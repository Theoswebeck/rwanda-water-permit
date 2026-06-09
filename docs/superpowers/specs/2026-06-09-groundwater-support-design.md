# Groundwater Support — Design Spec

**Date:** 2026-06-09
**Project:** waterpermit (Rwanda Water Resources Board)
**Status:** Approved design — pending implementation plan

## Source of truth

Two reference documents drive this spec (in `~/Downloads/`):
- `Revised_GROUNDWATER APPLICATION FORM.docx`
- `GROUNDWATER ASSESSMENT REPORT.docx`

**Where these docs conflict with informal notes, the docs win.** Concretely: the
assessment report keeps Section 4 (Water balance assessment) per the docx, even
though an informal note said to remove it.

## Scope

Add a **Groundwater** abstraction path to the application lifecycle for the
groundwater-eligible activities. When an applicant picks one of those activities
and selects **Groundwater** as the method of water abstraction, the application
form, assessment report, and permit/contract output adapt accordingly.

**Out of scope:**
- The conditional-approval / drilling-authorization workflow (geophysical-survey
  letter → pumping test → resubmit) is explicitly **dropped** from this spec.
- **Surface-water behavior is 100% untouched.** Only the new groundwater branch is
  built. If Surface Water is selected, the form behaves exactly as it does today.

### Groundwater-eligible activities

From the Application Form docx (sections I–VII):

| # | Activity | Internal key |
|---|----------|--------------|
| I | Coffee Washing | `coffee_washing` |
| II | Fish Farming in **Ponds** | `fish_farming_ponds` |
| III | Industry | `industry` / `industrial` |
| IV | Irrigation | `irrigation` |
| V | Livestock | `livestock` |
| VI | Mining | `mining` |
| VII | Water Supply | `water_supply` |

Excluded: fish-farming-in-lakes and recreation (concession-only), and District
Water Supply / bulk.

## Foundational decision — groundwater detection

Introduce one **persisted field** on the application, e.g.:

```
methodOfWaterAbstraction: 'surface_water' | 'groundwater'
```

- Set by the application form (Part 1).
- Read by the assessment report (Part 2) and the permit/contract generation (Part 3).
- **Not** inferred from `waterSourceType === 'borehole'` — the surface path also offers
  Borehole as a source, so an explicit field is the only clean signal.

Persisted alongside the rest of the application data (same mechanism as existing
form fields → `application_data` / DB columns). Default `surface_water` for
existing records and for activities that are not groundwater-eligible.

---

## Part 1 — Application Form

File: `components/dashboard/application-form-new.tsx` (the active form, loaded by
`app/dashboard/new-application/page.tsx`).

### 1.1 New "Method of Water Abstraction" radio

- A radio group with two options: **Surface Water** / **Groundwater**.
- Rendered **directly under the selected activity** (item 7), and **only** for the
  7 groundwater-eligible activities.
- **Required.** Reuse the existing validation pattern (`requireTextField` /
  zod refinement) so the user cannot proceed without choosing.
- **Until a choice is made, all content below it is hidden** — items 8, 9,
  source-of-water (10–12), and the annex section. This prevents the user from
  filling fields that depend on the branch.

> Naming note: this NEW field is distinct from the EXISTING "Method of Water
> Abstraction" dropdown inside Section 9 (Pumping/Gravity/etc.), which is
> **removed** on the groundwater branch (§1.3). They share a label but are
> different controls; no clash remains because the old one is gone for groundwater.

### 1.2 Surface Water selected

No change. Existing flow renders exactly as today.

### 1.3 Groundwater selected

| Field | Change |
|-------|--------|
| **Water Use Category badge** | Display **"Groundwater"**. Internally keep the category `abstraction` so the abstraction-point UI (not the concession-area UI) continues to render. |
| **Item 8 — Water Abstraction Point (LAT, LONG)** | Relabel to **"8. Coordinates"**. Same latitude/longitude inputs and map tabs. |
| **Section 9 — Water Abstraction Details** | Rename **"Flow Rate (m³/s)" → "Pumping Rate (m³/day)"**. **Remove** the "Method of Water Abstraction" dropdown. **Keep** "Maximum Average Yearly (m³/year)" unchanged. |
| **Item 10 — Source of Water** | **Borehole only** (lock the select to Borehole; hide other options). |
| **Item 11 — Name of the source of water** | Relabel to **"11. Name of the borehole"**. |
| **Item 12 — Tributary to (main river/lake)** | **Hidden.** |
| **Items 13–16** (location, reliability, duration, land ownership) and Payment | Unchanged. |

### 1.4 Annex — Geophysical Survey

On the groundwater branch, the annex upload is **"Geophysical Survey"** instead of
"Hydrological Report":

- **Relabel** the existing hydrological-report upload for activities that already
  have one: Coffee Washing, Fish Farming (aquaculture), Industry, Mining
  (`coffeeWashingHydrologicalReport`, `aquacultureHydrologicalReport`,
  `industrialHydrologicalReport`, `miningHydrologicalReport`).
- **Add a new (optional) upload slot** "Geophysical Survey" for Irrigation,
  Livestock, and Water Supply, which currently have no hydrological-report upload.
  Not required to submit.

---

## Part 2 — Assessment Report

Files: `components/inspection/assessment-report-form.tsx`,
`components/inspection/assessor-recommendations.tsx`.

Gated on the application being groundwater (new `isGroundwater` prop, mirroring the
existing `isBulk` / `isBulkApplication` prop pattern). Applies only when
`reportType === 'abstraction'` and the application is groundwater.

### 2.1 AssessorRecommendations table — add Pumping Rate row

- Add a **"Pumping rate (m³/day)"** row with the same Requested / Assessor
  Recommended structure as the existing rows.
- **Requested** column: sourced from the applicant's Section 9 Pumping Rate
  (read-only), via the same data path that feeds `requestedDurationYears` /
  `requestedVolumeM3`.
- **Assessor Recommended** column: editable, persisted via the existing
  assessor-adjustments API used by duration/volume.
- **Required** — the assessor must enter a recommended pumping rate before
  recommending approval for a groundwater application.
- Existing rows (Water Permit Duration, Water Output Volume) remain.

### 2.2 Section changes

- **Remove Section 3 "Amount of water to be abstracted"** (docx).
- **Keep Section 4 "Water balance assessment"** (docx says "same" — overrides the
  informal note to remove it).
- Renumbering: with Section 3 removed for groundwater, downstream section numbers
  shift accordingly (follow the existing conditional-numbering approach already
  used for `isBulkApplication`).

### 2.3 Value consumed by permit/contract

The **assessor-recommended pumping rate (m³/day)** is the value printed on the
permit and contract (per the docx note: "The pumping rate figure is the one to be
put in the permit and in the contract").

---

## Part 3 — Permit & Contract copy

Files: `lib/contract-terms.ts`, `lib/contract-placeholders.ts`,
`lib/permit/permit-text-data.ts`.

Article 4 (Right to abstract and use water), currently:

> "…by {{SYSTEM_TYPE_EN}} with a **flow rate** of {{VOLUME_LABEL}}."

For **groundwater** applications:

- Change the wording **"flow rate" → "pumping rate"**.
- Use the **assessor-recommended pumping rate** value, expressed in **m³/day**
  (e.g. "…with a pumping rate of 37.12 m³/day").

Surface-water contracts/permits keep the existing "flow rate" wording and value.
The contract placeholder layer already supports an m³/day volume label; the change
is (a) the conditional wording and (b) sourcing the value from the recommended
pumping rate when the application is groundwater.

---

## Design decisions (confirmed)

1. **Water Use Category badge** shows **"Groundwater"** when groundwater is selected
   (internally still `abstraction`).
2. **Geophysical Survey annex** for Irrigation/Livestock/Water Supply: **add a new,
   non-required upload slot**.
3. **Assessor-recommended Pumping Rate** is **required** before a groundwater
   application can be recommended for approval.

## Affected files (reference)

- `components/dashboard/application-form-new.tsx` — new radio, conditional labels,
  field hiding, borehole lock, annex relabel/add, new persisted field.
- `lib/application-utils.ts` — wiring of the new field into the payload/derivation.
- `types/database.ts` — type for `methodOfWaterAbstraction` (and any enum/DB column).
- `components/inspection/assessment-report-form.tsx` — remove Section 3, keep
  Section 4, renumbering, pass `isGroundwater`.
- `components/inspection/assessor-recommendations.tsx` — Pumping rate row +
  persistence + required validation.
- `lib/contract-terms.ts`, `lib/contract-placeholders.ts`,
  `lib/permit/permit-text-data.ts` — Article 4 wording + value source for groundwater.
- Database migration — new column/enum for the abstraction method and the
  recommended pumping rate (assessor adjustment).
