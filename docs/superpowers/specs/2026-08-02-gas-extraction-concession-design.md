# Gas Extraction — Reformulate from Abstraction to Concession

**Date:** 2026-08-02
**Source requirement:** `Gas Extraction.docx`
**Status:** Approved design — ready for implementation plan
**Target branch:** `chore/stage-unstaged-2026-03-01-uat` (staging/UAT) first, `[GAS]` commit prefix →
verify → cherry-pick to `chore/stage-unstaged-2026-03-01` (prod) only when instructed. Never merge
directly between the two.

---

## 1. Goal

The existing intended activity **`gaz_extraction`** is currently treated as an **abstraction**
activity (application type `industrial`, no details table, no concession polygon, free water-source
choice). Per the RWB form, it must be **reformulated as a pure-concession activity**, mirroring the
Port Construction implementation (`[PORT]` commits), which the source `.docx` was itself copied from
(it even retains the "Port Construction Details" heading by copy-paste — adapted per user decision,
see §1.2).

This is a **conversion in place**: the DB enum value `gaz_extraction` is kept. Unlike Port
Construction, **no database migration is needed** — `gaz_extraction` already exists in the
`water_purpose` enum, in `types/database.ts`, and in all schema files.

### 1.1 Source document field mapping

| # | Doc item | Handling |
|---|----------|----------|
| 1–6 | Applicant name, category, representative (+position), registration cert/ID, office address, contact | Existing fields — unchanged |
| 7 | **Intended Activity: Gas Extraction** → Water Use Category = Concession; Concession Area ≥ 4 points | Convert to pure-concession; existing polygon component enforces the 4-point minimum |
| 8 | **Details table** (4 fields) + ANNEX (4 docs) | **NEW** details table + updated annex case (add 4th doc) |
| 9 | Name of the lake | Reuse Water Source tab; **lock source type to Lake**; `nameSourceWater` is the lake name |
| 10 | Location of the site (Province/District/Sector/Cell/Village) | Existing Water Source location fields — unchanged |
| 11 | Requested Permit Duration | Existing `permitLengthYears` — unchanged |
| 12 | Land ownership | Existing tab — unchanged |
| 13 | Payment | Existing tab — unchanged |

### 1.2 User decisions (2026-08-02)

1. **Headings adapted to Gas Extraction:** the doc's copy-pasted "8. Port Construction Details" /
   "Purpose of construction" become **"8. Gas Extraction Details"** / **"Purpose of extraction"**.
2. **"Amount of water required, if any (m³/day)" is REQUIRED** at submission. Because the label says
   "if any", the field is a required numeric that **accepts 0** (validation: finite number ≥ 0), so
   an applicant needing no water enters 0 rather than being blocked.
3. **Display label renamed** "Gaz extraction"/"Gaz Extraction" → **"Gas Extraction"** in every
   user-facing label map. The DB enum value `gaz_extraction` and the Kinyarwanda label
   ("byo gucukura gaze") are unchanged.

---

## 2. Architecture & precedent

Direct template: **`port_construction`** (see
`docs/superpowers/specs/2026-06-30-port-construction-design.md` and commits `b23ec03`, `3213b8c`,
`b7e1229`, `5f2a377`). Gas Extraction reuses the same machinery end-to-end. Differences from Port:

| Aspect | Port Construction | Gas Extraction |
|---|---|---|
| Activity code | new (`port_construction`) | existing (`gaz_extraction`) — converted |
| `water_purpose` enum | needed migration | **already present — no migration** |
| 4th detail field | Expected construction duration (text, required) | Amount of water required, if any (m³/day) (number ≥ 0, required) |
| Annex docs | 3 | **4** (adds "Recommendation/License from RMB") |
| Annex case | new | existing case updated (title + labels + 4th doc) |
| Label maps | new entries | existing entries **renamed** to "Gas Extraction" |

### Data storage summary (no schema change anywhere)

