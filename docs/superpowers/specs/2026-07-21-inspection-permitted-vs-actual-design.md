# Inspection Form — Permitted vs Actual (Section II) + Wastewater relocation

**Date:** 2026-07-21
**Source of requirements:** `INSPECTION FORM.docx` (RWB change request)
**Scope:** inspection checklist editor + view mode, both templates (abstraction/authorization and concession)

---

## 1. Requirement (verbatim intent from the DOCX)

The DOCX is a change request, not a layout. It specifies, for **both** form variants:

### INSPECTION FORM (ABSTRACTION)
- I. Identification — unchanged
- **II. Permit Specifics Findings — becomes a Permitted vs Actual comparison:**
  - Permitted activity | Actual activity
  - Permitted abstraction quantity (m³/year or m³/day) | Actual abstraction quantity (m³/year or m³/day)
  - Permitted abstraction method | Actual abstraction method
  - **Remove "Wastewater Management System"** from this section
- III. Social & OHS — unchanged
- IV. Fees & Reports — unchanged
- **V. Findings / General observations — add "Wastewater Management System"**
- VI. Documents — unchanged

### INSPECTION FORM (CONCESSION)
Identical, except the quantity/method rows are replaced by:
- Permitted concession area (ha or m²) | Actual concession area (ha or m²)

---

## 2. Current state

The checklist editor is a **single shared component**, `components/inspection/inspection-form-layout.tsx`, rendered by four permit-inspection pipeline pages:

- `app/assessment/inspection/permit/[id]/page.tsx`
- `app/verification/inspection/permit/[id]/page.tsx`
- `app/review/inspection/permit/[id]/page.tsx`
- `app/approver/inspection/permit/[id]/page.tsx`

`app/inspection/physical/[id]/page.tsx` is a **separate legacy form** for *application* (pre-permit) inspections, built from its own `components/inspection/checklist/section-*.tsx` components with a different section numbering (1–12). It is still reachable from `inspections-tab.tsx` and `all-applications-tab.tsx`. It is **out of scope** for this change — see §6.

Read-only rendering of a submitted inspection lives in `components/inspection/inspection-detail.tsx`.

Relevant facts:

- The *Permit specifics* tab currently shows **only permitted values**. Section `3. Water Use Details` renders permitted quantity, unit and abstraction method; the concession branch renders authorized surface area plus authorized/actual boundary tables.
- `actual_quantity`, `actual_unit`, `actual_abstraction_method` are **existing DB columns** (`lib/inspections/payload-columns.data.json`) that are **never rendered in the editor**. `inspection-detail.tsx` already displays them.
- `actual_surface_area_ha` exists and is already rendered (concession branch).
- There is **no activity pair** anywhere. `activity_type` / `activity_starting_date` exist but are explicitly deprecated (Section 7 was removed per RWB inspector feedback) and must not be reused.
- `4. Wastewater Management System` sits in the *Permit specifics* tab.
- There is **no inspection PDF export**; nothing outside the editor and detail view consumes these fields.

---

## 3. Design

### 3.1 Section II — Permitted vs Actual comparison table

Add a local `ComparisonRow` component to `inspection-form-layout.tsx`. It renders a two-column grid:

- **Left (Permitted):** the existing `EditableLockedField` behaviour — read-only when the permit supplies a value; amber "(missing — editable)" input when it does not, writing to `locked_field_overrides`.
- **Right (Actual):** an always-editable input bound to the corresponding form field.

Rows rendered, by template:

**`authorization` (abstraction)** — section retitled `3. Permit specifics (permitted vs actual)`:

| Permitted | Actual |
|---|---|
| Activity (locked ← `locked.waterPurpose`, override key `waterPurpose`) | Actual activity (`locked_field_overrides.actualActivity`) |
| Quantity (`form.allowed_quantity`) + unit (`form.allowed_unit`) | Quantity (`form.actual_quantity`) + unit (`form.actual_unit`) |
| Abstraction method (`form.authorized_abstraction_method`) | Actual abstraction method (`form.actual_abstraction_method`) |

Retained below the table, unchanged: `Type of water measurement device in place` (`form.measurement_device_type`).

**`concession`** — section retitled `3. Permit specifics (permitted vs actual)`:

| Permitted | Actual |
|---|---|
| Activity (locked ← `locked.waterPurpose`) | Actual activity (`locked_field_overrides.actualActivity`) |
| Concession area (`locked.concessionAreaHa`) + unit (`locked_field_overrides.permittedConcessionAreaUnit`) | Concession area (`form.actual_surface_area_ha`) + unit (`locked_field_overrides.actualConcessionAreaUnit`) |

Retained below the table, unchanged: authorized concession boundaries table (read-only) and actual concession boundaries table (editable, with "+ Add others").

### 3.2 Units

Units are `Select` dropdowns on each side.

- Abstraction: options `m³/year`, `m³/day`. Persisted to the existing `allowed_unit` / `actual_unit` text columns.
- Concession: options `ha`, `m²`. Persisted to `locked_field_overrides` (see 3.3).

The **permitted-side** dropdown is `disabled` whenever the permitted value came from the permit — it displays the permit's stored unit. It becomes enabled only when the permitted value itself is missing and the inspector is entering it (the same condition that unlocks the amber input). The **actual-side** dropdown is always enabled when `canEdit`.

Default when no unit is stored: `m³/year` for abstraction, `ha` for concession — matching the defaults already used by `inspection-detail.tsx`.

