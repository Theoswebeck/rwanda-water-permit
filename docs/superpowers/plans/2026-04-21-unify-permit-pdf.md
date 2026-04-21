# Unify Permit PDF Generation on PDFKit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lib/pdf-permit-server.ts` (PDFKit) the only permit renderer in the codebase, port the Kinyarwanda page for `abstraction_organization` from the dead jsPDF code, fix the leap-year renewal bug, and make staff preview iframes surface errors instead of hanging.

**Architecture:** PDFKit already produces every permit PDF users actually see (staff preview + applicant download). The jsPDF permit renderer is dead code. This plan removes ~1,800 lines of dead code, ports the one missing feature (Kinyarwanda page), and hardens a handful of error paths. No architectural changes — we're locking in the existing single-renderer reality and removing the distraction.

**Tech Stack:** Next.js App Router, TypeScript, PDFKit (server-side), Tailwind, shadcn/ui. No test framework is installed — verification is via the `/api/test/permit-pdf` route + manual browser QA.

**Design spec:** `docs/superpowers/specs/2026-04-21-unify-permit-pdf-design.md`

---

## File Structure

**Create:**
- `lib/date-math.ts` — `addYearsSafe(date, years)` helper. Single-responsibility: leap-year-safe year arithmetic.
- `components/staff/permit-preview-frame.tsx` — client component replacing the 4 ad-hoc iframe blocks. Handles fetch + blob URL + error state.

**Modify:**
- `lib/pdf-permit-server.ts` — replace `setFullYear` with `addYearsSafe` in 4 renderers; add Kinyarwanda helpers; add Kinyarwanda page to `renderAbstractionOrganization`.
- `app/api/staff/applications/[id]/permit-preview/route.ts` — replace `setFullYear` with `addYearsSafe`.
- `app/api/test/permit-pdf/route.ts` — expand to accept `?variant=&appType=` params with seeded fixtures.
- `app/review/application/[id]/page.tsx` — replace iframe block with `<PermitPreviewFrame>`.
- `app/assessment/application/[id]/page.tsx` — same.
- `app/approver/application/[id]/page.tsx` — same.
- `app/verification/application/[id]/page.tsx` — same.

**Delete (from `lib/pdf-generator.ts`):**
- `generateDigitalWaterPermit`, `generateDigitalWaterPermitBlob`
- The 4 `render*PermitPdfBlob` functions
- `computeValidityYearsFromDates`, `resolvePermitDurationYears`
- `resolveApplicantName`, `resolveOrganizationNameForPermit`, `resolveOrganizationRepresentative`, `resolveOrganizationRegisteredOfficeAddress`, `resolveApplicantIdNumber` (jsPDF-side duplicates)
- Any other helper that TypeScript flags as unused after the above deletions

**Keep (in `lib/pdf-generator.ts`):**
- `generateTermsConditionsPdfBlob` and its dependencies
- `generateFieldReportPdf` and its dependencies

---

## Task 0: Set Up Isolated Worktree

**Files:** none (git only)

- [ ] **Step 1: Create worktree on a feature branch**

From `/Users/nourumuneza/go/src/waterpermit`, cut from the current prod branch:

```bash
git worktree add -b feat/unify-permit-pdf ../waterpermit-unify-permit-pdf chore/stage-unstaged-2026-03-01
cd ../waterpermit-unify-permit-pdf
```

- [ ] **Step 2: Install dependencies in the worktree**

```bash
npm install
```

Expected: completes without errors. `node_modules/` populated.

- [ ] **Step 3: Confirm dev server starts**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: app loads. Kill the server (`Ctrl+C`) when confirmed.

---

## Task 1: Create `addYearsSafe` Date Utility

**Files:**
- Create: `lib/date-math.ts`

- [ ] **Step 1: Write the utility**

Create `lib/date-math.ts`:

```ts
/**
 * Add `years` to a date, clamping to the last day of the target month when
 * the source day does not exist in the target month (e.g. Feb 29 + 1y → Feb 28).
 *
 * Handles the Feb-29 + N-year case that `Date.setFullYear()` gets wrong: the
 * browser/node Date API silently rolls Feb 29 forward to Mar 1 in non-leap
 * target years. For permit validity math we want the last day of February
 * instead (matches civil/legal convention).
 */
export function addYearsSafe(date: Date, years: number): Date {
  const y = date.getFullYear() + years;
  const m = date.getMonth();
  const d = date.getDate();
  // Day 0 of (m+1) = last day of month m. JS trick for days-in-month.
  const daysInTargetMonth = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, daysInTargetMonth));
}
```

- [ ] **Step 2: Verify via node REPL**

```bash
node -e "const { addYearsSafe } = require('./lib/date-math.ts'); console.log('fail — .ts not runnable directly');" 2>&1 || true
```

Since `.ts` isn't directly runnable, verify via a tiny one-off script instead:

```bash
cat > /tmp/check-addYearsSafe.mjs <<'EOF'
function addYearsSafe(date, years) {
  const y = date.getFullYear() + years;
  const m = date.getMonth();
  const d = date.getDate();
  const daysInTargetMonth = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, daysInTargetMonth));
}

const feb29 = new Date(2024, 1, 29);
console.log('Feb 29 2024 + 5y =', addYearsSafe(feb29, 5).toISOString().slice(0,10), '(expect 2029-02-28)');
console.log('Feb 29 2024 + 4y =', addYearsSafe(feb29, 4).toISOString().slice(0,10), '(expect 2028-02-29)');
console.log('Jan 15 2024 + 3y =', addYearsSafe(new Date(2024,0,15), 3).toISOString().slice(0,10), '(expect 2027-01-15)');
EOF
node /tmp/check-addYearsSafe.mjs
```

