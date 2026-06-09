# Groundwater Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Groundwater abstraction branch (per the Revised Groundwater Application Form + Groundwater Assessment Report docx) so that selecting Groundwater for an eligible activity adapts the application form, assessment report, and permit/contract output — leaving the surface-water path untouched.

**Architecture:** A single persisted form field `methodOfWaterAbstraction: 'surface_water' | 'groundwater'` (stored in `internal_notes`, same place `waterAbstractionDetails` already lives) is the one source of truth. Every downstream surface (assessment report, assessor recommendations, contract/permit text) reads it. No conditional-approval workflow. Surface-water rendering is gated behind `method !== 'groundwater'` and remains byte-for-byte the same.

**Tech Stack:** Next.js (App Router, TypeScript), React Hook Form + Zod, Postgres via `lib/db/postgres.ts`, Supabase storage for uploads. No unit-test framework exists; `next.config` sets `typescript.ignoreBuildErrors: true`. **Verification is therefore: `npx tsc --noEmit` (scoped — pre-existing errors exist elsewhere, only assert no NEW errors in touched files), `npm run build`, and manual/Playwright UI checks against `npm run dev`.**

**Spec:** `docs/superpowers/specs/2026-06-09-groundwater-support-design.md`

**Reference docx (outside repo):** `~/Downloads/Revised_GROUNDWATER APPLICATION FORM.docx`, `~/Downloads/GROUNDWATER ASSESSMENT REPORT.docx`

**Groundwater-eligible activity keys:** `coffee_washing`, `fish_farming_ponds`, `industry`, `irrigation`, `livestock`, `mining`, `water_supply`.

---

## Conventions for this plan

- "Eligible activity" = one of the 7 keys above.
- "Groundwater branch" = the selected activity is eligible AND `methodOfWaterAbstraction === 'groundwater'`.
- Verification command for typecheck: `npx tsc --noEmit 2>&1 | grep -E "<file you touched>"` — expected: no lines (no new errors in your file). The full command will print pre-existing errors in OTHER files; that is expected and acceptable.
- Commit after each task with a `feat:`/`refactor:` message.

---

## Phase 0 — Branch setup

### Task 0: Create the feature branch

**Files:** none (git only)

- [ ] **Step 1: Confirm clean-ish starting point**

Run: `git status --short`
Expected: only the untracked `docs/superpowers/specs/2026-06-09-groundwater-support-design.md` and this plan (plus any pre-existing untracked `.superpowers/` artifacts). Do NOT proceed if there are unrelated staged changes.

- [ ] **Step 2: Branch off the current prod working branch**

```bash
git checkout -b feature/groundwater-support
```

- [ ] **Step 3: Commit the spec + plan**

```bash
git add docs/superpowers/specs/2026-06-09-groundwater-support-design.md docs/superpowers/plans/2026-06-09-groundwater-support.md
git commit -m "docs: groundwater support spec and implementation plan"
```

---

## Phase 1 — Foundation: the `methodOfWaterAbstraction` field

This field must exist in the form schema, default sensibly, persist to `internal_notes`, and round-trip on load (edit/view).

### Task 1: Add `methodOfWaterAbstraction` to the form schema + defaults

**Files:**
- Modify: `components/dashboard/application-form-new.tsx`

- [ ] **Step 1: Add the field to the Zod schema**

Near the Intended Activity section of the schema (around `intendedActivities`, line ~224), add:

```ts
// Groundwater support: surface-water vs groundwater branch for eligible activities.
methodOfWaterAbstraction: z.enum(["surface_water", "groundwater"]).optional(),
```

- [ ] **Step 2: Add it to the form `defaultValues`**

In the `defaultValues` object (the block around lines 1400–1420 that includes `tributaryToMain: ""`), add:

```ts
methodOfWaterAbstraction: undefined,
```

Also add the same key to the secondary reset/default object near line ~2647 (the one that also sets `tributaryToMain: ""`) so resets stay consistent.

- [ ] **Step 3: Define the eligibility + branch helpers**

Near the existing derived values (around `effectiveWaterUseCategory`, line ~1678), add:

```ts
const GROUNDWATER_ELIGIBLE_ACTIVITIES = [
  "coffee_washing", "fish_farming_ponds", "industry",
  "irrigation", "livestock", "mining", "water_supply",
] as const;
const selectedActivity = watchedIntendedActivities?.[0];
const isGroundwaterEligible = !!selectedActivity && GROUNDWATER_ELIGIBLE_ACTIVITIES.includes(selectedActivity as any);
const watchedMethod = form.watch("methodOfWaterAbstraction");
const isGroundwater = isGroundwaterEligible && watchedMethod === "groundwater";
```

(If `watchedIntendedActivities` / `form.watch` names differ, match the existing watch pattern already used in the file.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "application-form-new"`
Expected: no output (no new errors in this file).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "feat(form): add methodOfWaterAbstraction field + groundwater helpers"
```

### Task 2: Persist + round-trip the field

**Files:**
- Modify: `lib/application-utils.ts`
- Modify: `components/dashboard/application-form-new.tsx` (load mapping, if a load mapper exists)

- [ ] **Step 1: Verify how form data reaches `internal_notes`**

Run: `grep -nE "internal_notes|JSON.stringify|waterAbstractionDetails" lib/application-utils.ts`
The contract layer reads `notes.waterAbstractionDetails` and `notes.intendedActivities`, so the full form payload is serialized into `internal_notes`. Confirm the serialization includes the whole `formData` (or an explicit field list). 

- [ ] **Step 2: Ensure the new field is included**

If `internal_notes` is built from an explicit field allow-list, add `methodOfWaterAbstraction: formData.methodOfWaterAbstraction` to it. If it serializes the entire `formData` object, no change is needed — note that in the commit message.

- [ ] **Step 3: Ensure load mapping restores it**

Run: `grep -nE "methodOfWaterAbstraction|tributaryToMain|nameSourceWater" components/dashboard/application-form-new.tsx | grep -iE "reset|map|load|initial"`
Wherever existing fields like `tributaryToMain` are mapped from a loaded application back into the form (edit/view), add `methodOfWaterAbstraction: loaded?.methodOfWaterAbstraction ?? loaded?.internal_notes?.methodOfWaterAbstraction`. Match the exact loader shape used by neighboring fields.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "application-utils|application-form-new"`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/application-utils.ts components/dashboard/application-form-new.tsx
git commit -m "feat(form): persist and restore methodOfWaterAbstraction"
```

---

## Phase 2 — Application form UI (groundwater branch)

### Task 3: The "Method of Water Abstraction" radio + hide-below gating

**Files:**
- Modify: `components/dashboard/application-form-new.tsx`

- [ ] **Step 1: Render the radio directly under the activity (item 7)**

Immediately after the Intended Activity radio block (after line ~4449, before the Water Use Category block at ~4451), add a radio shown only when `isGroundwaterEligible`:

```tsx
{isGroundwaterEligible && (
  <FormField
    control={form.control}
    name="methodOfWaterAbstraction"
    render={({ field }) => (
      <FormItem className="space-y-2">
        <FormLabel className="text-base font-medium">
          {tx("Method of Water Abstraction *")}
        </FormLabel>
        <RadioGroup
          onValueChange={readOnly ? undefined : field.onChange}
          value={field.value || ""}
          className="flex flex-col gap-2"
          disabled={readOnly}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="surface_water" id="moa-surface" />
            <Label htmlFor="moa-surface" className="cursor-pointer">{tx("Surface Water")}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="groundwater" id="moa-ground" />
            <Label htmlFor="moa-ground" className="cursor-pointer">{tx("Groundwater")}</Label>
          </div>
        </RadioGroup>
        <FormMessage />
      </FormItem>
    )}
  />
)}
```

- [ ] **Step 2: Gate everything below until a method is chosen**

Wrap the existing Water Use Category + Water Abstraction Point blocks (and require the source/annex sections on later tabs to behave the same) so that **when `isGroundwaterEligible && !watchedMethod`, the dependent content is hidden.** Add the guard `(!isGroundwaterEligible || !!watchedMethod) && (...)` to the existing render conditions for: the Water Use Category block (~4452), the Water Abstraction Point block (~4471). For the Source of Water tab content (Task 5) add the same guard at its container.

- [ ] **Step 3: Make the radio required**

Find the activity-tab validation (around lines 1890–1900 / 2050–2080 where `intendedActivityOther` and abstraction validation live). Add:

```ts
if (isGroundwaterEligible && !form.getValues("methodOfWaterAbstraction")) {
  // reuse the existing per-tab error mechanism (setValidationError / form.setError)
  setValidationError("Method of Water Abstraction is required.");
  hasMissingActivityFields = true;
}
```

Match the exact error-surfacing pattern used by the neighboring required checks.

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc --noEmit 2>&1 | grep "application-form-new"` → no new errors.
Run `npm run dev`, open a new application, pick Coffee Washing → confirm the radio appears, content below is hidden until a choice is made, and you cannot advance without choosing.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "feat(form): method-of-abstraction radio with required + hide-below gating"
```

### Task 4: Groundwater relabels — category badge, item 8, section 9

**Files:**
- Modify: `components/dashboard/application-form-new.tsx`

- [ ] **Step 1: Water Use Category badge shows "Groundwater"**

In the Water Use Category block (~4451–4468), when `isGroundwater`, render the badge text as `tx("Groundwater")` (and use a distinct color class, e.g. the existing blue used for abstraction). Keep `effectiveWaterUseCategory` internally `abstraction` so the abstraction-point UI still renders. Concretely, change the badge label expression to:

```tsx
{isGroundwater ? tx("Groundwater") : (effectiveWaterUseCategory === "concession" ? tx("Concession") : tx("Abstraction"))}
```

- [ ] **Step 2: Item 8 label → "8. Coordinates" for groundwater**

At the abstraction-point label (line ~4474, currently `{tx("8. Water Abstraction Point * (LAT, LONG)")}`), change to:

```tsx
{isGroundwater ? tx("8. Coordinates *") : tx("8. Water Abstraction Point * (LAT, LONG)")}
```

- [ ] **Step 3: Section 9 — rename Flow Rate → Pumping Rate (m³/day) for groundwater**

At the Flow Rate field (lines ~6205–6217): change the `<FormLabel>` and placeholder conditionally:

```tsx
<FormLabel>{isGroundwater ? "Pumping Rate (m³/day)" : "Flow Rate (m³/s)"}</FormLabel>
// ...
placeholder={isGroundwater ? "Enter pumping rate (m³/day)" : "Enter flow rate (m³/s)"}
```

(The value still binds to `waterAbstractionDetails.0.flowRate`.)

- [ ] **Step 4: Section 9 — remove the "Method of Water Abstraction" dropdown for groundwater**

Wrap the existing `waterAbstractionDetails.0.abstractionMethod` `FormField` (lines ~6249–6278) so it only renders when `!isGroundwater`:

```tsx
{!isGroundwater && (
  <FormField ... abstractionMethod ... />
)}
```

- [ ] **Step 5: Keep "Maximum Average Yearly (m³/year)" unchanged** (no edit — verify it still renders for groundwater).

- [ ] **Step 6: Typecheck + manual check**

Run: `npx tsc --noEmit 2>&1 | grep "application-form-new"` → no new errors.
Manual: with Groundwater chosen, badge reads "Groundwater", item 8 reads "Coordinates", section 9 shows "Pumping Rate (m³/day)" with no method dropdown, Max Avg Yearly still present.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "feat(form): groundwater relabels (category badge, coordinates, pumping rate)"
```

### Task 5: Source of Water — borehole only, name-of-borehole, hide tributary

**Files:**
- Modify: `components/dashboard/application-form-new.tsx`

- [ ] **Step 1: Item 10 — lock source to Borehole for groundwater**

In the `waterSourceType` Select (lines ~4044–4080): when `isGroundwater`, render only the Borehole `SelectItem` and default the value to `borehole`. Concretely, conditionally render the option list:

```tsx
<SelectContent>
  {isGroundwater ? (
    <SelectItem value="borehole">{tx("Borehole")}</SelectItem>
  ) : (
    <>
      <SelectItem value="lake">{tx("Lake")}</SelectItem>
      <SelectItem value="dam">{tx("Dam")}</SelectItem>
      <SelectItem value="spring">{tx("Spring")}</SelectItem>
      <SelectItem value="borehole">{tx("Borehole")}</SelectItem>
      <SelectItem value="stream_river">{tx("Stream/River")}</SelectItem>
      <SelectItem value="other">{tx("Other (specify)")}</SelectItem>
    </>
  )}
</SelectContent>
```

Add an effect near the other groundwater effects: when `isGroundwater` and `waterSourceType !== "borehole"`, `form.setValue("waterSourceType", "borehole")`.

- [ ] **Step 2: Item 11 — label "Name of the borehole" for groundwater**

At line ~4090 (`{tx("11. Name of the source of water *")}`), change to:

```tsx
{isGroundwater ? tx("11. Name of the borehole *") : tx("11. Name of the source of water *")}
```

- [ ] **Step 3: Item 12 — hide Tributary for groundwater**

Wrap the `tributaryToMain` `FormField` (lines ~4101–4118) with `{!isGroundwater && ( ... )}`.

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc --noEmit 2>&1 | grep "application-form-new"` → no new errors.
Manual: groundwater → source select offers only Borehole (and is pre-set), item 11 reads "Name of the borehole", Tributary row gone. Surface water → all options present, tributary present.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/application-form-new.tsx
git commit -m "feat(form): groundwater source = borehole only, name-of-borehole, hide tributary"
```

---

## Phase 3 — Annex: Geophysical Survey

### Task 6: Make annex requirements groundwater-aware

**Files:**
- Modify: `lib/annex-requirements.ts`
- Modify: `components/dashboard/application-form-new.tsx` (schema fields + file refs for the 3 new uploads)

- [ ] **Step 1: Extend the annex function signature**

In `lib/annex-requirements.ts`, change the context type and add an optional helper:

```ts
export function getAnnexRequirementForActivity(
  activity: string,
  ctx: { irrigationTotalArea?: number; isGroundwater?: boolean }
): AnnexRequirement {
  const irrigationArea = ctx.irrigationTotalArea ?? 0;
  const groundwater = ctx.isGroundwater === true;
  const req = (label: string, fieldName: string): AnnexRequiredAttachment => ({ label, fieldName, required: true });
  const opt = (label: string, fieldName: string): AnnexRequiredAttachment => ({ label, fieldName, required: false });
  // ...
```

- [ ] **Step 2: Relabel Hydrological → Geophysical for the 4 activities that have it**

For `fish_farming_ponds`, `coffee_washing`, `industry`, `mining`, change the hydrological-report attachment label conditionally. Example (coffee_washing):

```ts
groundwater
  ? req("Geophysical Survey", "coffeeWashingHydrologicalReport")
  : req("Hydrological report", "coffeeWashingHydrologicalReport"),
```

Apply the same pattern to `aquacultureHydrologicalReport` (fish_farming_ponds), `industrialHydrologicalReport` (industry), and `miningHydrologicalReport` (mining). Keep the same `fieldName` so existing upload plumbing is reused.

- [ ] **Step 3: Add a non-required Geophysical Survey upload for the 3 activities without one**

For `irrigation`, append when `groundwater`:

```ts
...(groundwater ? [opt("Geophysical Survey", "irrigationGeophysicalSurvey")] : []),
```

For `water_supply`: `...(groundwater ? [opt("Geophysical Survey", "waterSupplyGeophysicalSurvey")] : [])`.
For `livestock` (Annex K): `...(groundwater ? [opt("Geophysical Survey", "livestockGeophysicalSurvey")] : [])`.

- [ ] **Step 4: Register the 3 new upload fields in the form**

In `components/dashboard/application-form-new.tsx`:
- Add to the Zod schema (near line ~372 with the other `...HydrologicalReport: z.any().optional()`):
```ts
irrigationGeophysicalSurvey: z.any().optional(),
livestockGeophysicalSurvey: z.any().optional(),
waterSupplyGeophysicalSurvey: z.any().optional(),
```
- Add to `fileInputRefs` (near line ~1347):
```ts
irrigationGeophysicalSurvey: useRef<HTMLInputElement>(null),
livestockGeophysicalSurvey: useRef<HTMLInputElement>(null),
waterSupplyGeophysicalSurvey: useRef<HTMLInputElement>(null),
```

- [ ] **Step 5: Pass `isGroundwater` into the annex call**

Find the call site(s) of `getAnnexRequirementForActivity` / `getAnnexRequirementsForSelection` in the form (imported at line 54). Pass `isGroundwater` through the ctx. Update `getAnnexRequirementsForSelection` similarly if it wraps the per-activity call.

- [ ] **Step 6: Typecheck + manual check**

Run: `npx tsc --noEmit 2>&1 | grep -E "annex-requirements|application-form-new"` → no new errors.
Manual: Coffee + groundwater → annex shows "Geophysical Survey" (not Hydrological report). Irrigation + groundwater → an optional "Geophysical Survey" upload appears. Surface water → original labels and no extra upload.

- [ ] **Step 7: Commit**

```bash
git add lib/annex-requirements.ts components/dashboard/application-form-new.tsx
git commit -m "feat(annex): geophysical survey for groundwater (relabel + add for irrigation/livestock/water supply)"
```

---

## Phase 4 — Assessment report

### Task 7: Add `isGroundwater` to the assessment report form + remove Section 3

**Files:**
- Modify: `components/inspection/assessment-report-form.tsx`

- [ ] **Step 1: Add the prop**

In `AssessmentReportFormProps` (line ~71, where `isBulkApplication?: boolean` is), add:

```ts
isGroundwater?: boolean;
```

And in the destructured props (line ~106, next to `isBulkApplication = false`):

```ts
isGroundwater = false,
```

- [ ] **Step 2: Remove Section 3 "Amount of water to be abstracted" for groundwater**

The Section 3/4 block starts at line ~632: `{!isBulkApplication && (reportType === 'abstraction' ? ( <> {/* Amount of water to be abstracted */} <Card> ... 3. Amount of water to be abstracted ... </Card>`. Wrap ONLY the Section-3 `<Card>` so it renders when `!isGroundwater`:

```tsx
{!isGroundwater && (
  <Card>{/* 3. Amount of water to be abstracted */}...</Card>
)}
```

Leave Section 4 (Water balance assessment, line ~677) untouched — **it stays for groundwater** (docx).

- [ ] **Step 3: Renumber for groundwater**

With Section 3 hidden, the headings should read 3. Water balance assessment, 4. Planned wastewater, 5. Assessment Report Completion, 6. Assessor Recommendation. Use a conditional number expression mirroring the existing `isBulkApplication ? "x" : "y"` pattern. For each heading from Section 4 onward, compute the displayed number as `displayed = isGroundwater ? n-1 : n` (and keep the existing bulk branch). Concretely for the "Water balance assessment" title: `{isGroundwater ? "3" : "4"}. Water balance assessment`. For "Planned wastewater": `{isBulkApplication ? "?" : isGroundwater ? "4" : "5"}. ...`. For "Assessment Report Completion" (line ~846): `{isBulkApplication ? "3" : isGroundwater ? "5" : "6"}.`. For "Assessor Recommendation" (line ~884): `{isBulkApplication ? "4" : isGroundwater ? "6" : "7"}.`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "assessment-report-form"` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/inspection/assessment-report-form.tsx
git commit -m "feat(assessment): drop Section 3 + renumber for groundwater"
```

### Task 8: Pumping-rate row in AssessorRecommendations

**Files:**
- Modify: `components/inspection/assessor-recommendations.tsx`

- [ ] **Step 1: Add props**

In the props interface (near lines ~28–49), add:

```ts
// Groundwater pumping rate (m³/day)
isGroundwater?: boolean;
requestedPumpingRateM3Day?: number | null;
recommendedPumpingRateM3Day?: number | null;
onPumpingRateSave?: (value: number) => void | Promise<void>;
pumpingRateSaving?: boolean;
```

Destructure them with defaults next to `isBulk = false` (line ~68): `isGroundwater = false`, etc.

- [ ] **Step 2: Render a "Pumping rate (m³/day)" row**

Immediately after the Water Output Volume row block (the `{!isBulk && ( ... )}` block ending ~line 278), add a row that renders when `isGroundwater`. Mirror the duration/volume row markup (Requested read-only + Assessor Recommended editable input + Save button + dirty/saved indicator), using a `m³/day` formatter:

```tsx
{isGroundwater && (
  <div className="grid grid-cols-3 gap-4 items-center py-2 border-t">
    <Label className="text-sm font-medium">Pumping rate (m³/day)</Label>
    <div className="text-sm">{requestedPumpingRateM3Day != null ? `${requestedPumpingRateM3Day} m³/day` : "—"}</div>
    <div className="flex items-center gap-2">
      <Input
        type="number" step="0.01"
        defaultValue={recommendedPumpingRateM3Day != null ? String(recommendedPumpingRateM3Day) : ""}
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) onPumpingRateSave?.(v); }}
        disabled={readOnly}
        placeholder="m³/day"
      />
      {pumpingRateSaving && <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  </div>
)}
```

Match the exact styling/structure of the existing rows in this file (reuse their wrapper classes, save button, and dirty-state pattern rather than the simplified sketch above).

- [ ] **Step 3: Update the footer note**

The note (line ~281) says recommended values are used for the permit/terms. No change needed, but verify it reads correctly with the new row present.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "assessor-recommendations"` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/inspection/assessor-recommendations.tsx
git commit -m "feat(assessment): pumping rate row in AssessorRecommendations"
```

### Task 9: Wire pumping rate through assessment + approver pages and the adjustments API

**Files:**
- Modify: `app/api/staff/applications/[id]/assessor-adjustments/route.ts`
- Modify: `app/assessment/application/[id]/page.tsx`
- Modify: `app/approver/application/[id]/page.tsx`

- [ ] **Step 1: Extend the adjustments API**

In `assessor-adjustments/route.ts`, accept and persist `recommendedPumpingRateM3Day` into `internal_notes._assessorAdjustments` exactly the way `recommendedVolumeM3` is handled. Run `grep -nE "recommendedVolumeM3|_assessorAdjustments" app/api/staff/applications/[id]/assessor-adjustments/route.ts` first to mirror the existing read/merge/write.

- [ ] **Step 2: Assessment page — compute requested + recommended pumping rate and pass props**

In `app/assessment/application/[id]/page.tsx`:
- Add state `recommendedPumpingRateM3Day` mirroring `recommendedVolumeM3` (lines ~515–516 area).
- Source the **requested** pumping rate from the application's form data: `internal_notes.waterAbstractionDetails?.[0]?.flowRate` (this is the same field the form now labels "Pumping Rate (m³/day)" for groundwater).
- Detect groundwater: `const isGroundwater = internalNotes?.methodOfWaterAbstraction === "groundwater"`.
- Add an `onPumpingRateSave` handler that POSTs `{ recommendedPumpingRateM3Day }` to the adjustments API, mirroring the volume save (~line 1658).
- Pass `isGroundwater`, `requestedPumpingRateM3Day`, `recommendedPumpingRateM3Day`, `onPumpingRateSave`, `pumpingRateSaving` to `<AssessorRecommendations>`.
- Pass `isGroundwater` to `<AssessmentReportForm>` if rendered here.

- [ ] **Step 3: Required-before-approval validation**

Where the assessment page validates before allowing the assessor to submit a "recommend approval" (the same place duration/volume are resolved, ~lines 1950–1985), add: if `isGroundwater` and no recommended pumping rate (and no requested fallback), block submission with a clear message: "Recommended pumping rate (m³/day) is required for groundwater applications."

- [ ] **Step 4: Approver page — read-only display**

In `app/approver/application/[id]/page.tsx`, add the same `isGroundwater` + requested/recommended pumping rate wiring (read-only; approver views recommended values). Pass props to `<AssessorRecommendations>` (line ~1122).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -E "assessor-adjustments|assessment/application|approver/application"` → no new errors.
Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add "app/api/staff/applications/[id]/assessor-adjustments/route.ts" "app/assessment/application/[id]/page.tsx" "app/approver/application/[id]/page.tsx"
git commit -m "feat(assessment): wire pumping rate (requested/recommended) + required validation"
```

---

## Phase 5 — Permit & contract copy

### Task 10: Article 4 — "pumping rate" wording + value for groundwater

**Files:**
- Modify: `lib/contract-placeholders.ts`
- Verify: `lib/contract-terms.ts`, `lib/permit/permit-text-data.ts`

- [ ] **Step 1: Detect groundwater + resolve pumping-rate label**

In `lib/contract-placeholders.ts`, add a helper alongside `resolveVolumeLabel` (line ~462):

```ts
function isGroundwaterApplication(application: ApplicationForContract): boolean {
  const notes = getInternalNotes(application);
  return notes?.methodOfWaterAbstraction === "groundwater";
}

function resolvePumpingRateM3Day(application: ApplicationForContract): number | undefined {
  const notes = getInternalNotes(application);
  const rec = notes?._assessorAdjustments?.recommendedPumpingRateM3Day;
  if (typeof rec === "number" && Number.isFinite(rec) && rec > 0) return rec;
  const requested = notes?.waterAbstractionDetails?.[0]?.flowRate;
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) return requested;
  return undefined;
}
```

- [ ] **Step 2: For groundwater, drive VOLUME_LABEL from the pumping rate**

At the top of `resolveVolumeLabel`, before the existing flow-rate checks, add:

```ts
if (isGroundwaterApplication(application)) {
  const pr = resolvePumpingRateM3Day(application);
  if (pr !== undefined) return `${formatNumber(pr)} m³/day`;
}
```

- [ ] **Step 3: Change the wording "flow rate" → "pumping rate" for groundwater**

At the Article 4 string replacements (lines ~986–992), where `flow rate of ... {{VOLUME_LABEL}}` is substituted, branch on groundwater so the rendered text reads "with a pumping rate of <value> m³/day". Concretely, after computing `ctx.volumeLabel`, when groundwater is true also replace the literal word in the template:

```ts
if (ctx.isGroundwater) {
  s = s.replace(/flow rate of/gi, "pumping rate of");
}
```

Add `isGroundwater: isGroundwaterApplication(application)` to the context object (`ctx`) where `volumeLabel`/`systemTypeEnglish` are assembled (the placeholder-context builder, ~lines 420–500). Add `isGroundwater: boolean` to that context type (line ~32 area).

- [ ] **Step 4: Verify permit text + Kinyarwanda**

Run: `grep -nE "flow rate|VOLUME_LABEL|m3/day|pumping" lib/permit/permit-text-data.ts lib/contract-terms.ts`. If the permit PDF builds its abstraction sentence separately, apply the same groundwater wording/value swap there. Check the Kinyarwanda template line (~988) — apply an equivalent term swap if RWB wants it localized (confirm wording with user during review; default: leave Kinyarwanda as-is and only change English unless told otherwise).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -E "contract-placeholders|contract-terms|permit-text-data"` → no new errors.
Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/contract-placeholders.ts lib/contract-terms.ts lib/permit/permit-text-data.ts
git commit -m "feat(contract): groundwater Article 4 uses pumping rate (m³/day)"
```

---

## Phase 6 — End-to-end verification

### Task 11: Full groundwater path smoke test

**Files:** none (manual / Playwright)

- [ ] **Step 1: Build**

Run: `npm run build` → succeeds with no new errors.

- [ ] **Step 2: Groundwater happy path (Playwright or manual against `npm run dev`)**

1. New application → Coffee Washing → Method = Groundwater.
2. Confirm: badge "Groundwater", item 8 "Coordinates", section 9 "Pumping Rate (m³/day)" with no method dropdown, source locked to Borehole, item 11 "Name of the borehole", no Tributary, annex "Geophysical Survey".
3. Submit. As assessor: confirm assessment report has no Section 3, keeps Section 4 (Water balance), and AssessorRecommendations shows a required Pumping rate row prefilled with the requested value. Enter a recommended pumping rate, recommend approval.
4. Approve and generate the contract/permit. Confirm Article 4 reads "with a pumping rate of <recommended value> m³/day".

- [ ] **Step 3: Surface-water regression**

Repeat with Method = Surface Water for the same activity and confirm the form, assessment report (Section 3 present), and contract ("flow rate", m³/s/year) are unchanged from current behavior.

- [ ] **Step 4: Non-eligible activity regression**

Pick an activity NOT in the eligible list (e.g. recreation) and confirm no Method radio appears and nothing changed.

---

## Completion

After all tasks pass, use **superpowers:finishing-a-development-branch** to verify and present integration options (the project's branch rules: this is feature work off the prod branch — do NOT merge to prod without explicit user direction; cherry-pick/PR per the established waterpermit workflow).