| Data | Where stored |
|------|--------------|
| Activity code `gaz_extraction` | `applications.intended_activities` JSONB (canonical) + `water_purpose` column (already 1:1 mapped) |
| 4 detail fields | `applications.internal_notes` JSONB snapshot (`mapFormDataToApplication`) |
| Concession polygon | `applications.coordinates` + `waterSourcePolygons` in `internal_notes` |
| 4 annex documents | `documents` table via existing upload pipeline |

---

## 3. Concession conversion — the three decision sites

Adding `gaz_extraction` to concession detection in **all three** places that decide
abstraction-vs-concession (a miss at any one produces the wrong permit/contract template):

1. **`lib/permit-variant.ts` → `isConcessionApplication()`** (~L62) — the central check. Drives
   `selectPermitVariant()` → `concession_individual` / `concession_organization`, which is consumed
   by the terms page, review/permit pages, `lib/document-slots/build-context.ts`,
   `contract-resolver.ts`, `document-text-overrides`, and the public permit PDF route
   (`app/api/public/permits/pdf/[...permitNumber]/route.ts`).
2. **`app/api/modifications/propagate-approved-values/route.ts`** (~L115) — local
   `isConcessionApplication(activitiesRaw, notes)` copy; add `gaz_extraction` to its activity list.
3. **`app/permit/view/[...permitNumber]/page.tsx`** (~L270) — `concessionPurposeHints` set (legacy
   fallback keyed on `water_purpose` when no application row exists); add `"gaz_extraction"`.

**Explicit requirement (user):** the issued **permit** and the **permit contract** must render with
the **concession** template, not the abstraction one. The three sites above are what select those
templates; §10 test plan verifies both documents end-to-end.

### Category / application-type maps

- `lib/application-utils.ts` `formatApplicationTypeForDB` (~L119) and the second occurrence (~L301):
  `'gaz_extraction': 'industrial'` → `'gaz_extraction': 'commercial'` (matches
  recreation/port).
- `lib/db/application-enum-sanitizer.ts` (~L103): same `industrial` → `commercial` change.
- `formatWaterPurposeForDB`: `'gaz_extraction': 'gaz_extraction'` already correct — unchanged.

### Known, intended consequence

Existing gas-extraction applications/permits (created under the abstraction model) will begin
rendering as concession-variant documents. This is the purpose of the reformulation.

---

## 4. Form changes — `components/dashboard/application-form-new.tsx`

### 4.1 Pure-concession registration (ALL occurrences)

Add `"gaz_extraction"` to every pure-concession array so the locked Concession badge, the polygon
map, and concession-only behaviour activate. Grep `pureConcessionActivities` / `pureConcessionActs`
before editing — zero misses. Known occurrences: ~L526, ~L1791, ~L2012, ~L2671 (plus any others the
grep finds, including in `new-application`/`edit-application` pages if present).

Water-use category is **auto-derived and locked** — no manual radio (project rule).

### 4.2 Force water source = Lake (locked)

When `gaz_extraction` is selected: set `waterSourceType = "lake"` and disable the source-type
dropdown, exactly as `port_construction` does (extend the same `isPortConstruction`-style condition
or add a parallel `isGazExtraction` flag). `nameSourceWater` serves as "Name of the lake".

### 4.3 Activity label

RadioGroup option (~L4643): `{ value: "gaz_extraction", label: tx("Gaz extraction") }` →
`label: tx("Gas Extraction")`.

### 4.4 Zod schema + defaults

```ts
// Gas Extraction details
gazExtractionPurpose: z.string().optional(),
gazExtractionDescription: z.string().optional(),
gazExtractionConcessionAreaM2: optionalNumberField,
gazExtractionWaterAmountM3PerDay: optionalNumberField,

// 4th annex document (3 existing gazExtraction* doc fields already present)
gazExtractionRMBLicense: z.any().optional(),
```

Matching entries in `defaultValues` (`""` / `undefined`) and in the file-input `useRef` map
(~L1445 block already has the 3 existing doc refs — add `gazExtractionRMBLicense`).

### 4.5 Details table block — "8. Gas Extraction Details"

