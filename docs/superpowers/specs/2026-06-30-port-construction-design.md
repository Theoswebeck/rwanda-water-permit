# Port Construction — Water Permit Activity

**Date:** 2026-06-30
**Source requirement:** `PORT CONSTRUCTION.docx`
**Status:** Approved design — ready for implementation plan
**Target branch:** `chore/stage-unstaged-2026-03-01-uat` (staging/UAT) first → verify → cherry-pick to `chore/stage-unstaged-2026-03-01` (prod). Never merge directly between the two.

---

## 1. Goal

Add a new intended activity, **Port Construction**, to the water permit application flow. It is a
**pure-concession** activity: selecting it auto-sets the Water Use Category to *Concession*
(no manual radio — per the project rule that water-use category is always activity-derived). It is
modeled directly on the existing `recreation_activities` activity, which is also pure-concession and
already captures a details table, a concession-area value, and a min-4-point concession polygon.

### Source document field mapping

The `.docx` lists 13 numbered items. Most already exist in the form; the genuinely new work is items
7, 8, and the lake constraint in 9.

| # | Doc item | Handling |
|---|----------|----------|
| 1 | Full Name of the Applicant | Existing applicant-info field — unchanged |
| 2 | Category of the Applicant | Existing account-type field — unchanged (no activity-specific restriction) |
| 3 / 3.a | Name + Position of representative | Existing fields — unchanged |
| 4 | Documents – Registration Certificate/ID | Existing standard documents — unchanged (still required) |
| 5 | Office Address | Existing field — unchanged |
| 6 | Contact Information | Existing field — unchanged |
| 7 | **Intended Activity: Port Construction** → Water Use Category = Concession; Concession Area ≥ 4 points | **NEW** activity + pure-concession mapping + existing polygon component (already enforces 4-point minimum) |
| 8 | **Port Construction Details** table + ANNEX (3 docs) | **NEW** details table (4 fields) + **NEW** annex case (3 mandatory docs) |
| 9 | Name of the lake | Reuse Water Source tab; **lock source type to Lake**; `nameSourceWater` is the lake name |
| 10 | Location of the site (Province/District/Sector/Cell/Village) | Existing Water Source location fields — unchanged |
| 11 | Requested Permit Duration | Existing `permitLengthYears` field — unchanged |
| 12 | Land ownership | Existing Land Ownership tab — unchanged |
| 13 | Payment | Existing Payment tab — unchanged |

---

## 2. Architecture & precedent

The closest existing precedent is **`recreation_activities`**. Port Construction reuses the same
machinery end-to-end:

- **Activity list:** RadioGroup in `components/dashboard/application-form-new.tsx`.
- **Pure-concession derivation:** the `pureConcessionActivities` / `pureConcessionActs` arrays (multiple
  occurrences) and `lib/permit-variant.ts` `isConcessionApplication()`.
- **Concession polygon:** `components/forms/MultiPolygonInputWithValidation.tsx` already enforces
  `MIN_POLYGON_POINTS = 4`. No change needed there — it renders automatically when the effective
  water-use category is `concession`.
- **Detail fields persistence:** activity detail fields are **not** dedicated DB columns. They are
  serialized into the `applications.internal_notes` JSONB blob by `mapFormDataToApplication()` in
  `lib/application-utils.ts` (the `internal_notes: JSON.stringify({ ... })` snapshot, ~L412+). Adding
  Port Construction detail fields therefore needs **no DB column migration** — only new keys in that
  snapshot object plus the Zod schema.
- **Annex documents:** `lib/annex-requirements.ts` defines required attachments per activity; the
  upload pipeline and validation already consume it.

### Data storage summary

| Data | Where stored | Migration? |
|------|--------------|-----------|
| Activity code `port_construction` | `applications.intended_activities` JSONB (canonical; read by all display/logic) | No |
| 4 detail fields | `applications.internal_notes` JSONB snapshot | No |
| Concession polygon | `applications.coordinates` geometry + `waterSourcePolygons` in `internal_notes` | No |
| 3 annex documents | `documents` table via existing upload pipeline | No |
| Legacy `water_purpose` enum column | **New enum value** `port_construction` | **Yes** (see §3) |

