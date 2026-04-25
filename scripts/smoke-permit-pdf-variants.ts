/**
 * Smoke render: produce a PDF for each permit variant from a representative
 * fixture and assert the output fits on a single A4-landscape page.
 *
 * The four variants share the same `PERMIT_MARGIN_X` and `contentBottomY`
 * constants (defined in `lib/pdf-permit-server.ts`) but tune their own
 * `lineGap`/`paraGap` independently. This script catches regressions where
 * a future tightening (or relaxation) of the shared constants silently
 * breaks one variant's pagination — the case the parity script can't see
 * (it doesn't actually render PDFKit, only inspects slot defaults).
 *
 * Requires `pdfinfo` (poppler-utils). Skips the page-count assertion
 * gracefully if `pdfinfo` is not on PATH so the script remains useful in
 * CI environments without poppler.
 *
 * Run with: npx tsx scripts/smoke-permit-pdf-variants.ts
 *
 * Exits non-zero if any variant produces more than one page (or a render
 * error). Prints the file path of every produced PDF so the run can be
 * inspected manually if a smoke fails.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  generatePermitPdfBuffer,
  type PermitApplication,
} from "../lib/pdf-permit-server";

const ISSUE_DATE = new Date("2026-04-23T00:00:00Z");
const EXPIRY_DATE = new Date("2031-04-23T00:00:00Z");
const PERMIT_NUMBER = "000999/RWB/2026";

// Fixtures — kept self-contained on purpose. They are deliberately on the
// "rich" side (long org names, multiple activities, multi-village rep) so
// that a regression in `contentBottomY` or paragraph tightening surfaces
// here rather than only on production data.

const fxAbsInd: PermitApplication = {
  id: "smoke-1",
  application_number: "RWB-SMOKE-0001",
  project_title: "Smoke irrigation",
  status: "approved",
  application_type: "new",
  water_source: "lake",
  water_purpose: "irrigation",
  estimated_usage_volume: 50000,
  usage_unit: "m3",
  intended_activities: ["irrigation"],
  province: "Eastern",
  district: "Kayonza",
  sector: "Mukarange",
  cell: "Bwiza",
  village: "Karambi",
  proposed_duration_years: 5,
  internal_notes: JSON.stringify({
    waterSourceLatitude: -1.7654,
    waterSourceLongitude: 30.6543,
  }),
  water_taking_method: "pump",
  applicant: {
    first_name: "Jean",
    last_name: "Mugisha",
    email: "jean@example.rw",
    account_type: "individual",
    id_number: "1198012345678910",
  },
};

const fxAbsOrg: PermitApplication = {
  id: "smoke-2",
  application_number: "RWB-SMOKE-0002",
  project_title: "Industrial water supply",
  status: "approved",
  application_type: "new",
  water_source: "river",
  water_purpose: "industry",
  estimated_usage_volume: 250000,
  usage_unit: "m3",
  intended_activities: ["industry"],
  province: "Kigali",
  district: "Gasabo",
  sector: "Remera",
  cell: "Rukiri I",
  village: "Sezerano",
  proposed_duration_years: 7,
  internal_notes: JSON.stringify({
    nameRepresentative: "Mukamana Alice Uwimana",
    representativeTitle: "Managing Director",
    officeProvince: "Kigali",
    officeDistrict: "Gasabo",
    officeSector: "Kacyiru",
    waterSourceLatitude: -1.9441,
    waterSourceLongitude: 30.0619,
  }),
  water_taking_method: "pump",
  applicant: {
    company_name: "Rwanda Industrial Manufacturing Co. Ltd",
    first_name: "",
    last_name: "",
    email: "info@rwindustries.rw",
    account_type: "organization",
    company_address: "Kacyiru, Gasabo",
  },
};

const fxConcInd: PermitApplication = {
  id: "smoke-3",
  application_number: "RWB-SMOKE-0003",
  project_title: "Fish farming Lake Muhazi",
  status: "approved",
  application_type: "new",
  water_source: "lake_muhazi",
  water_purpose: "fish_farming_lakes",
  estimated_usage_volume: 0,
  usage_unit: "m3",
  intended_activities: ["fish_farming_lakes"],
  province: "Eastern",
  district: "Rwamagana",
  sector: "Muhazi",
  cell: "Nyamirama",
  village: "Kabukuba",
  concession_area: 1.5,
  proposed_duration_years: 5,
  internal_notes: JSON.stringify({
    nameSourceWater: "Lake Muhazi",
  }),
  applicant: {
    first_name: "Pierre",
    last_name: "Habimana",
    email: "pierre@example.rw",
    account_type: "individual",
    id_number: "1199001234567890",
  },
};

const fxConcOrg: PermitApplication = {
  id: "smoke-4",
  application_number: "RWB-SMOKE-0004",
  project_title: "Lake Kivu recreation",
  status: "approved",
  application_type: "new",
  water_source: "lake_kivu",
  water_purpose: "recreation_activities",
  estimated_usage_volume: 0,
  usage_unit: "m3",
  intended_activities: ["recreation_activities"],
  province: "Western",
  district: "Rubavu",
  sector: "Gisenyi",
  cell: "Mbugangari",
  village: "Bugoyi",
  concession_area: 3.2,
  proposed_duration_years: 10,
  internal_notes: JSON.stringify({
    nameSourceWater: "Lake Kivu",
    nameRepresentative: "Uwimana Marie Claire",
    representativeTitle: "Chief Executive Officer",
    waterSourceProvince: "Western",
    waterSourceDistrict: "Rubavu",
    waterSourceSector: "Gisenyi",
  }),
  applicant: {
    company_name: "Kivu Premier Resorts and Hospitality Ltd",
    first_name: "",
    last_name: "",
    email: "info@kivuresorts.rw",
    account_type: "organization",
  },
};

interface VariantSmoke {
  label: string;
  fixture: PermitApplication;
}

const VARIANTS: VariantSmoke[] = [
  { label: "abstraction_individual", fixture: fxAbsInd },
  { label: "abstraction_organization", fixture: fxAbsOrg },
  { label: "concession_individual", fixture: fxConcInd },
  { label: "concession_organization", fixture: fxConcOrg },
];

let pdfinfoAvailable = true;
try {
  execFileSync("pdfinfo", ["-v"], { stdio: ["ignore", "ignore", "ignore"] });
} catch {
  pdfinfoAvailable = false;
}

function countPages(file: string): number {
  const out = execFileSync("pdfinfo", [file], { encoding: "utf-8" });
  const m = out.match(/^Pages:\s+(\d+)/m);
  if (!m) {
    throw new Error("pdfinfo did not report a page count");
  }
  return Number(m[1]);
}

async function smokeOne(
  outDir: string,
  v: VariantSmoke,
): Promise<{ ok: boolean; pages: number | null; file: string }> {
  const buf = await generatePermitPdfBuffer({
    application: v.fixture,
    permitNumber: PERMIT_NUMBER,
    issuedDate: ISSUE_DATE,
    expiryDate: EXPIRY_DATE,
    isModified: false,
    skipQr: false,
  });
  const file = path.join(outDir, `${v.label}.pdf`);
  writeFileSync(file, buf);

  if (!pdfinfoAvailable) {
    return { ok: true, pages: null, file };
  }
  const pages = countPages(file);
  return { ok: pages === 1, pages, file };
}

async function main(): Promise<void> {
  console.log(`Smoke-rendering ${VARIANTS.length} permit variants...`);
  if (!pdfinfoAvailable) {
    console.log("⚠  pdfinfo not on PATH — skipping page-count assertion (PDFs still produced)");
  }
  const outDir = mkdtempSync(path.join(tmpdir(), "permit-smoke-"));
  console.log(`Output dir: ${outDir}\n`);

  let allOk = true;
  for (const v of VARIANTS) {
    try {
      const r = await smokeOne(outDir, v);
      if (r.pages == null) {
        console.log(`  ◯ ${v.label}: rendered (${r.file}) — page count not verified`);
        continue;
      }
      if (r.ok) {
        console.log(`  ✓ ${v.label}: 1 page (${r.file})`);
      } else {
        allOk = false;
        console.error(`  ✗ ${v.label}: expected 1 page, got ${r.pages} (${r.file})`);
      }
    } catch (err) {
      allOk = false;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${v.label}: render error: ${message}`);
    }
  }

  if (!allOk) {
    console.error("\nSMOKE FAILED — at least one variant did not fit on a single page.");
    process.exit(1);
  }
  console.log("\nAll variants rendered to a single page ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