Conditional block (`watchedIntendedActivities?.includes("gaz_extraction")`), placed alongside the
Port Construction block, same table markup, all inputs `disabled={readOnly}`:

| Row label | Field | Control / validation |
|-----------|-------|----------------------|
| Purpose of extraction * | `gazExtractionPurpose` | text — non-empty |
| Brief description of the project * | `gazExtractionDescription` | textarea — non-empty |
| Concession area (m²) * | `gazExtractionConcessionAreaM2` | number — finite, > 0 |
| Amount of water required, if any (m³/day) * | `gazExtractionWaterAmountM3PerDay` | number — finite, **≥ 0** |

Below the table the existing required-attachments section for `gaz_extraction` renders (already
wired at ~L6549); it picks up the 4th document automatically from `annex-requirements.ts`.

### 4.6 Validation (three layers, mirroring Port)

1. **Zod `superRefine`** (~L665 Port block): parallel `hasGazExtractionActivity` block — 4 issues.
2. **Submit-time `form.setError` block** (~L2196 Port block): parallel checks with clear messages;
   water-amount check is `typeof v === 'number' && Number.isFinite(v) && v >= 0`.
3. **Completeness/summary check** (~L2553/2697 Port block): parallel gas branch.

Also: `requiredFieldLabels` map (~L1038) and the required-fields list (~L883) get the 4 new keys.
Submission additionally requires the ≥4-point concession polygon (automatic once pure-concession)
and all 4 annex documents.

---

## 5. Annex requirements — `lib/annex-requirements.ts`

Update the existing `gaz_extraction` case (~L176):

```ts
case "gaz_extraction":
  return {
    annexTitle: "ANNEX (Only for Gas Extraction)",
    attachments: [
      req(applicationLetterLabel, "gazExtractionGeneralRequirements"),
      req("Environmental Impact Assessment Certificate", "gazExtractionEIA"),
      req("Project Feasibility Study", "gazExtractionFeasibilityStudy"),
      req("Recommendation/License from RMB", "gazExtractionRMBLicense"),
    ],
  };
```

(Title was "ANNEX J (Only for gaz extraction)"; labels aligned to the doc/Port wording. `req()`
marks all four `required: true`.)

### documentTypes maps — BOTH save paths (known gotcha)

Per commit `3213b8c` (Port annex docs silently never saved): the upload loop only iterates fields
present in the field→document_type map. Add `gazExtractionRMBLicense` to the documentTypes map in
**both** `app/dashboard/new-application/page.tsx` **and** `app/dashboard/edit-application/[id]/page.tsx`,
and verify the 3 existing gazExtraction* fields are already present in both.

---

## 6. Persistence — `lib/application-utils.ts`

- `internal_notes` snapshot object (`mapFormDataToApplication`, ~L412+): add the 4 detail keys so
  they round-trip on save/restore.
- Concession-area-from-m² helper (the `recreationConcessionAreaM2`/`portConstructionConcessionAreaM2`
  → hectares logic ~L235): add `gazExtractionConcessionAreaM2` branch for derived `concession_area`.
- `formatApplicationTypeForDB` changes per §3.

---

## 7. Label rename — "Gas Extraction" everywhere user-facing

DB value stays `gaz_extraction`; Kinyarwanda stays "byo gucukura gaze". English display maps to
update (grep `Gaz` to catch all):

| File | Current |
|---|---|
| `components/dashboard/application-form-new.tsx` ~L4643 | "Gaz extraction" |
| `lib/permit/permit-text-data.ts` ~L197 `ACTIVITY_LABELS` | "Gaz Extraction" |
| `lib/pdf-generator.ts` ~L316 | "Gaz Extraction" |
| `lib/document-overrides.ts` ~L73 | "Gaz extraction" |
| `lib/assessment-report-utils.ts` ~L269 | "Gaz Extraction" |
| `hooks/useWaterUseReports.ts` ~L249 | "Gas Extraction" — verify, align |
| `components/dashboard/permit-transfer-form.tsx` ~L1596 | tx("Gaz Extraction") |
| `lib/contract-placeholders.ts` ~L284 | already "Gas Extraction" — no change |

