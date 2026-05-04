# Assessor Coordinate Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow assessors to revise abstraction LAT/LONG and concession polygon coordinates in the assessment report, persist them as assessor adjustments, and make permits, contracts, terms, modifications, renewals, and transfers use the revised effective coordinates.

**Architecture:** Extend the existing `internal_notes._assessorAdjustments` pattern and the existing row-locked `/api/staff/applications/[id]/assessor-adjustments` endpoint. The assessment report UI edits coordinates in Section 2, then document resolvers prefer assessor coordinates before original submitted values or geometry fallback.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL via `pg`, Supabase client, React components, existing PDF/contract placeholder helpers.

---

## File Structure

- Modify `app/api/staff/applications/[id]/assessor-adjustments/route.ts`: accept and validate coordinate patches, save them under `_assessorAdjustments`, and preserve row-lock behavior.
- Modify `components/inspection/assessment-report-form.tsx`: make Section 2 coordinates editable for editable assessments and emit save callbacks.
- Modify `app/assessment/application/[id]/page.tsx`: hydrate coordinates from `_assessorAdjustments`, wire the form save callbacks to the endpoint, patch local state, and refresh previews.
- Modify `lib/assessment-report-utils.ts`: prefill reports with assessor-adjusted coordinates when present.
- Modify `lib/pdf-generator.ts`, `lib/contract-placeholders.ts`, `lib/permit/permit-text-data.ts`, and `lib/document-overrides.ts`: prefer assessor-adjusted coordinates in document rendering and document editor base values.
- Modify `app/api/modifications/propagate-approved-values/route.ts`: propagate coordinate adjustments after approved modifications.
- Modify `app/api/test/permit-pdf/route.ts`: extend fixtures so manual PDF checks include assessor-adjusted coordinates.

## Task 1: Endpoint Validation And Persistence

**Files:**
- Modify: `app/api/staff/applications/[id]/assessor-adjustments/route.ts`

- [ ] **Step 1: Extend request types**

Add the coordinate point type and patch fields:

```ts
type CoordinatePointPatch = {
  latitude: number | string;
  longitude: number | string;
};

type AssessorAdjustmentsPatch = {
  permitLengthYears?: number;
  recommendedVolumeM3?: number;
  waterSourceLatitude?: number;
  waterSourceLongitude?: number;
  waterSourcePolygonPoints?: Array<{ latitude: number; longitude: number }>;
};
```

- [ ] **Step 2: Add coordinate parsing helpers**

Add helpers near `isPlainObject`:

```ts
function parseCoordinateNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(8));
}

function parseLatLngPair(rawLat: unknown, rawLng: unknown): { lat: number; lng: number } | { error: string } {
  const lat = parseCoordinateNumber(rawLat);
  const lng = parseCoordinateNumber(rawLng);
  if (lat == null || lng == null) return { error: "Latitude and longitude must both be valid numbers" };
  if (lat < -90 || lat > 90) return { error: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { error: "Longitude must be between -180 and 180" };
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
}
```

- [ ] **Step 3: Validate abstraction coordinate pair**

After volume validation, add:

```ts
const hasLat = body.waterSourceLatitude !== undefined;
const hasLng = body.waterSourceLongitude !== undefined;
if (hasLat || hasLng) {
  if (!hasLat || !hasLng) {
    return NextResponse.json(
      { success: false, message: "waterSourceLatitude and waterSourceLongitude must be saved together" },
      { status: 400 },
    );
  }
  const pair = parseLatLngPair(body.waterSourceLatitude, body.waterSourceLongitude);
  if ("error" in pair) {
    return NextResponse.json({ success: false, message: pair.error }, { status: 400 });
  }
  patch.waterSourceLatitude = pair.lat;
  patch.waterSourceLongitude = pair.lng;
}
```

- [ ] **Step 4: Validate concession polygon points**

Add:

```ts
if (body.waterSourcePolygonPoints !== undefined) {
  if (!Array.isArray(body.waterSourcePolygonPoints) || body.waterSourcePolygonPoints.length === 0) {
    return NextResponse.json(
      { success: false, message: "waterSourcePolygonPoints must contain at least one point" },
      { status: 400 },
    );
  }

  const points: Array<{ latitude: number; longitude: number }> = [];
  for (const rawPoint of body.waterSourcePolygonPoints as CoordinatePointPatch[]) {
    if (!rawPoint || typeof rawPoint !== "object") {
      return NextResponse.json({ success: false, message: "Each polygon point must be an object" }, { status: 400 });
    }
    const pair = parseLatLngPair(rawPoint.latitude, rawPoint.longitude);
    if ("error" in pair) {
      return NextResponse.json({ success: false, message: pair.error }, { status: 400 });
    }
    points.push({ latitude: pair.lat, longitude: pair.lng });
  }
  patch.waterSourcePolygonPoints = points;
}
```