Expected output (exactly):
```
Feb 29 2024 + 5y = 2029-02-28 (expect 2029-02-28)
Feb 29 2024 + 4y = 2028-02-29 (expect 2028-02-29)
Jan 15 2024 + 3y = 2027-01-15 (expect 2027-01-15)
```

- [ ] **Step 3: Commit**

```bash
git add lib/date-math.ts
git commit -m "feat: add addYearsSafe helper for leap-year-safe permit validity math

Clamps Feb 29 + N years to Feb 28 in non-leap target years instead of
rolling forward to Mar 1. Used by the permit PDF renderer and preview
route's renewal expiry calculation."
```

---

## Task 2: Replace `setFullYear` in `pdf-permit-server.ts` Renderers

**Files:**
- Modify: `lib/pdf-permit-server.ts` (4 occurrences at lines 557, 634, 708, 783)

- [ ] **Step 1: Import `addYearsSafe`**

Add to the top of `lib/pdf-permit-server.ts` (near other imports):

```ts
import { addYearsSafe } from "./date-math";
```

- [ ] **Step 2: Replace occurrence in `renderConcessionIndividual` (line ~557)**

Find:

```ts
    d.setFullYear(d.getFullYear() + resolvePermitDuration(app, opts.permitValidityYears));
    return d;
```

Replace the enclosing IIFE with:

```ts
    return addYearsSafe(d, resolvePermitDuration(app, opts.permitValidityYears));
```

(The full block currently reads `const expiryDate = opts.expiryDate ?? (() => { const d = new Date(issueDate); d.setFullYear(…); return d; })();` — rewrite it as `const expiryDate = opts.expiryDate ?? addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));`.)

- [ ] **Step 3: Apply the same replacement in `renderAbstractionIndividual` (line ~634)**

Same pattern. Confirm with:

```bash
grep -n "setFullYear" lib/pdf-permit-server.ts
```

Expected: line 634 no longer matches (but 2 other lines still do).

- [ ] **Step 4: Apply the same replacement in `renderAbstractionOrganization` (line ~708)**

Same pattern.

- [ ] **Step 5: Apply the same replacement in `renderConcessionOrganization` (line ~783)**

Same pattern.

- [ ] **Step 6: Verify no `setFullYear` remains in this file**

```bash
grep -n "setFullYear" lib/pdf-permit-server.ts
```

Expected: no output (empty). If any remain, fix them the same way.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If an error fires, read it — it is almost certainly a missed `.ts` path on the import.

- [ ] **Step 8: Commit**

```bash
git add lib/pdf-permit-server.ts
git commit -m "fix(pdf): use leap-year-safe date math for permit validity expiry

Replaces setFullYear in all four renderers with addYearsSafe so that a
permit issued on Feb 29 of a leap year expires on Feb 28 of the target
year rather than silently rolling forward to Mar 1."
```

---

## Task 3: Replace `setFullYear` in Permit Preview Route

**Files:**
- Modify: `app/api/staff/applications/[id]/permit-preview/route.ts` (lines ~281 and ~305-306)

- [ ] **Step 1: Import `addYearsSafe`**

Add near the existing imports at the top:

```ts
import { addYearsSafe } from "@/lib/date-math";
```

- [ ] **Step 2: Replace the `setFullYear` pair at line ~281**

Find:

```ts
            const d = new Date();
            d.setFullYear(d.getFullYear() + totalYears);
            exactExpiryDate = d;
```

Replace with:

```ts
            exactExpiryDate = addYearsSafe(new Date(), totalYears);
```

- [ ] **Step 3: Replace the `setFullYear` pair at line ~305**

Find:

```ts
                  const d = new Date();
                  d.setFullYear(d.getFullYear() + totalYears);
                  exactExpiryDate = d;
```

Replace with:

```ts
                  exactExpiryDate = addYearsSafe(new Date(), totalYears);
```

- [ ] **Step 4: Verify no `setFullYear` remains in the route file**

```bash
grep -n "setFullYear" app/api/staff/applications/\[id\]/permit-preview/route.ts
```

Expected: no output.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/staff/applications/\[id\]/permit-preview/route.ts
git commit -m "fix(permit-preview): use addYearsSafe for renewal expiry calc

Matches the leap-year fix now applied in the PDFKit renderers."
```

---

## Task 4: Port Kinyarwanda Helpers to `pdf-permit-server.ts`

**Files:**
- Modify: `lib/pdf-permit-server.ts` — add 4 small helpers before the first `render*` function.

- [ ] **Step 1: Add `formatProvinceEnglish` and `formatProvinceKinyarwanda`**

The file already has `fmtProvince` (line 169). We keep it for English. Add a Kinyarwanda counterpart and a more explicit English formatter used by the Kinyarwanda page text. Insert before `function docToBuffer` (around line 419):

```ts
// ── Kinyarwanda helpers (ported from lib/pdf-generator.ts, used by
//    the abstraction_organization second page) ──────────────────────────

function formatProvinceOrCityOfKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : `${provinceRaw} Province`;
}

function formatIntaraOrUmujyiWaKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "Umujyi wa Kigali" : `Intara ya ${provinceRaw}`;
}