Add i18n keys to `messages/en.json` + `messages/rw.json` for every new string (activity label if
keyed, 4 table row labels, RMB annex label, "Gas Extraction Details" heading).

---

## 8. Read-only / pipeline-page parity

Grep every `portConstruction` / `port_construction` touch-point outside the form and add the gas
equivalent at each. Known from the Port commits:

- `app/approver/application/[id]/page.tsx`
- `app/review/application/[id]/page.tsx`
- `app/verification/application/[id]/page.tsx`
- `app/assessment/application/[id]/page.tsx`
- `app/inspection/application/[id]/page.tsx`
- `app/permit/view/[...permitNumber]/page.tsx` (details display + `concessionPurposeHints`)
- `app/dashboard/edit-application/[id]/page.tsx` (restore + documentTypes)
- `app/dashboard/new-application/page.tsx` (documentTypes + manual-permit purpose derivation)
- `components/dashboard/permit-renewal-form.tsx`, `components/dashboard/permit-transfer-form.tsx`
- `app/api/modifications/propagate-approved-values/route.ts`

The details block itself renders read-only via `disabled={readOnly}` wherever the shared form
component is reused.

---

## 9. Out of scope (unchanged)

- Applicant info, representative, office address, contact (items 1–3, 5–6).
- Standard documents (item 4) — still required, config unchanged.
- Permit duration (11), land ownership (12), payment (13).
- Contract terms *content* (`lib/contract-terms.ts`) — concession templates already exist and are
  selected by variant; no new template text.
- No renaming of the DB enum value; no data backfill of existing rows.

---

## 10. Test plan

1. Draft application → select **Gas Extraction** (label shows "Gas Extraction").
2. Verify: Water Use Category auto-shows **Concession** (locked, no radio); source type locks to
   **Lake**; concession polygon map appears and rejects < 4 points.
3. Fill the 4 detail fields (water amount accepts 0); upload the **4** annex documents; complete
   location, duration, land ownership.
4. Attempt submit with a missing detail field / missing RMB doc / < 4-point polygon → blocked with
   clear errors.
5. Submit → reopen via **Edit** → all detail fields, polygon, and **all 4 documents** restore
   (documentTypes-map check in both save paths).
6. Review / assessment pages → details render read-only.
7. DB row: `water_purpose = 'gaz_extraction'`, `intended_activities` contains `gaz_extraction`,
   `application_type = 'commercial'`, `internal_notes` has the 4 detail values,
   `concession_area` derived from m².
8. **Permit + contract template check (explicit user requirement):** walk the application to
   approval on UAT; confirm the terms page, permit preview, issued permit view, and the generated
   contract all use the **concession** variant (`concession_individual` / `concession_organization`
   — concession area & lake wording), NOT the abstraction template; public permit PDF route
   likewise.
9. Modification flow spot-check: `propagate-approved-values` treats the application as concession.
10. `npm run build` passes (mandatory before any push).

---

## 11. Touch-point checklist (zero-miss reference)

1. `lib/permit-variant.ts` — `isConcessionApplication()` + `gaz_extraction`
2. `app/api/modifications/propagate-approved-values/route.ts` — local concession check
3. `app/permit/view/[...permitNumber]/page.tsx` — `concessionPurposeHints` + details display
4. `components/dashboard/application-form-new.tsx` — pure-concession arrays (all), Lake lock,
   label, Zod + defaults + refs, details table, 3-layer validation, requiredFieldLabels
5. `lib/annex-requirements.ts` — updated `gaz_extraction` case (title, labels, 4th doc)
6. `app/dashboard/new-application/page.tsx` + `app/dashboard/edit-application/[id]/page.tsx` —
   documentTypes maps (RMB doc; verify existing 3)
7. `lib/application-utils.ts` — `formatApplicationTypeForDB` ×2, snapshot keys, area-from-m² helper
8. `lib/db/application-enum-sanitizer.ts` — category map
9. Label maps (§7) + `messages/en.json` / `messages/rw.json`
10. Read-only parity sites (§8)
