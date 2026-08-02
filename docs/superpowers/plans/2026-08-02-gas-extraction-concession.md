# Gas Extraction Abstraction→Concession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing `gaz_extraction` intended activity from abstraction to a pure-concession activity (locked Concession category, Lake-locked source, 4-field details table, 4 mandatory annex docs, concession permit/contract templates), mirroring the Port Construction implementation.

**Architecture:** No DB migration — `gaz_extraction` already exists in the `water_purpose` enum. All changes are app-code: add `gaz_extraction` to every concession-decision site, add form details/validation mirroring `port_construction`, extend the existing Annex J case with a 4th document, and rename the display label to "Gas Extraction".

**Tech Stack:** Next.js App Router (TypeScript), react-hook-form + Zod, PostgreSQL. No automated test suite in this repo — verification is `npx tsc --noEmit` per task, `npm run build` before push (MANDATORY per CLAUDE.md), plus grep sweeps.

**Spec:** `docs/superpowers/specs/2026-08-02-gas-extraction-concession-design.md`

## Global Constraints

- Work on branch `chore/stage-unstaged-2026-03-01-uat` (this is STAGING despite the name). NEVER merge/push into `chore/stage-unstaged-2026-03-01` (prod); prod gets these commits later by cherry-pick only, when the user instructs.
- Every commit message starts with the `[GAS] ` prefix.
- `npm run build` must pass before any `git push` (tsc alone is not enough).
- DB enum value stays `gaz_extraction`; Kinyarwanda activity label stays "byo gucukura gaze" (permit/contract) and "Kwakira gaze/Kwakira Gaze" (form i18n).
- New form field names (used verbatim across tasks): `gazExtractionPurpose`, `gazExtractionDescription`, `gazExtractionConcessionAreaM2`, `gazExtractionWaterAmountM3PerDay`, `gazExtractionRMBLicense`.
- "Amount of water required, if any (m³/day)" is REQUIRED but accepts 0 (validation: finite number ≥ 0). The other 3 detail fields require non-empty / > 0.
- English display label is "Gas Extraction" (renamed from "Gaz extraction"/"Gaz Extraction").

---

### Task 1: Concession classification — all decision sites

**Files:**
- Modify: `lib/permit-variant.ts:62`
- Modify: `lib/assessment-report-utils.ts:180-198,269`
- Modify: `app/api/modifications/propagate-approved-values/route.ts:115-120`
- Modify: `app/permit/view/[...permitNumber]/page.tsx:270`
- Modify: `hooks/useWaterUseReports.ts:225-230`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isConcessionApplication()` and `determineReportType()` return concession for `gaz_extraction`; later tasks rely on this for template selection.

- [ ] **Step 1: `lib/permit-variant.ts`** — in `isConcessionApplication()` change the return to:

```ts
  return acts.includes("fish_farming_lakes") || acts.includes("recreation_activities") || acts.includes("port_construction") || acts.includes("gaz_extraction");
```

- [ ] **Step 2: `lib/assessment-report-utils.ts`** — three edits:

(a) Add to the `pureConcessionActivities` set (~L180):

```ts
    const pureConcessionActivities = new Set([
      "fish_farming_lakes",
      "recreation_activities",
      "port_construction",
      "gaz_extraction",
    ]);
```

(b) Legacy `water_purpose` fallback (~L197):

```ts
  if (waterPurpose === 'fish_farming_lakes' || waterPurpose === 'recreation_activities' || waterPurpose === 'port_construction' || waterPurpose === 'gaz_extraction') {
    return 'concession';
  }
```

(c) Label map (~L269): `gaz_extraction: "Gaz Extraction",` → `gaz_extraction: "Gas Extraction",`

- [ ] **Step 3: `app/api/modifications/propagate-approved-values/route.ts`** — in the local `isConcessionApplication` (~L119):

```ts
  return activities.includes('fish_farming_lakes') || activities.includes('recreation_activities') || activities.includes('port_construction') || activities.includes('gaz_extraction')