function getActivityLabelKinyarwanda(activity: string): string {
  const activityLabels: Record<string, string> = {
    irrigation: "kuhira",
    domestic: "gukoresha mu rugo",
    industrial: "inganda",
    livestock: "ubworozi",
    fish_farming_ponds: "ubworozi bw'amafi",
    fish_farming_lakes: "ubworozi bw'amafi",
    aquaculture: "ubworozi bw'amafi",
    electricity_generation: "kubyaza amashanyarazi amazi",
    hydropower_source: "kubyaza amashanyarazi amazi",
    mining: "ubucukuzi bw'amabuye y'agaciro",
    recreation_activities: "imyidagaduro",
    water_supply: "gutanga amazi",
    municipal_supply: "gutanga amazi",
    other: "ibindi",
  };
  return activityLabels[activity] || activity.replace(/[_-]/g, " ");
}

function resolveActivitiesKinyarwanda(app: PermitApplication): string {
  const raw = app.intended_activities;
  let acts: string[] = [];
  if (Array.isArray(raw)) {
    acts = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) acts = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      acts = [raw.trim()];
    }
  }
  if (!acts.length) {
    const purpose = typeof app.water_purpose === "string" ? app.water_purpose.trim() : "";
    if (purpose) return getActivityLabelKinyarwanda(purpose);
    return "N/A";
  }
  return acts.map(getActivityLabelKinyarwanda).join(", ");
}

function resolveKinyarwandaSystemType(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const n = raw.toLowerCase();
  if (!n) return "GUKORESHA";
  if (n.includes("pump")) return "GUPOMPA";
  if (n.includes("grav")) return "GUKORESHA";
  if (n.includes("diversion") || n === "diversion_channel") return "gukoresha umuyoboro w'amazi";
  if (n.includes("dam") || n.includes("reservoir")) return "gukoresha ikidendezi";
  if (n.includes("borehole")) return "gukoresha iriba ryatobowe";
  if (n.includes("spring")) return "gufata amazi y'isoko";
  if (n.includes("hand") || (n.includes("dug") && n.includes("well"))) return "gukoresha iriba ryacukuwe";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GUKORESHA";
}
```

Note: `resolveAbstractionMethodRaw` already exists in the file (line 225). `intended_activities` on `PermitApplication` is typed as `unknown`; the helper handles array, JSON-string, and bare-string forms.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf-permit-server.ts
git commit -m "feat(pdf): port Kinyarwanda helper functions from jsPDF renderer

Prepares pdf-permit-server.ts for the Kinyarwanda second page in the
abstraction_organization variant. No behavior change yet; helpers are
referenced by upcoming renderKinyarwandaOrgAbstractionPage."
```

---

## Task 5: Add Kinyarwanda Page to `renderAbstractionOrganization`

**Files:**
- Modify: `lib/pdf-permit-server.ts` — add `drawKinyarwandaOrgAbstractionPage` helper + one call in `renderAbstractionOrganization`.

- [ ] **Step 1: Add the page-renderer helper**

Insert this function immediately before `async function renderAbstractionOrganization` (around line 702). The function mirrors the English renderer's structure — it adds a new page, stamps the watermark/letterhead pieces that already exist, writes the translation paragraphs, and signs off.

```ts
async function drawKinyarwandaOrgAbstractionPage(
  doc: PDFKit.PDFDocument,
  opts: PermitRenderOpts,
  permitTitleLine: string,
  issueDate: Date,
  expiryDate: Date,
): Promise<void> {
  const { application: app } = opts;

  doc.addPage();
  drawWatermark(doc);
  const logoY = drawLogo(doc);
  drawTitle(doc, `URUHUSHYA RWO GUKORESHA AMAZI N° ${permitTitleLine}`, logoY);

  const notes = resolveNotes(app) || {};
  const orgName = resolveApplicantName(app);
  const rep = resolveOrgRep(app);
  const officeSector =
    typeof notes.officeSector === "string" && notes.officeSector.trim()
      ? notes.officeSector.trim()
      : "N/A";
  const officeDistrict =
    typeof notes.officeDistrict === "string" && notes.officeDistrict.trim()
      ? notes.officeDistrict.trim()
      : "N/A";
  const officeProvinceRaw =
    typeof notes.officeProvince === "string" ? notes.officeProvince.trim() : "";

  const waterSourceName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const systemTypeRw = resolveKinyarwandaSystemType(app);
  const activitiesRw = resolveActivitiesKinyarwanda(app);
  const flowRate = resolveFlowRate(app);

  const paraRw2 =
    "Hashingiwe ku Itegeko N° 49/2018 ryo ku wa 13/08/2018 rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,";

  const paraRw3 =
    `"${orgName}" ifite ibiro biherereye mu Murenge wa ${officeSector}, Akarere ka ${officeDistrict}, ${formatIntaraOrUmujyiWaKigali(officeProvinceRaw)}; ` +
    `ihagarariwe na ${rep.name} "${rep.title}", yemerewe ${systemTypeRw} amazi angana na ${flowRate}, ` +
    `ava ku ${waterSourceName} iherereye mu ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
    `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, ` +
    `Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}. Aya mazi yemerewe gukoreshwa mu ${activitiesRw}.`;

  const paraRw4 =
    `Uru ruhushya rufite agaciro kuva ${fmtDMY(issueDate)} kugeza ${fmtDMY(expiryDate)}.`;

  const paraRw5 =
    "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.";

  doc.font("Helvetica").fontSize(11).fillColor("#000");
  const leftX = 50;
  const maxWidth = doc.page.width - leftX * 2;

  let y = logoY + 30;
  for (const p of [paraRw2, paraRw3, paraRw4, paraRw5]) {
    doc.text(p, leftX, y, { width: maxWidth, align: "left" });
    y = doc.y + 8;
  }

  // Signature line — left side: title; right side: "Bikorewe i Kigali, kuwa …"
  const sigY = Math.max(y + 24, doc.page.height - 140);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, sigY);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, leftX, sigY, {
    width: maxWidth,
    align: "right",
  });
}
```

- [ ] **Step 2: Wire the Kinyarwanda page into `renderAbstractionOrganization`**

Locate the QR/preview-banner block at the end of `renderAbstractionOrganization` (currently around line 768):

```ts
  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    if (opts.skipQr) drawDraftOverlay(doc);
    drawPageFooter(doc, permitNumber, i + 1, pageCount);
  }