- [ ] **Step 5: Update required-patch guard**

Replace the existing guard with:

```ts
if (
  patch.permitLengthYears === undefined &&
  patch.recommendedVolumeM3 === undefined &&
  patch.waterSourceLatitude === undefined &&
  patch.waterSourceLongitude === undefined &&
  patch.waterSourcePolygonPoints === undefined
) {
  return NextResponse.json(
    { success: false, message: "At least one assessor adjustment field is required" },
    { status: 400 },
  );
}
```

- [ ] **Step 6: Persist coordinate fields under `_assessorAdjustments`**

After volume persistence, add:

```ts
if (patch.waterSourceLatitude !== undefined && patch.waterSourceLongitude !== undefined) {
  nextAdjustments.waterSourceLatitude = patch.waterSourceLatitude;
  nextAdjustments.waterSourceLongitude = patch.waterSourceLongitude;
  nextAdjustments.coordinatesAdjustedAt = nowIso;
}
if (patch.waterSourcePolygonPoints !== undefined) {
  nextAdjustments.waterSourcePolygonPoints = patch.waterSourcePolygonPoints;
  nextAdjustments.coordinatesAdjustedAt = nowIso;
}
```

- [ ] **Step 7: Run verification**

Run: `npm run build`

Expected: build completes without TypeScript errors in the modified endpoint.

## Task 2: Assessment Report UI Editing

**Files:**
- Modify: `components/inspection/assessment-report-form.tsx`
- Modify: `app/assessment/application/[id]/page.tsx`

- [ ] **Step 1: Add callback props**

Extend `AssessmentReportFormProps`:

```ts
  onSourceCoordinatesSave?: (coords: { latitude: string; longitude: string }) => Promise<void>;
  onSourcePolygonSave?: (points: Array<{ latitude: string; longitude: string }>) => Promise<void>;
  coordinatesSaving?: boolean;
```

- [ ] **Step 2: Make abstraction LAT/LONG editable in Section 2**

Replace the read-only coordinate inputs with editable inputs when `!readOnly`, wired to `updateField("sourceLatitude", value)` and `updateField("sourceLongitude", value)`. Add one Save button that calls:

```ts
await onSourceCoordinatesSave?.({
  latitude: String(localData.sourceLatitude || ""),
  longitude: String(localData.sourceLongitude || ""),
});
```

Disable the button when `readOnly`, `coordinatesSaving`, or either field is blank.

- [ ] **Step 3: Make concession polygon points editable**

For each `localData.sourcePolygonPoints` row, wire input changes to a copied array:

```ts
const next = [...(localData.sourcePolygonPoints || [])];
next[index] = { ...next[index], latitude: e.target.value };
updateField("sourcePolygonPoints", next);
updateField("beacons", next.map((point, idx) => ({ id: `B${idx + 1}`, latitude: point.latitude, longitude: point.longitude })));
```

Add a Save button after the polygon list:

```ts
await onSourcePolygonSave?.(localData.sourcePolygonPoints || []);
```

- [ ] **Step 4: Add page state and save handlers**

In `app/assessment/application/[id]/page.tsx`, add `coordinatesSaving` state and handlers that call `persistAssessorAdjustment(application.id, { waterSourceLatitude, waterSourceLongitude })` or `{ waterSourcePolygonPoints }`.

After success, patch `application.internal_notes`, update `assessmentReportData.sourceLatitude/sourceLongitude/sourcePolygonPoints/beacons`, and call `bumpPreviewRefresh()`.

- [ ] **Step 5: Pass props to `AssessmentReportForm`**

In the assessment form render, pass:

```tsx
onSourceCoordinatesSave={(application as any).is_renewal ? undefined : saveSourceCoordinatesAdjustment}
onSourcePolygonSave={(application as any).is_renewal ? undefined : saveSourcePolygonAdjustment}
coordinatesSaving={coordinatesSaving}
```

Expected: abstraction and concession coordinate fields are editable in assessment mode and read-only elsewhere.

## Task 3: Hydration And Prefill

**Files:**
- Modify: `lib/assessment-report-utils.ts`
- Modify: `app/assessment/application/[id]/page.tsx`

- [ ] **Step 1: Add assessor adjustment extraction**

In `prefillAssessmentReportFromApplication`, after parsing `formData`, read:

```ts
const assessorAdjustments =
  formData && typeof (formData as any)._assessorAdjustments === "object" && (formData as any)._assessorAdjustments !== null
    ? ((formData as any)._assessorAdjustments as Record<string, unknown>)
    : {};
```

- [ ] **Step 2: Prefer adjusted abstraction coordinates**