```

- [ ] **Step 4: `app/permit/view/[...permitNumber]/page.tsx`** (~L270):

```ts
  const concessionPurposeHints = new Set(["fish_farming_lakes", "recreation", "recreation_activities", "port_construction", "gaz_extraction"]);
```

- [ ] **Step 5: `hooks/useWaterUseReports.ts`** — `getReportTemplate`'s `concessionActivities` array (~L225) contains alias values (`'gas_extraction'`, `'port'`) that never match real `intended_activities` codes. Add the real codes (keep existing entries):

```ts
  const concessionActivities = [
    'recreation',
    'fish_farming_lakes',
    'gas_extraction',
    'gaz_extraction',
    'port',
    'port_construction',
    'recreation_activities',
  ]
```

- [ ] **Step 6: Verify** — Run: `npx tsc --noEmit` → no errors. Run: `grep -rn "gaz_extraction" lib/permit-variant.ts lib/assessment-report-utils.ts app/api/modifications/propagate-approved-values/route.ts "app/permit/view/[...permitNumber]/page.tsx" hooks/useWaterUseReports.ts` → each file shows the new entries.

- [ ] **Step 7: Commit**

```bash
git add lib/permit-variant.ts lib/assessment-report-utils.ts app/api/modifications/propagate-approved-values/route.ts "app/permit/view/[...permitNumber]/page.tsx" hooks/useWaterUseReports.ts
git commit -m "[GAS] feat: classify gaz_extraction as concession in all decision sites"
```

---

### Task 2: Category maps + persistence — `lib/application-utils.ts`, `lib/db/application-enum-sanitizer.ts`

**Files:**
- Modify: `lib/application-utils.ts:119,240-241,301,558-561`
- Modify: `lib/db/application-enum-sanitizer.ts:103`

**Interfaces:**
- Consumes: field names from Global Constraints.
- Produces: `internal_notes` round-trips the 4 gas detail keys; `concession_area` (ha) derived from `gazExtractionConcessionAreaM2`; `application_type` = `commercial`.

- [ ] **Step 1:** `lib/application-utils.ts` L119 (inside `formatApplicationTypeForDB`'s `typeMap`): `'gaz_extraction': 'industrial',` → `'gaz_extraction': 'commercial',`

- [ ] **Step 2:** `lib/application-utils.ts` ~L301 (second map, `applicationTypeMap` in `mapFormDataToApplication`): `'gaz_extraction': 'industrial',` → `'gaz_extraction': 'commercial',`

- [ ] **Step 3:** `lib/application-utils.ts` area-from-m² fallback — directly after the `portConstructionM2` lines (~L240-241):

```ts
    const gazExtractionM2 = parsePositiveNumber(formData.gazExtractionConcessionAreaM2);
    if (gazExtractionM2) return Number((gazExtractionM2 / 10000).toFixed(4));
```

- [ ] **Step 4:** `lib/application-utils.ts` `internal_notes` snapshot — directly after the Port construction block (~L558-561):

```ts
      // Gas extraction fields
      gazExtractionPurpose: formData.gazExtractionPurpose,
      gazExtractionDescription: formData.gazExtractionDescription,
      gazExtractionConcessionAreaM2: formData.gazExtractionConcessionAreaM2,
      gazExtractionWaterAmountM3PerDay: formData.gazExtractionWaterAmountM3PerDay,