```

Insert the Kinyarwanda page call **before** the QR/banner block (so the QR footer lands on page 2 instead of page 1, and the `drawDraftOverlay` loop applies to both pages):

```ts
  // Second page — Kinyarwanda translation (abstraction_organization only)
  await drawKinyarwandaOrgAbstractionPage(
    doc,
    opts,
    resolvePermitTitleNumber(permitNumber, issueDate.getFullYear()),
    issueDate,
    expiryDate,
  );

  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }
```

`issueDate` and `expiryDate` are already resolved earlier in the function — use them directly. `resolvePermitTitleNumber` already exists at line 340.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Common failure: `drawLogo` returns a `number` which is the y-cursor after the logo; confirm it matches what `drawTitle` expects (also `number`).

- [ ] **Step 4: Smoke-render via the test route**

Start the dev server:

```bash
npm run dev
```

In another terminal:

```bash
curl -s "http://localhost:3000/api/test/permit-pdf" -o /tmp/before-kinyarwanda.pdf
ls -la /tmp/before-kinyarwanda.pdf
```

Expected: file exists and is a valid PDF. Open in Preview (`open /tmp/before-kinyarwanda.pdf`). Expected: **if the default test fixture is `abstraction_organization`**, it now has 2 pages — English on page 1, Kinyarwanda on page 2. Otherwise the test route still renders whatever variant it defaults to; we expand the route in Task 6.

Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-permit-server.ts
git commit -m "feat(pdf): render Kinyarwanda translation page for abstraction_organization

Adds a second page with a full Kinyarwanda translation of the English
permit body for abstraction_organization variants. Text, labels, and
activity/system-type translations mirror the original jsPDF renderer
(lib/pdf-generator.ts:1114-1254), which is itself slated for deletion.

Preview variants (skipQr=true) get the DRAFT watermark + banner on
both pages; issued variants get the QR footer at the bottom of page 2."
```

---

## Task 6: Expand `/api/test/permit-pdf` with Scenario Fixtures

**Files:**
- Modify: `app/api/test/permit-pdf/route.ts`

- [ ] **Step 1: Read the current route**

```bash
cat app/api/test/permit-pdf/route.ts
```

Note the current fixture shape. Keep the `generatePermitPdfBuffer` call signature compatible.

- [ ] **Step 2: Replace route body with scenario dispatcher**

Write the full new body (replace the existing file contents wholesale):