Before returning report data, set `sourceLatitude/sourceLongitude` from valid `assessorAdjustments.waterSourceLatitude` and `assessorAdjustments.waterSourceLongitude` when both are finite.

- [ ] **Step 3: Prefer adjusted polygon points**

If `assessorAdjustments.waterSourcePolygonPoints` is a non-empty valid array, use it for `sourcePolygonPoints` and rebuild `beacons` from it.

- [ ] **Step 4: Hydrate local state after endpoint saves**

Ensure the assessment page's `persistAssessorAdjustment` return type allows coordinate fields in `assessorAdjustments: Record<string, unknown>` and uses the returned object to patch local `internal_notes`.

Expected: refreshing the assessment page shows the saved assessor coordinates.

## Task 4: Document Resolver Priority

**Files:**
- Modify: `lib/pdf-generator.ts`
- Modify: `lib/contract-placeholders.ts`
- Modify: `lib/permit/permit-text-data.ts`
- Modify: `lib/document-overrides.ts`

- [ ] **Step 1: Add shared local resolver helpers in each document file touched**

Use the same priority in each existing resolver:

```ts
const assessorAdjustments = notes?._assessorAdjustments;
const adjustedPair = tryPair(
  assessorAdjustments?.waterSourceLatitude,
  assessorAdjustments?.waterSourceLongitude,
);
if (adjustedPair) return adjustedPair;
```

- [ ] **Step 2: Update `lib/pdf-generator.ts`**

In `resolveLatLng`, check `_assessorAdjustments` before `notes.waterSourceLatitude` / `notes.waterSourceLongitude`. For polygon fallback, check `_assessorAdjustments.waterSourcePolygonPoints` before `notes.waterSourcePolygons`.

- [ ] **Step 3: Update `lib/contract-placeholders.ts`**

In `resolveLatLng`, check `_assessorAdjustments` before top-level notes and renewal `permitDetails`. In concession-area polygon calculations, use `_assessorAdjustments.waterSourcePolygonPoints` before `notes.waterSourcePolygons`.

- [ ] **Step 4: Update `lib/permit/permit-text-data.ts`**

In `resolveLatLng`, check `_assessorAdjustments.waterSourceLatitude` and `_assessorAdjustments.waterSourceLongitude` before top-level notes.

- [ ] **Step 5: Update `lib/document-overrides.ts`**

In `extractLatLngFromApp`, check `_assessorAdjustments` before base notes and transfer form data so document editor previews start from the assessor-approved coordinate values.

Expected: every document path that currently resolves source LAT/LONG now prefers assessor-adjusted coordinates.

## Task 5: Modification Propagation And Fixtures

**Files:**
- Modify: `app/api/modifications/propagate-approved-values/route.ts`
- Modify: `app/api/test/permit-pdf/route.ts`

- [ ] **Step 1: Propagate coordinate pair**

In `app/api/modifications/propagate-approved-values/route.ts`, include valid assessor coordinate pair values in `mergedNotes._assessorAdjustments`:

```ts
...(typeof assessorAdjustments?.waterSourceLatitude === "number" && typeof assessorAdjustments?.waterSourceLongitude === "number"
  ? {
      waterSourceLatitude: assessorAdjustments.waterSourceLatitude,
      waterSourceLongitude: assessorAdjustments.waterSourceLongitude,
    }
  : {}),
```

- [ ] **Step 2: Propagate polygon points**

If `assessorAdjustments.waterSourcePolygonPoints` is an array, copy it into the merged `_assessorAdjustments` object unchanged after validation that each point has finite latitude and longitude.

- [ ] **Step 3: Update PDF fixture**

In `app/api/test/permit-pdf/route.ts`, add adjusted coordinates to `_assessorAdjustments`:

```ts
_assessorAdjustments: {
  permitLengthYears: 5,
  recommendedVolumeM3: 1200,
  waterSourceLatitude: -1.93433216,
  waterSourceLongitude: 29.60182031,
}
```

For concession variants, add `waterSourcePolygonPoints` with two or more points.

- [ ] **Step 4: Verify manually generated test PDFs**

Run: `npm run build`

Then test existing fixture routes in the browser or API client and confirm generated text shows adjusted coordinates.

## Task 6: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run lints on edited files**

Use IDE lints for edited TypeScript files and fix introduced issues.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 3: Manual UI smoke test**

Open an editable assessment page and verify:

- abstraction LAT/LONG edits save and refresh the permit preview
- concession polygon edits save and refresh the permit preview
- reviewer and approver pages still show read-only coordinate values
- original application coordinate fields are not overwritten

- [ ] **Step 4: Git review**

Run: `git diff --stat` and review the diff for unintended files. Do not commit unless the user explicitly asks for a commit.