---

## 3. Database migration (the only schema change)

The `water_purpose` Postgres enum has a fixed value set and currently has **no** `port_construction`
member. Decision: **add a new enum value** (rather than remapping onto an existing one).

- **New migration file** under `database/` (e.g. `database/2026-06-30-add-port-construction-purpose.sql`):

  ```sql
  ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'port_construction';
  ```

  Notes:
  - `ALTER TYPE ... ADD VALUE` **cannot run inside a transaction block** that then uses the value, and
    in some Postgres versions cannot run inside an explicit transaction at all. Keep this as a
    standalone statement / migration, separate from any migration that immediately inserts rows using
    the value.
  - Must be applied to **both** environments: UAT database first, then the prod database when the
    feature is cherry-picked to prod.
- **Canonical schema files** (`database/schema.sql`, `database/schema-from-supabase.sql`,
  `database/schema-selfhosted.sql`): add `port_construction` to the `water_purpose` enum definition so
  fresh installs include it.
- **`types/database.ts`:** add `'port_construction'` to the `WaterPurpose` type union.

---

## 4. Form changes — `components/dashboard/application-form-new.tsx`

### 4.1 Activity option
Add to the activities RadioGroup (~L4451–4466):

```ts
{ value: "port_construction", label: tx("Port Construction") },
```

### 4.2 Pure-concession registration (ALL occurrences)
Add `"port_construction"` to every pure-concession list so the Concession badge, the polygon map, and
concession-only behaviour all activate. Known occurrences (verify by grepping
`pureConcessionActivities` / `pureConcessionActs` before editing — there must be zero misses):
`~L508`, `~L1681`, `~L1896`, `~L2435/2507`. Also add to `lib/permit-variant.ts` `isConcessionApplication()` (~L62).

### 4.3 Force water source = Lake (locked)
When `port_construction` is the selected activity:
- set `waterSourceType = "lake"` (valid enum member of
  `["lake","dam","spring","borehole","stream_river","other"]`), and
- **disable** the source-type dropdown (read-only) so it cannot be changed.

`nameSourceWater` serves as the "Name of the lake". The existing Water Source location fields cover
item #10.

### 4.4 Zod schema additions
Add detail fields and document fields (mirroring recreation/infrastructure naming):

```ts
// Port Construction details
portConstructionPurpose: z.string().optional(),
portConstructionDescription: z.string().optional(),
portConstructionConcessionAreaM2: optionalNumberField,
portConstructionDuration: z.string().optional(),

// Port Construction annex documents
portConstructionGeneralRequirements: z.any().optional(),
portConstructionEIA: z.any().optional(),
portConstructionFeasibilityStudy: z.any().optional(),
```

Add matching `undefined` entries to the form `defaultValues`.

### 4.5 Details table block
Render a conditional block (`watchedIntendedActivities?.includes("port_construction")`), placed
alongside the recreation block, with a 4-row table. All inputs use `disabled={readOnly}` so the block
renders correctly read-only on view/review/assessment pages.

| Row label | Field | Control |
|-----------|-------|---------|
| Purpose of construction * | `portConstructionPurpose` | text input |
| Brief description of the project * | `portConstructionDescription` | textarea |
| Concession area (m²) * | `portConstructionConcessionAreaM2` | number input |
| Expected period of time required for construction * | `portConstructionDuration` | text input |

Below the table, render the required-attachments section for `port_construction` (driven by
`annex-requirements.ts`).

### 4.6 Validation
Mirror the `fish_farming_lakes` / `recreation_activities` validation cases (~L677, ~L1956, ~L2435) so
that, for `port_construction`, submission is blocked unless:
- all 4 detail fields are filled,
- a concession polygon with ≥ 4 points exists, and
- all 3 annex documents are uploaded.

---

## 5. Annex requirements — `lib/annex-requirements.ts`