```

- [ ] **Step 5:** `lib/db/application-enum-sanitizer.ts` ~L103 (aliases map): `gaz_extraction: 'industrial',` → `gaz_extraction: 'commercial',`

- [ ] **Step 6: Verify** — Run: `npx tsc --noEmit` → no errors. Run: `grep -n "gaz_extraction.*commercial\|gazExtraction" lib/application-utils.ts lib/db/application-enum-sanitizer.ts` → 2 commercial mappings + 4 snapshot keys + area branch present.

- [ ] **Step 7: Commit**

```bash
git add lib/application-utils.ts lib/db/application-enum-sanitizer.ts
git commit -m "[GAS] feat: commercial category, internal_notes snapshot, and concession-area derivation for gaz_extraction"
```

---

### Task 3: Form conversion — `components/dashboard/application-form-new.tsx`

**Files:**
- Modify: `components/dashboard/application-form-new.tsx` (all edits below; line numbers are pre-edit)

**Interfaces:**
- Consumes: field names from Global Constraints; snapshot keys from Task 2.
- Produces: the rendered "8. Gas Extraction Details" table + 3-layer validation; `gazExtractionRMBLicense` file ref consumed by Task 4's annex config.

- [ ] **Step 1: Zod schema — detail fields.** After `portConstructionDuration: z.string().optional(),` (~L325) add:

```ts
  // Gas Extraction details
  gazExtractionPurpose: z.string().optional(),
  gazExtractionDescription: z.string().optional(),
  gazExtractionConcessionAreaM2: optionalNumberField,
  gazExtractionWaterAmountM3PerDay: optionalNumberField,
```

- [ ] **Step 2: Zod schema — 4th document field.** After `gazExtractionFeasibilityStudy: z.any().optional(),` (~L423) add:

```ts
  gazExtractionRMBLicense: z.any().optional(),
```

- [ ] **Step 3: superRefine pure-concession array** (~L526):

```ts
  const pureConcessionActs = ["fish_farming_lakes", "recreation_activities", "port_construction", "gaz_extraction"];
```

- [ ] **Step 4: superRefine validation block.** After the `hasPortConstructionActivity` block's closing brace (~L698) add:

```ts
  const hasGazExtractionActivity = selectedActivities.includes("gaz_extraction");
  if (hasGazExtractionActivity) {
    if (!String(data.gazExtractionPurpose ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gazExtractionPurpose"],
        message: "Purpose of extraction is required."
      });
    }

    if (!String(data.gazExtractionDescription ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gazExtractionDescription"],
        message: "Brief description of the project is required."
      });
    }

    if (!isValidNumber(data.gazExtractionConcessionAreaM2) || data.gazExtractionConcessionAreaM2 <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gazExtractionConcessionAreaM2"],
        message: "Concession area (m²) must be a number greater than 0 for gas extraction."
      });
    }

    if (!isValidNumber(data.gazExtractionWaterAmountM3PerDay) || data.gazExtractionWaterAmountM3PerDay < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gazExtractionWaterAmountM3PerDay"],
        message: "Amount of water required (m³/day) must be a number (0 or more)."
      });
    }
  }
```

Note: `isValidNumber` is the same helper the Port block uses at ~L683; the water-amount check allows 0 (`< 0`, not `<= 0`).

- [ ] **Step 5: `fieldsToCompare` list.** After the `// Port construction` entries (~L883-886) add:

```ts
    // Gas extraction
    'gazExtractionPurpose',
    'gazExtractionDescription',
    'gazExtractionConcessionAreaM2',
    'gazExtractionWaterAmountM3PerDay',
```

- [ ] **Step 6: `FIELD_LABELS` map.** After `portConstructionDuration: ...` (~L1041) add:

```ts
  gazExtractionPurpose: 'Purpose of extraction',
  gazExtractionDescription: 'Brief description of the project',
  gazExtractionConcessionAreaM2: 'Concession area (m²)',
  gazExtractionWaterAmountM3PerDay: 'Amount of water required, if any (m³/day)',
```

- [ ] **Step 7: file-input ref.** After `gazExtractionFeasibilityStudy: useRef<HTMLInputElement>(null),` (~L1447) add:

```ts
    gazExtractionRMBLicense: useRef<HTMLInputElement>(null),
```

- [ ] **Step 8: `defaultValues`.** After `portConstructionDuration: "",` (~L1546) add:

```ts
      gazExtractionPurpose: "",
      gazExtractionDescription: "",
      gazExtractionConcessionAreaM2: undefined,
      gazExtractionWaterAmountM3PerDay: undefined,
```

- [ ] **Step 9: main pure-concession array + activity flag** (~L1791, ~L1798):

```ts
  const pureConcessionActivities = ["fish_farming_lakes", "recreation_activities", "port_construction", "gaz_extraction"];
```

and after `const isPortConstruction = ...` add:

```ts
  const isGazExtraction = watchedIntendedActivities?.includes("gaz_extraction") ?? false;
```

- [ ] **Step 10: Lake lock effect.** Replace the Port lake-lock effect (~L1829-1834) with:

```ts
  // Port construction and gas extraction are always lake-based: lock waterSourceType to lake.
  useEffect(() => {
    if (!readOnly && (isPortConstruction || isGazExtraction) && form.getValues("waterSourceType") !== "lake") {
      form.setValue("waterSourceType", "lake", { shouldDirty: false });
    }
  }, [isPortConstruction, isGazExtraction]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 11: `validateIntendedActivityTab` — concession array + details flag** (~L2012, ~L2019):

```ts
    const pureConcessionActs = ['fish_farming_lakes', 'recreation_activities', 'port_construction', 'gaz_extraction'];
```

and after `const requiresPortConstructionDetails = ...`:

```ts
    const requiresGazExtractionDetails = intended.includes('gaz_extraction');
```

- [ ] **Step 12: submit-time validation block.** After the `requiresPortConstructionDetails` block's closing brace (~L2230) add:

```ts
    if (requiresGazExtractionDetails) {
      const gazExtractionPurpose = String(form.getValues('gazExtractionPurpose') ?? '').trim();
      const gazExtractionDescription = String(form.getValues('gazExtractionDescription') ?? '').trim();
      const gazExtractionConcessionAreaM2 = form.getValues('gazExtractionConcessionAreaM2');
      const gazExtractionWaterAmountM3PerDay = form.getValues('gazExtractionWaterAmountM3PerDay');
      const validGazArea = typeof gazExtractionConcessionAreaM2 === 'number' && Number.isFinite(gazExtractionConcessionAreaM2) && gazExtractionConcessionAreaM2 > 0;
      const validGazWaterAmount = typeof gazExtractionWaterAmountM3PerDay === 'number' && Number.isFinite(gazExtractionWaterAmountM3PerDay) && gazExtractionWaterAmountM3PerDay >= 0;

      if (!gazExtractionPurpose) {
        form.setError('gazExtractionPurpose', { type: 'manual', message: 'Purpose of extraction is required.' });
      } else {
        form.clearErrors('gazExtractionPurpose');
      }

      if (!gazExtractionDescription) {
        form.setError('gazExtractionDescription', { type: 'manual', message: 'Brief description of the project is required.' });
      } else {
        form.clearErrors('gazExtractionDescription');
      }

      if (!validGazArea) {
        form.setError('gazExtractionConcessionAreaM2', { type: 'manual', message: 'Concession area (m²) must be a number greater than 0.' });
      } else {
        form.clearErrors('gazExtractionConcessionAreaM2');
      }

      if (!validGazWaterAmount) {
        form.setError('gazExtractionWaterAmountM3PerDay', { type: 'manual', message: 'Amount of water required (m³/day) must be a number (enter 0 if none).' });
      } else {
        form.clearErrors('gazExtractionWaterAmountM3PerDay');
      }

      if (!gazExtractionPurpose || !gazExtractionDescription || !validGazArea || !validGazWaterAmount) {
        setValidationError("Please fill in all Gas Extraction Details before proceeding.");
        return false;
      }
    }