Numeric values keep the existing `NumberField` semantics (free typing of intermediate states like `-`, `1.`, committed on blur).

### 3.3 Storage — no DB migration

The prod database is on-premise PostgreSQL on `10.10.82.199`, reachable only from inside the RWB network. DDL cannot be applied from the development machine (SSH to port 22 times out). Shipping code that writes to a column that does not exist on prod would break inspection saves on the live site.

Therefore this change is **pure application code**. Mapping:

| Datum | Storage |
|---|---|
| Permitted quantity / unit / method | existing `allowed_quantity`, `allowed_unit`, `authorized_abstraction_method` |
| Actual quantity / unit / method | existing `actual_quantity`, `actual_unit`, `actual_abstraction_method` |
| Permitted concession area | existing `locked.concessionAreaHa` (from permit) / `locked_field_overrides.concessionAreaHa` |
| Actual concession area | existing `actual_surface_area_ha` |
| Permitted activity | existing `locked.waterPurpose` / `locked_field_overrides.waterPurpose` |
| **Actual activity** | **`locked_field_overrides.actualActivity`** (new key, existing jsonb column) |
| **Permitted concession area unit** | **`locked_field_overrides.permittedConcessionAreaUnit`** (new key) |
| **Actual concession area unit** | **`locked_field_overrides.actualConcessionAreaUnit`** (new key) |

`locked_field_overrides` is an existing `jsonb` column already persisted end-to-end by all five pipeline pages and already read by `inspection-detail.tsx` via `OverridableReadonlyField`. Adding keys to it requires no schema change and no payload-column registration.

**Trade-off, accepted:** three values live in jsonb rather than first-class columns, so SQL reporting would need `->>` accessors. Nothing consumes them today. A follow-up migration can promote them to real columns when someone with network access can run DDL; the promotion would be additive and backfillable from the jsonb.

### 3.4 Wastewater relocation

Remove the `4. Wastewater Management System` `SectionShell` from the *Permit specifics* tab. Insert it as the **first** section of the *Findings* tab, titled `8. General observations — Wastewater management system`, with the same two fields (`wastewater_system_type`, `wastewater_system_effectiveness`) and the same `TextField` controls.

Renumber the remaining Findings sections so numbering stays contiguous:

| Before | After |
|---|---|
| (in Permit specifics) 4. Wastewater Management System | 8. General observations — Wastewater management system |
| 8. Water use conflicts | 9. Water use conflicts |
| 9. Catchment protection initiatives | 10. Catchment protection initiatives |
| 10. Conclusion and recommendations | 11. Conclusion and recommendations |

Section numbers are presentational strings only — no code keys off them.

### 3.5 View mode (`inspection-detail.tsx`)

Mirror the editor so a submitted inspection reads back identically:

- *Permit specifics* section renders the same permitted/actual pairs, including the new activity pair (permitted from `water_purpose` / `locked_field_overrides.waterPurpose`, actual from `locked_field_overrides.actualActivity`).
- Concession area displays with its stored unit from `locked_field_overrides`, defaulting to `Ha`.
- The wastewater `SectionShell` moves down to sit with the findings sections, retitled `General observations — Wastewater management system`. Its existing "render only when populated" conditional is preserved.

### 3.6 Page wiring

The four permit-inspection pages already forward `locked_field_overrides` and all `actual_*` columns in both directions (load and save) — verified: each references them 15 times. **No page-level changes are expected.**

---

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Writing to a non-existent prod column breaks saves | No new columns — jsonb only (§3.3). `lib/inspections/safe-payload-retry.ts` remains as a second line of defence. |
| A pipeline page's local `FormState` lacks an `actual_*` field, silently dropping it on save | Verified across all four permit-inspection pages before implementation. |
| Regression in the concession boundary tables while restructuring the tab | Boundary tables are moved verbatim, not rewritten. |
| Prod build failure takes the live site down | `npm run build` must pass locally before any push (CLAUDE.md hard rule). |
| Test inspection left behind in prod data | Deletion of the test inspection is an explicit, required final step. |

---

## 5. Verification plan

1. `npm run build` locally — must pass with zero errors.
2. Commit and push to `chore/stage-unstaged-2026-03-01` (**production**; the on-prem server auto-pulls, builds and restarts within ~2 minutes).
3. Do **not** push to `-uat` in this change unless asked; if requested later, cherry-pick (never merge — the branches carry intentional differences).
4. Via Chrome on `https://waterpermit.rwb.rw/assessment?tab=inspections`: create a test inspection against a real permit, fill **every** field in all six tabs, save, and submit as needed to reach view mode.
5. Open the inspection in view mode and confirm every entered value renders — with particular attention to the new permitted/actual pairs, the unit dropdowns, and the relocated wastewater block.
6. Report any mismatch as a bug and fix before declaring done.
7. **Delete the test inspection** from production.

## 6. Out of scope

- Promoting the three jsonb keys to real columns (needs RWB network access).
- Any change to Identification, Social & OHS, Fees & Reports, or Documents — the DOCX marks all four "(Same)".
- The deprecated `activity_type` / `activity_starting_date` columns, which stay untouched.
- UAT branch propagation.
- **The legacy application-inspection form** at `app/inspection/physical/[id]/page.tsx`. It has a different structure (sections 1–12, its own `section-*.tsx` components) and already renders permitted and actual abstraction as separate sections. Restructuring it is a distinct piece of work; flagged to the user for a follow-up decision.