```ts
import { NextRequest, NextResponse } from "next/server";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";

export const runtime = "nodejs";

type Variant =
  | "abstraction_individual"
  | "abstraction_organization"
  | "concession_individual"
  | "concession_organization";

type AppType = "standard" | "renewal" | "modification" | "transfer";

const BASE_LOCATION = {
  province: "Southern",
  district: "Muhanga",
  sector: "Rongi",
  cell: "Gacurabwenge",
  village: "Giheta",
};

function baseIndividualApplicant() {
  return {
    first_name: "JEAN",
    last_name: "UWIMANA",
    email: "jean.uwimana@example.rw",
    phone: "+250788000001",
    account_type: "individual",
    id_number: "1199080012345678",
  };
}

function baseOrganizationApplicant() {
  return {
    first_name: "MANAGING",
    last_name: "DIRECTOR",
    email: "contact@example.rw",
    phone: "+250788000002",
    account_type: "organization",
    company_name: "WATER WORKS LTD",
    company_tin: "100123456",
    company_address: "KG 123 St, Kigali",
  };
}

function notesFor(variant: Variant, appType: AppType): Record<string, unknown> {
  const notes: Record<string, unknown> = {
    nameRepresentative: "MUSHIMIYIMANA Virginie",
    representativeTitle: "Managing Director",
    representativePosition: "Director",
    nationalIdNumber: "1199080012345678",
    fullNameApplicant: "WATER WORKS LTD",
    officeSector: "Nyarugenge",
    officeDistrict: "Kigali",
    officeProvince: "Kigali",
    officePhone: "+250788000099",
    nameSourceWater: "Nyabarongo River",
    waterSourceLatitude: -1.9441,
    waterSourceLongitude: 30.0619,
    waterSourceProvince: BASE_LOCATION.province,
    waterSourceDistrict: BASE_LOCATION.district,
    waterSourceSector: BASE_LOCATION.sector,
    waterSourceCell: BASE_LOCATION.cell,
    waterSourceVillage: BASE_LOCATION.village,
    intendedActivities: variant.startsWith("concession") ? ["fish_farming_lakes"] : ["irrigation", "water_supply"],
    _assessorAdjustments: { permitLengthYears: 5, recommendedVolumeM3: 1200 },
  };

  if (appType === "transfer") {
    notes.isTransfer = true;
    notes.originalPermitNumber = "0042/RWB/2025";
    notes.transferFormData = {
      permitNumber: "0042/RWB/2025",
      waterSourceType: variant.startsWith("concession") ? "lake" : "river",
      waterSourceName: "Nyabarongo River",
      waterPurpose: "industry",
      waterAllowance: "1200",
      allowanceUnit: "m3/year",
      abstractionMethod: "pumping",
      transfereeName: "SIBOYINTORE CO.LTD",
      transfereeRepresentativeName: "MUSHIMIYIMANA Virginie",
      transfereeRepresentativePosition: "Managing Director",
      transfereeAddressProvince: "Southern",
      transfereeAddressDistrict: "Muhanga",
      transfereeAddressSector: "Rongi",
      transfereeAddressCell: "Gacurabwenge",
      transfereeAddressVillage: "Giheta",
      transfereeEmail: "transferee@example.rw",
      transfereePhone: "+250788000088",
    };
  }

  if (appType === "renewal") {
    notes.isRenewal = true;
    notes.originalPermitNumber = "0099/RWB/2023";
  }

  if (appType === "modification") {
    notes.isModification = true;
    notes.originalPermitNumber = "0077/RWB/2024";
  }

  return notes;
}

function buildFixture(variant: Variant, appType: AppType): PermitApplication {
  const isOrg = variant.endsWith("_organization");
  const isConcession = variant.startsWith("concession");

  const applicant = isOrg ? baseOrganizationApplicant() : baseIndividualApplicant();
  const notes = notesFor(variant, appType);

  return {
    id: `test-${variant}-${appType}`,
    application_number: `RWB-2026-000${appType === "transfer" ? "4" : "1"}`,
    project_title: `${appType} — ${variant}`,
    status: "approved_pending_permit",
    application_type: appType,
    water_source: isConcession ? "lake" : "river",
    water_purpose: isConcession ? "aquaculture" : "irrigation",
    estimated_usage_volume: 1200,
    usage_unit: "m3/year",
    province: BASE_LOCATION.province,
    district: BASE_LOCATION.district,
    sector: BASE_LOCATION.sector,
    cell: BASE_LOCATION.cell,
    village: BASE_LOCATION.village,
    concession_area: isConcession ? 34 : undefined,
    proposed_duration_years: 5,
    assessor_recommended_volume_m3: 1200,
    max_daily_volume_m3: 3,
    max_yearly_volume_m3: 1200,
    internal_notes: JSON.stringify(notes),
    water_taking_method: isConcession ? "diversion_channel" : "pumping",
    applicant,
  } as unknown as PermitApplication;
}

const VALID_VARIANTS: Variant[] = [
  "abstraction_individual",
  "abstraction_organization",
  "concession_individual",
  "concession_organization",
];
const VALID_APP_TYPES: AppType[] = ["standard", "renewal", "modification", "transfer"];

function parseVariant(v: string | null): Variant {
  return VALID_VARIANTS.includes(v as Variant) ? (v as Variant) : "abstraction_organization";
}

function parseAppType(v: string | null): AppType {
  return VALID_APP_TYPES.includes(v as AppType) ? (v as AppType) : "standard";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const variant = parseVariant(url.searchParams.get("variant"));
    const appType = parseAppType(url.searchParams.get("appType"));
    const skipQr = url.searchParams.get("skipQr") === "true";
    const issueDateParam = url.searchParams.get("issueDate"); // e.g. 2024-02-29

    const fixture = buildFixture(variant, appType);

    const issuedDate = issueDateParam ? new Date(`${issueDateParam}T00:00:00Z`) : new Date();

    const pdfBuffer = await generatePermitPdfBuffer({
      application: fixture,
      permitNumber: "TEST/RWB/2026",
      permitValidityYears: 5,
      issuedDate,
      skipQr,
      isModified: appType === "modification",
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="test-${variant}-${appType}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("test/permit-pdf error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manually sanity-check the route**

```bash
npm run dev
```

Then fetch several scenarios:

```bash
for variant in abstraction_individual abstraction_organization concession_individual concession_organization; do
  for type in standard renewal modification transfer; do
    curl -s "http://localhost:3000/api/test/permit-pdf?variant=${variant}&appType=${type}" \
      -o "/tmp/test-${variant}-${type}.pdf"
    echo "${variant} / ${type} → $(wc -c < /tmp/test-${variant}-${type}.pdf) bytes"
  done
done
```

Expected: 16 lines, each showing a byte count > 10 000 (anything under a few KB means the renderer errored). Kill dev server when done.

- [ ] **Step 5: Leap-year sanity check**

```bash
npm run dev
# in another terminal:
curl -s "http://localhost:3000/api/test/permit-pdf?variant=abstraction_organization&appType=standard&issueDate=2024-02-29" \
  -o /tmp/leap.pdf
open /tmp/leap.pdf
```

Expected: the validity line reads `"valid from 29/02/2024 to 28/02/2029."` — **NOT** `01/03/2029`. Kill dev server.

- [ ] **Step 6: Commit**

```bash
git add app/api/test/permit-pdf/route.ts
git commit -m "feat(test-route): parametrize /api/test/permit-pdf with variant+appType

Accepts ?variant=&appType=&issueDate=&skipQr= query params to exercise
the full 16-scenario matrix (4 variants × 4 application types) against
pdf-permit-server. Used as the manual-QA harness for this PR."
```

---

## Task 7: Create `PermitPreviewFrame` Client Component

**Files:**
- Create: `components/staff/permit-preview-frame.tsx`

- [ ] **Step 1: Write the component**

Create `components/staff/permit-preview-frame.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "loading" | "ready" | "error";