```

- [ ] **Step 13: Next-button completeness check.** In `case "intended-activity":` after the `portConstructionDuration` watch line (~L2556) add:

```ts
        const gazExtractionPurpose = String(form.watch('gazExtractionPurpose') || form.getValues('gazExtractionPurpose') || '').trim();
        const gazExtractionDescription = String(form.watch('gazExtractionDescription') || form.getValues('gazExtractionDescription') || '').trim();
        const gazExtractionConcessionAreaM2 = form.watch('gazExtractionConcessionAreaM2') ?? form.getValues('gazExtractionConcessionAreaM2');
        const gazExtractionWaterAmountM3PerDay = form.watch('gazExtractionWaterAmountM3PerDay') ?? form.getValues('gazExtractionWaterAmountM3PerDay');
```

Then in the same case: update the array (~L2671):

```ts
        const pureConcessionActs = ['fish_farming_lakes', 'recreation_activities', 'port_construction', 'gaz_extraction'];
```

After the `hasPortConstructionDetails` const (~L2698-2705) add:

```ts
          const hasGazExtractionActivity = intendedActivities.includes('gaz_extraction');
          const hasGazExtractionDetails =
            !hasGazExtractionActivity ||
            (gazExtractionPurpose !== '' &&
              gazExtractionDescription !== '' &&
              typeof gazExtractionConcessionAreaM2 === 'number' &&
              Number.isFinite(gazExtractionConcessionAreaM2) &&
              gazExtractionConcessionAreaM2 > 0 &&
              typeof gazExtractionWaterAmountM3PerDay === 'number' &&
              Number.isFinite(gazExtractionWaterAmountM3PerDay) &&
              gazExtractionWaterAmountM3PerDay >= 0);
```

And extend the return (~L2706):

```ts
          return !hasRequiredDocs || !hasValidPolygons || !hasRecreationDetails || !hasPortConstructionDetails || !hasGazExtractionDetails;