Add a new case. `req(label, fieldName)` already sets `required: true`, satisfying "all 3 mandatory".
The standard documents (item #4, ID/registration cert) continue to apply in addition.

```ts
case "port_construction":
  return {
    annexTitle: "ANNEX (Only for Port Construction)",
    attachments: [
      req("Application letter addressed to RWB DG through District Mayor", "portConstructionGeneralRequirements"),
      req("Environmental Impact Assessment Certificate", "portConstructionEIA"),
      req("Project Feasibility Study", "portConstructionFeasibilityStudy"),
    ],
  };
```

---

## 6. Persistence — `lib/application-utils.ts`

- `formatWaterPurposeForDB`: add `'port_construction': 'port_construction'`.
- `formatApplicationTypeForDB`: add `'port_construction': 'commercial'` (matches recreation).
- `internal_notes` snapshot object: add the 4 detail keys
  (`portConstructionPurpose`, `portConstructionDescription`, `portConstructionConcessionAreaM2`,
  `portConstructionDuration`) so they round-trip on save/restore.
- Concession-area-from-m² helper (the `recreationConcessionAreaM2 → hectares` logic at ~L235): add a
  `portConstructionConcessionAreaM2` branch so the derived `concession_area` (hectares) is populated
  consistently.

---

## 7. Internationalization

Add label keys for every new string ("Port Construction", the 4 table row labels, the 3 annex
document labels) to both `messages/en.json` and `messages/rw.json`.

---

## 8. Read-only / pipeline-page parity

The details block uses `disabled={readOnly}`, so it renders read-only wherever the same form component
is reused (edit / view / review / assessment). To guarantee zero misses: grep every site that renders
recreation detail fields (e.g. `recreationProjectDescription`, `recreationConcessionAreaM2`) and add a
`port_construction` equivalent at each, including any standalone read-only display components or
assessment-report sections.

---

## 9. Out of scope (unchanged)

- Applicant info, representative, office address, contact (items 1–3, 5–6).
- Standard documents (item 4) — still required, no change to their config.
- Permit duration (item 11), land ownership (item 12), payment (item 13) — existing tabs already serve
  concession applications.

---

## 10. Test plan

1. Create a draft application, select **Port Construction**.
2. Verify: Water Use Category badge auto-shows **Concession**; source type locks to **Lake** and is not
   editable; the concession polygon map appears and rejects fewer than 4 points.
3. Fill the 4 detail fields; upload the 3 annex documents; complete location, permit duration, land
   ownership.
4. Attempt submit with a missing detail field / missing annex doc / <4-point polygon → submission is
   blocked with a clear error.
5. Submit successfully → reopen via **Edit** and confirm all detail fields and the polygon restore.
6. Open the application on **review** and **assessment** pages → confirm the Port Construction details
   render correctly read-only.
7. Confirm the DB row has `water_purpose = 'port_construction'`, `intended_activities` contains
   `port_construction`, and `internal_notes` contains the 4 detail values.
8. `npm run build` passes with no errors (mandatory before any push).

---

## 11. Touch-point checklist (zero-miss reference)

1. `database/<new migration>.sql` — `ALTER TYPE water_purpose ADD VALUE 'port_construction'`
2. `database/schema.sql`, `schema-from-supabase.sql`, `schema-selfhosted.sql` — enum value for fresh installs
3. `types/database.ts` — `WaterPurpose` union
4. `components/dashboard/application-form-new.tsx` — activity option; pure-concession arrays (all
   occurrences); force-Lake lock; Zod schema (4 detail + 3 doc keys) + defaults; details table block;
   validation cases
5. `lib/permit-variant.ts` — `isConcessionApplication`
6. `lib/annex-requirements.ts` — new `port_construction` case
7. `lib/application-utils.ts` — `formatWaterPurposeForDB`, `formatApplicationTypeForDB`,
   `internal_notes` snapshot keys, concession-area-from-m² helper
8. `messages/en.json` + `messages/rw.json` — labels
9. Read-only parity sites (grep recreation detail fields)