interface PermitPreviewFrameProps {
  applicationId: string;
  /** Override src if ever needed (defaults to the staff preview endpoint). */
  src?: string;
  /** Height in px; default 900 to match existing tab height. */
  height?: number;
}

export function PermitPreviewFrame({
  applicationId,
  src,
  height = 900,
}: PermitPreviewFrameProps) {
  const url = src ?? `/api/staff/applications/${applicationId}/permit-preview`;
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // Bumping reloadKey re-runs the effect (cache-safe way to retry).
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setStatus("loading");
    setErrorMessage(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const ct = res.headers.get("content-type") || "";
          let message = `Request failed (${res.status})`;
          if (ct.includes("application/json")) {
            const body = await res.json().catch(() => null);
            if (body && typeof body.message === "string") message = body.message;
          }
          setErrorMessage(message);
          setStatus("error");
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Network error");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url, reloadKey]);

  return (
    <div
      className="relative rounded-lg border overflow-hidden bg-muted/30"
      style={{ height: `${height}px` }}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-sm text-muted-foreground">Generating permit preview…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-red-100 p-3">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="font-medium">Could not generate permit preview</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage ?? "Unknown error."}</p>
          </div>
          <button
            type="button"
            onClick={retry}
            className="mt-2 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      )}

      {status === "ready" && blobUrl && (
        <iframe
          src={blobUrl}
          className="w-full h-full"
          style={{ border: "none" }}
          title="Permit Preview"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If React/TSX types aren't resolving, the file is probably in the wrong directory — confirm it's under `components/` (inside `include` of `tsconfig.json`).

- [ ] **Step 3: Commit**

```bash
git add components/staff/permit-preview-frame.tsx
git commit -m "feat(components): add PermitPreviewFrame with proper error handling

Fetches the preview endpoint via fetch() so HTTP 4xx/5xx surface as an
inline error card with a retry button, rather than hanging the loading
spinner forever (the current iframe-src pattern cannot detect HTTP
errors because the browser still \"loads\" the error body)."
```

---

## Task 8: Replace Iframe Block in `app/review/application/[id]/page.tsx`

**Files:**
- Modify: `app/review/application/[id]/page.tsx` (lines 1462-1485)

- [ ] **Step 1: Add the import**

Near the top of the file, add:

```tsx
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
```

- [ ] **Step 2: Replace the `<TabsContent value="permit_preview">` body**

Find the existing block (lines 1462-1485, identifiable by the `id={\`permit-preview-loading-${application.id}\`}` div):

```tsx
            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && (
                <div className="relative rounded-lg border overflow-hidden bg-muted/30" style={{ height: '900px' }}>
                  <div
                    id={`permit-preview-loading-${application.id}`}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10"
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    <p className="text-sm text-muted-foreground">Generating permit preview…</p>
                  </div>
                  <iframe
                    src={`/api/staff/applications/${application.id}/permit-preview`}
                    className="w-full h-full"
                    style={{ border: 'none' }}
                    title="Permit Preview"
                    onLoad={() => {
                      const overlay = document.getElementById(`permit-preview-loading-${application.id}`);
                      if (overlay) overlay.style.display = 'none';
                    }}
                  />
                </div>
              )}
            </TabsContent>
```

Replace with:

```tsx
            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Browser smoke test**

```bash
npm run dev
```

Navigate to `/review/application/<any-valid-id>`. Click the **Permit Preview** tab. Expected: spinner, then the PDF renders inline.

Trigger an error to test the failure path: in DevTools Network tab, block `/api/staff/applications/*/permit-preview`, reload the tab, click Permit Preview. Expected: error card shows with "Could not generate permit preview" and a **Try again** button. Unblock, click Try again. Expected: PDF loads.

Kill dev server.

- [ ] **Step 5: Commit**

```bash
git add app/review/application/\[id\]/page.tsx
git commit -m "fix(review): use PermitPreviewFrame so PDF errors surface in UI

Replaces the raw iframe (which hangs its spinner on HTTP 4xx/5xx
because onLoad fires for error bodies too) with the fetch+blob
component that detects non-ok responses and shows a retry card."
```

---

## Task 9: Replace Iframe Block in `app/assessment/application/[id]/page.tsx`

**Files:**
- Modify: `app/assessment/application/[id]/page.tsx` (iframe block around line 2314)

- [ ] **Step 1: Locate the iframe block**

```bash
grep -n "permit-preview-loading" app/assessment/application/\[id\]/page.tsx
```

Expected: one match pointing at the `id={\`permit-preview-loading-${application.id}\`}` line.

- [ ] **Step 2: Add the import**

Near the top of the file (with other imports):

```tsx
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
```

- [ ] **Step 3: Replace the iframe block**

Find the block (23-line region beginning with `<div className="relative rounded-lg border overflow-hidden bg-muted/30" style={{ height: '900px' }}>` inside `<TabsContent value="permit_preview">`) and replace the inner body of that `<TabsContent>` with:

```tsx
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
```

The complete tab content should read:

```tsx
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/assessment/application/\[id\]/page.tsx
git commit -m "fix(assessment): use PermitPreviewFrame for error-safe preview

Replaces the raw-iframe block (which cannot surface HTTP 4xx/5xx) with
the fetch+blob component that shows an inline retry card on failure."
```

---

## Task 10: Replace Iframe Block in `app/approver/application/[id]/page.tsx`

**Files:**
- Modify: `app/approver/application/[id]/page.tsx`

- [ ] **Step 1: Locate the iframe block**

```bash
grep -n "permit-preview-loading" app/approver/application/\[id\]/page.tsx
```

- [ ] **Step 2: Add the import**

Near the top of the file:

```tsx
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
```

- [ ] **Step 3: Replace the iframe block**

Find the `<TabsContent value="permit_preview">` block containing `id={\`permit-preview-loading-${application.id}\`}` and replace the inner body with:

```tsx
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
```

Complete expected shape:

```tsx
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/approver/application/\[id\]/page.tsx
git commit -m "fix(approver): use PermitPreviewFrame for error-safe preview"
```

---

## Task 11: Replace Iframe Block in `app/verification/application/[id]/page.tsx`

**Files:**
- Modify: `app/verification/application/[id]/page.tsx`

- [ ] **Step 1: Locate the iframe block**

```bash
grep -n "permit-preview-loading" app/verification/application/\[id\]/page.tsx
```

- [ ] **Step 2: Add the import**

Near the top of the file:

```tsx
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
```

- [ ] **Step 3: Replace the iframe block**

Find the `<TabsContent value="permit_preview">` block containing `id={\`permit-preview-loading-${application.id}\`}` and replace the inner body with:

```tsx
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
```

Complete expected shape:

```tsx
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Grep for orphaned ids across the whole app**

```bash
grep -rn "permit-preview-loading" app/ components/
```

Expected: no output. If any remain, they were missed in Tasks 8-11.

- [ ] **Step 6: Commit**

```bash
git add app/verification/application/\[id\]/page.tsx
git commit -m "fix(verification): use PermitPreviewFrame for error-safe preview"
```

---

## Task 12: Delete Dead jsPDF Permit-Rendering Code

**Files:**
- Modify: `lib/pdf-generator.ts` — delete permit-rendering exports and their private helpers.

- [ ] **Step 1: Delete the top-level permit exports**

In `lib/pdf-generator.ts`, delete:

- `generateDigitalWaterPermit` (around line 1444)
- `generateDigitalWaterPermitBlob` (around line 1463)
- `computeValidityYearsFromDates`
- `renderAbstractionIndividualPermitPdfBlob`
- `renderAbstractionOrganizationPermitPdfBlob` (around line 1114)
- `renderConcessionIndividualPermitPdfBlob` (around line 1256)
- `renderConcessionOrganizationPermitPdfBlob`

Delete from the start of each function (or its preceding doc-comment) through its closing `}`.

- [ ] **Step 2: Typecheck — let TS flag orphans**

```bash
npx tsc --noEmit 2>&1 | tee /tmp/tsc-orphans.log
```

Expected: errors listing symbols declared but not used. Each such symbol is a helper referenced only by the deleted renderers and therefore also dead. Example likely orphans:

- `resolveApplicantName` (jsPDF side; do NOT confuse with the PDFKit version)
- `resolveOrganizationNameForPermit`
- `resolveOrganizationRepresentative`
- `resolveOrganizationRegisteredOfficeAddress`
- `resolveApplicantIdNumber`
- `resolvePermitDurationYears`
- `formatActivitiesForPermitKinyarwanda`, `getActivityLabelKinyarwanda`
- `formatProvinceOrCityOfKigali`, `formatIntaraOrUmujyiWaKigali`
- `resolveKinyarwandaSystemTypeLabel`, `resolveEnglishSystemTypeLabel`
- `resolveAbstractionMethodRaw` (jsPDF side)
- `resolveFlowRateLabel`
- `resolveLakeNameForPermit`, `resolveConcessionAreaHectares`
- `resolveLatLng` (jsPDF side), `resolveWaterSourceAdminLocation`, `resolveWaterSourceName`
- `formatProvinceOrKigali`
- `drawPermitPageHeader`, `drawPermitQrFooter`, `stampWatermark`, `loadWatermarkImage`, `drawModifiedBadge`
- `resolvePermitTitleLine`, `derivePermitTitleNumber`, `resolvePermitTitleNumber`
- `formatDateDMY` (if not used by terms/field-report), `formatNumber`
- `getIntendedActivities`, `getActivityLabel`, `getInternalNotes` (jsPDF side)
- `PERMIT_FONT_FAMILY` and associated font setup

**Important:** Do NOT delete helpers that `generateTermsConditionsPdfBlob` or `generateFieldReportPdf` still use. The typecheck will only complain about the ones that are truly orphaned. **Trust the compiler.**

- [ ] **Step 3: Delete orphans iteratively**

Delete each symbol that TypeScript reports as "declared but its value is never read" (TS6133) or equivalent. Re-run `npx tsc --noEmit` after each pass. Stop when 0 errors.

- [ ] **Step 4: Grep for dangling references outside the file**

```bash
grep -rn "generateDigitalWaterPermit\|renderAbstractionIndividualPermitPdfBlob\|renderAbstractionOrganizationPermitPdfBlob\|renderConcessionIndividualPermitPdfBlob\|renderConcessionOrganizationPermitPdfBlob" . \
  --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
```

Expected: no output. (The only prior hit was from an internal call site inside the deleted functions.)

- [ ] **Step 5: Full build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Line-count sanity**

```bash
wc -l lib/pdf-generator.ts
```

Expected: ~700 lines, down from 2,552.

- [ ] **Step 7: Run the full test-route matrix one more time**

```bash
npm run dev
# in another terminal:
for variant in abstraction_individual abstraction_organization concession_individual concession_organization; do
  for type in standard renewal modification transfer; do
    status=$(curl -s -o "/tmp/regress-${variant}-${type}.pdf" -w "%{http_code}" \
      "http://localhost:3000/api/test/permit-pdf?variant=${variant}&appType=${type}")
    bytes=$(wc -c < "/tmp/regress-${variant}-${type}.pdf")
    echo "${variant}/${type}  HTTP ${status}  ${bytes} bytes"
  done
done
```

Expected: all 16 lines show `HTTP 200` and > 10 000 bytes. Kill dev server.

- [ ] **Step 8: Commit**

```bash
git add lib/pdf-generator.ts
git commit -m "refactor(pdf-generator): delete dead jsPDF permit-rendering code

No callsite in the codebase ever imported generateDigitalWaterPermit,
generateDigitalWaterPermitBlob, or the four render*PermitPdfBlob
functions — the PDFKit-based pdf-permit-server.ts has been the only
live permit renderer all along. Removes ~1,800 lines of dead code
plus all jsPDF-side helpers that TypeScript confirmed were orphaned
after the deletion.

Retained: generateTermsConditionsPdfBlob (terms & conditions PDF)
and generateFieldReportPdf (inspection field report), which are the
only exports of this file still in active use."
```

---

## Task 13: 16-Scenario Visual Verification Matrix

**Files:** none (manual QA only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Render preview + issued variants for each of the 16 scenarios**

For each `(variant, appType)` combination, fetch both the preview-style and issued-style variants and save them to disk:

```bash
mkdir -p /tmp/permit-matrix
for variant in abstraction_individual abstraction_organization concession_individual concession_organization; do
  for type in standard renewal modification transfer; do
    curl -s "http://localhost:3000/api/test/permit-pdf?variant=${variant}&appType=${type}&skipQr=true" \
      -o "/tmp/permit-matrix/${variant}-${type}-preview.pdf"
    curl -s "http://localhost:3000/api/test/permit-pdf?variant=${variant}&appType=${type}&skipQr=false" \
      -o "/tmp/permit-matrix/${variant}-${type}-issued.pdf"
  done
done
ls -la /tmp/permit-matrix/ | wc -l
```

Expected: 32 files + totals line → line count is 33.

- [ ] **Step 3: Visual diff each pair**

For each of the 16 pairs, open both files side by side:

```bash
open /tmp/permit-matrix/abstraction_organization-standard-preview.pdf /tmp/permit-matrix/abstraction_organization-standard-issued.pdf
# repeat for the other 15 pairs
```

For each pair, confirm:
- Same body text, fields, layout
- Preview has DRAFT banner at bottom + faint diagonal DRAFT watermark per page
- Issued has QR footer at bottom, no DRAFT
- **`abstraction_organization` only:** page 2 is Kinyarwanda; matches page 1 dates/names/volumes

- [ ] **Step 4: Structural assertions**

```bash
# Pages count per scenario — abstraction_organization must be 2, others 1.
for variant in abstraction_individual abstraction_organization concession_individual concession_organization; do
  for type in standard renewal modification transfer; do
    f="/tmp/permit-matrix/${variant}-${type}-preview.pdf"
    pages=$(mdls -name kMDItemNumberOfPages -raw "$f" 2>/dev/null || echo "?")
    echo "${variant}/${type}  pages=${pages}"
  done
done
```

Expected: all `abstraction_organization` rows show `pages=2`. All others show `pages=1`.

- [ ] **Step 5: Record matrix results**

Update the PR description with a table summarizing the 16 scenarios (pass/fail with any notes). If any scenario fails, do **not** proceed to merge — fix the regression first.

---

## Task 14: Finalize

**Files:** none (git only)

- [ ] **Step 1: Rebase / clean history (optional)**

If the 10+ commits need squashing to a cleaner story, interactive-rebase against `chore/stage-unstaged-2026-03-01`. Default to keeping per-task commits — reviewers prefer granularity.

- [ ] **Step 2: Push feature branch**

```bash
git push -u origin feat/unify-permit-pdf
```

- [ ] **Step 3: Open PR against `chore/stage-unstaged-2026-03-01-uat`**

Use `gh pr create --base chore/stage-unstaged-2026-03-01-uat --head feat/unify-permit-pdf`. Body should include the 16-scenario matrix results from Task 13 Step 5.

- [ ] **Step 4: Clean up worktree after merge**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git worktree remove ../waterpermit-unify-permit-pdf
git branch -d feat/unify-permit-pdf   # after merge
```

---

## Acceptance Criteria

- `grep -n "setFullYear" lib/pdf-permit-server.ts app/api/staff/applications/\[id\]/permit-preview/route.ts` returns no output.
- `grep -rn "generateDigitalWaterPermit\|render.*PermitPdfBlob" . --include="*.ts" --include="*.tsx"` returns no output (no references left).
- `wc -l lib/pdf-generator.ts` is well under 1,000 (target ≈ 700).
- `npx tsc --noEmit && npm run build` both succeed.
- `/api/test/permit-pdf?variant=abstraction_organization&appType=standard` returns a 2-page PDF; page 2 is Kinyarwanda.
- `/api/test/permit-pdf?variant=abstraction_organization&appType=standard&issueDate=2024-02-29` shows validity `"valid from 29/02/2024 to 28/02/2029."`
- All 4 staff preview tabs surface an error card with retry instead of a perpetual spinner when the endpoint returns a non-200.
- The 16-scenario matrix passes visual QA.