```

- [ ] **Step 14: Water source select — locked Lake option.** At ~L4260 change:

```tsx
                              ) : isPortConstruction ? (
```

to:

```tsx
                              ) : (isPortConstruction || isGazExtraction) ? (
```

- [ ] **Step 15: "Name of the lake" label.** At ~L4304 change:

```tsx
                          {isPortConstruction ? tx("11. Name of the lake *") : isGroundwater ? tx("11. Name of the borehole *") : tx("11. Name of the source of water *")}
```

to:

```tsx
                          {(isPortConstruction || isGazExtraction) ? tx("11. Name of the lake *") : isGroundwater ? tx("11. Name of the borehole *") : tx("11. Name of the source of water *")}
```

- [ ] **Step 16: Activity radio label** (~L4643): `{ value: "gaz_extraction", label: tx("Gaz extraction") },` → `{ value: "gaz_extraction", label: tx("Gas Extraction") },`

- [ ] **Step 17: Details block.** Replace the existing Gaz extraction block (~L6548-6559, currently attachments-only with heading "Gaz Extraction Details") with the table version. Keep the same outer condition and the attachments/additional-docs calls at the bottom:

```tsx
                      {/* Gas Extraction Details */}
                      {watchedIntendedActivities?.includes("gaz_extraction") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            8. Gas Extraction Details
                          </h4>

                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Purpose of extraction <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="gazExtractionPurpose"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseInput
                                            {...field}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            placeholder="Purpose of extraction"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the project <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="gazExtractionDescription"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseTextarea
                                            {...field}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            placeholder="Describe the gas extraction project..."
                                            className={`border-0 bg-transparent min-h-[120px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Concession area (m²) <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="gazExtractionConcessionAreaM2"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseInput
                                            {...field}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Enter concession area in m²"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Amount of water required, if any (m³/day) <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="gazExtractionWaterAmountM3PerDay"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseInput
                                            {...field}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Enter 0 if no water abstraction is required"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("gaz_extraction")}

                          <AdditionalDocumentsSection category="gaz_extraction" activityType="gaz_extraction" />
                        </div>
                      )}
```

- [ ] **Step 18: Verify** — Run: `npx tsc --noEmit` → no errors. Run: `grep -c "gazExtraction" components/dashboard/application-form-new.tsx` → substantially increased (expect ~45+). Run: `grep -n "pureConcession" components/dashboard/application-form-new.tsx` → every array occurrence includes `gaz_extraction` (4 occurrences).

- [ ] **Step 19: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "[GAS] feat: Gas Extraction concession form - locked category, lake source, details table, validation"
```

---

### Task 4: Annex 4th document + documentTypes maps (both save paths)

**Files:**
- Modify: `lib/annex-requirements.ts:175-184`
- Modify: `app/dashboard/new-application/page.tsx:203-205`
- Modify: `app/dashboard/edit-application/[id]/page.tsx:344-346`

**Interfaces:**
- Consumes: `gazExtractionRMBLicense` ref/schema from Task 3.
- Produces: the 4-doc requirement enforced by `checkRequiredDocuments()`; uploads persisted in both save paths.

- [ ] **Step 1: `lib/annex-requirements.ts`** — replace the existing case (~L176-183):

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

(Old title was "ANNEX J (Only for gaz extraction)"; old labels "Environmental Impact Assessment certificate" / "Feasibility study" are updated to the doc wording. Keep the surrounding comment line `// Annex J (Gaz extraction)` updated to `// Annex (Gas Extraction)`.)

- [ ] **Step 2: `app/dashboard/new-application/page.tsx`** — in the documentTypes map after `gazExtractionFeasibilityStudy: 'other',` (~L205) add:

```ts
      gazExtractionRMBLicense: 'other',
```

- [ ] **Step 3: `app/dashboard/edit-application/[id]/page.tsx`** — same addition after ~L346:

```ts
      gazExtractionRMBLicense: 'other',
```

- [ ] **Step 4: Verify** — Run: `npx tsc --noEmit` → no errors. Run: `grep -n "gazExtractionRMBLicense" lib/annex-requirements.ts app/dashboard/new-application/page.tsx "app/dashboard/edit-application/[id]/page.tsx" components/dashboard/application-form-new.tsx` → present in all 4 files (annex case, both documentTypes maps, form schema/ref).

- [ ] **Step 5: Commit**

```bash
git add lib/annex-requirements.ts app/dashboard/new-application/page.tsx "app/dashboard/edit-application/[id]/page.tsx"
git commit -m "[GAS] feat: add RMB recommendation/license annex doc; align annex title and labels"
```

---

### Task 5: Pipeline-page parity + remaining label renames

**Files:**
- Modify: `app/approver/application/[id]/page.tsx:196,519-520`
- Modify: `app/review/application/[id]/page.tsx:594-595`
- Modify: `app/verification/application/[id]/page.tsx:459-460`
- Modify: `app/assessment/application/[id]/page.tsx:395`
- Modify: `app/inspection/application/[id]/page.tsx:243`
- Modify: `app/dashboard/edit-application/[id]/page.tsx:217`
- Modify: `app/permit/view/[...permitNumber]/page.tsx:324-325`
- Modify: `components/dashboard/permit-renewal-form.tsx:126,152`
- Modify: `components/dashboard/permit-transfer-form.tsx:497,1596`
- Modify: `app/dashboard/new-application/page.tsx:1133,1258`
- Modify: `lib/document-overrides.ts:73`
- Modify: `lib/pdf-generator.ts:316`
- Modify: `lib/permit/permit-text-data.ts:197`
- Modify: `messages/rw.json:38,946`

**Interfaces:**
- Consumes: `gazExtractionConcessionAreaM2` snapshot key from Task 2.
- Produces: concession-area display and concession handling on every staff/pipeline page; "Gas Extraction" label everywhere.

- [ ] **Step 1: gazM2 area fallback ×4.** In `app/approver/application/[id]/page.tsx` (~L519-520), `app/review/application/[id]/page.tsx` (~L594-595), `app/verification/application/[id]/page.tsx` (~L459-460), directly after the two `portM2` lines in each, add:

```ts
            const gazM2 = Number(formData.gazExtractionConcessionAreaM2);
            if (Number.isFinite(gazM2) && gazM2 > 0) return Number((gazM2 / 10000).toFixed(4));
```

(Match each site's exact indentation.) In `app/permit/view/[...permitNumber]/page.tsx` (~L324-325) after the `portConstructionM2` lines add:

```ts
    const gazExtractionM2 = parsePositiveNumber(internalNotes?.gazExtractionConcessionAreaM2);
    if (gazExtractionM2) return `${(gazExtractionM2 / 10000).toLocaleString()} ha`;
```

- [ ] **Step 2: `purposeToActivity` maps ×4.** In `app/approver/application/[id]/page.tsx` (~L196), `app/assessment/application/[id]/page.tsx` (~L395), `app/inspection/application/[id]/page.tsx` (~L243), `app/dashboard/edit-application/[id]/page.tsx` (~L217): add to each map (next to the `'port_construction': 'port_construction'` entry, matching that file's formatting):

```ts
      'gaz_extraction': 'gaz_extraction',
```

- [ ] **Step 3: Renewal form** `components/dashboard/permit-renewal-form.tsx`:

(a) `INTENDED_ACTIVITY_OPTIONS` (~L126), after the Port Construction entry:

```ts
  { value: "gaz_extraction", label: "Gas Extraction" },
```

(b) `CONCESSION_ACTIVITIES` (~L152):

```ts
const CONCESSION_ACTIVITIES = ["fish_farming_lakes", "recreation_activities", "aquaculture", "port_construction", "gaz_extraction"];
```

- [ ] **Step 4: Transfer form** `components/dashboard/permit-transfer-form.tsx`:

(a) `CONCESSION_PURPOSES` (~L497):

```ts
  const CONCESSION_PURPOSES = ["fish_farming_lakes", "recreation_activities", "port_construction", "gaz_extraction"];
```

(b) Label (~L1596): `<SelectItem value="gaz_extraction">{tx("Gaz Extraction")}</SelectItem>` → `<SelectItem value="gaz_extraction">{tx("Gas Extraction")}</SelectItem>`

- [ ] **Step 5: Transfer-creation concession lists** in `app/dashboard/new-application/page.tsx` (~L1133 and ~L1258):

```ts
      const pureConcessionPurposes = ["fish_farming_lakes", "recreation_activities", "port_construction", "gaz_extraction"];
```

and

```ts
      const draftPureConcessionPurposes = ["fish_farming_lakes", "recreation_activities", "port_construction", "gaz_extraction"];
```

- [ ] **Step 6: Label renames.**
  - `lib/document-overrides.ts` ~L73: `{ value: "gaz_extraction", label: "Gaz extraction" },` → `{ value: "gaz_extraction", label: "Gas Extraction" },`
  - `lib/pdf-generator.ts` ~L316: `gaz_extraction: "Gaz Extraction",` → `gaz_extraction: "Gas Extraction",`
  - `lib/permit/permit-text-data.ts` ~L197: `gaz_extraction: "Gaz Extraction",` → `gaz_extraction: "Gas Extraction",` (keep the rest of that line's other entries untouched; RW label at ~L571 stays "byo gucukura gaze")

- [ ] **Step 7: Kinyarwanda i18n.** In `messages/rw.json`, next to the existing entries (keep them for legacy strings):
  - Beside `"Gaz extraction": "Kwakira gaze",` (~L38) add: `"Gas Extraction": "Kwakira gaze",`
  - Beside `"Gaz Extraction": "Kwakira Gaze",` (~L946) add (only if not already added in that section): `"Gas Extraction": "Kwakira Gaze",`

  Note: each JSON section must not end up with duplicate `"Gas Extraction"` keys within the same object — check each section after editing (`python3 -c "import json;json.load(open('messages/rw.json'))"` must pass).

- [ ] **Step 8: Verify** — Run: `npx tsc --noEmit` → no errors. Run: `grep -rn "Gaz extraction\|Gaz Extraction" app lib components hooks --include="*.ts" --include="*.tsx"` → remaining hits only where intentionally kept (none expected in display maps). Run: `python3 -c "import json;json.load(open('messages/rw.json'))"` → no error.

- [ ] **Step 9: Commit**

```bash
git add app/approver "app/review/application/[id]/page.tsx" "app/verification/application/[id]/page.tsx" "app/assessment/application/[id]/page.tsx" "app/inspection/application/[id]/page.tsx" "app/dashboard/edit-application/[id]/page.tsx" "app/permit/view/[...permitNumber]/page.tsx" app/dashboard/new-application/page.tsx components/dashboard/permit-renewal-form.tsx components/dashboard/permit-transfer-form.tsx lib/document-overrides.ts lib/pdf-generator.ts lib/permit/permit-text-data.ts messages/rw.json
git commit -m "[GAS] feat: pipeline-page parity, renewal/transfer concession handling, Gas Extraction label rename"
```

---

### Task 6: Full verification sweep, build, push

**Files:**
- No new modifications expected (fixes only if the sweep finds gaps).

- [ ] **Step 1: Concession-list sweep.** Run:

```bash
grep -rn "fish_farming_lakes.*recreation_activities" app lib components hooks --include="*.ts" --include="*.tsx" | grep -v "gaz_extraction"
```

Expected: only hits that are genuinely not concession-decision lists (inspect each remaining hit; any list that contains `port_construction` but not `gaz_extraction` is a MISS — fix it by adding `gaz_extraction`).

- [ ] **Step 2: Port-parity sweep.** Run:

```bash
grep -rln "portConstructionConcessionAreaM2" app lib components --include="*.ts" --include="*.tsx" | xargs grep -Ln "gazExtractionConcessionAreaM2"
```

Expected: no output (every file that handles the Port area also handles the gas area). Fix any file listed.

- [ ] **Step 3: Build (MANDATORY).** Run: `npm run build`
Expected: compiles with zero errors, all pages generated. If it fails, fix and re-run until green.

- [ ] **Step 4: Diff review.** Run: `git log --oneline chore/stage-unstaged-2026-03-01-uat ^origin/chore/stage-unstaged-2026-03-01-uat` and `git diff origin/chore/stage-unstaged-2026-03-01-uat --stat` — confirm only intended files changed and every commit has the `[GAS]` prefix (plus the docs commits).

- [ ] **Step 5: Push to UAT only.**

```bash
git push origin chore/stage-unstaged-2026-03-01-uat
```

(Do NOT touch the prod branch — cherry-pick to prod happens later on user instruction.)

- [ ] **Step 6: Commit any sweep fixes** (if Steps 1-2 found gaps, they were fixed and committed before Step 3's build):

```bash
git add -A && git commit -m "[GAS] fix: close gaps found in concession-list parity sweep"
```

---

## Manual test checklist (post-deploy on staging)

1. New application → select "Gas Extraction" → category shows Concession (locked), source locked to Lake, label "11. Name of the lake *", polygon map appears.
2. Details table renders as item 8 with 4 rows; water amount accepts 0.
3. Annex shows 4 required docs including "Recommendation/License from RMB".
4. Submit blocked until: 4 details valid, ≥4-point polygon, 4 docs uploaded.
5. Submit → Edit → everything restores including the RMB document.
6. Review/assessment pages render details read-only.
7. Walk to approval: terms page, permit preview, issued permit, and contract all use the CONCESSION template (concession area + lake wording), not abstraction. Public PDF route too.
8. DB row: `application_type='commercial'`, `internal_notes` has the 4 gas keys, `concession_area` in hectares.
