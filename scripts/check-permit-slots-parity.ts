/**
 * Parity verification for the permit slot catalogue.
 *
 * For each fixture (one per variant) and each slot in the catalogue, computes
 * the slot's `defaultResolver` output and compares it to the EXPECTED string
 * — which is the literal that `lib/pdf-permit-server.ts` emitted for that
 * position before the Phase 2 slot refactor (commit 208660a).
 *
 * If a slot's default doesn't match its expected string, the slot catalogue
 * has drifted from the renderer's prior output and the next regenerated PDF
 * would visibly change — even with no overrides set. That MUST NOT happen
 * (spec §3 + §10).
 *
 * Run with: npx tsx scripts/check-permit-slots-parity.ts
 *
 * Exits non-zero on any mismatch. Used in lieu of a unit-test framework.
 */

import "../lib/document-slots"; // ensures permit-slots is registered
import { resolveSlotText } from "../lib/document-slots/resolver";
import type {
  PermitSlotContextExtras,
  SlotResolverContext,
} from "../lib/document-slots/types";
import {
  fmtDMY,
  fmtNum,
  formatIntaraOrUmujyiWaKigali,
  fmtProvince,
  resolveActivities,
  resolveActivitiesKinyarwanda,
  resolveAdminLocation,
  resolveApplicantName,
  resolveArea,
  resolveEnglishSystemLabel,
  resolveFlowRate,
  resolveIdNumber,
  resolveKinyarwandaSystemType,
  resolveLakeName,
  resolveLatLng,
  resolveOrgAddress,
  resolveOrgAddressKinyarwanda,
  resolveOrgRep,
  resolvePermitTitleNumber,
  resolveSystemType,
  resolveVolumes,
  resolveWaterSourceName,
  type PermitApplication,
} from "../lib/permit/permit-text-data";
import { getEffectiveInternalNotes } from "../lib/document-overrides";
import { selectPermitVariant } from "../lib/permit-variant";

let failures = 0;
let passes = 0;

function eq(actual: string, expected: string, label: string): void {
  if (actual === expected) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    // Show first diff char
    let i = 0;
    while (i < Math.min(actual.length, expected.length) && actual[i] === expected[i]) i++;
    console.error(`    first diff at index ${i}: expected ${JSON.stringify(expected.slice(Math.max(0, i - 5), i + 25))}, got ${JSON.stringify(actual.slice(Math.max(0, i - 5), i + 25))}`);
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ISSUE_DATE = new Date("2026-04-23T00:00:00Z");
const EXPIRY_DATE = new Date("2031-04-23T00:00:00Z");
const PERMIT_NUMBER = "000026";

function buildPermitCtx(app: PermitApplication): SlotResolverContext {
  const variant = selectPermitVariant(app as Parameters<typeof selectPermitVariant>[0]);
  const permit: PermitSlotContextExtras = {
    permitNumber: PERMIT_NUMBER,
    issueDate: ISSUE_DATE,
    expiryDate: EXPIRY_DATE,
    isModified: false,
    skipQr: false,
    headerYear: ISSUE_DATE.getFullYear(),
  };
  return {
    application: app as unknown as SlotResolverContext["application"],
    applicant: (app.applicant ?? null) as Record<string, unknown> | null,
    effectiveNotes: getEffectiveInternalNotes(app.internal_notes),
    variant,
    permit,
  };
}

// Fixture: abstraction_individual
const fxAbsInd: PermitApplication = {
  id: "fx-1",
  application_number: "RWB-2026-000001",
  project_title: "Test irrigation",
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

// Fixture: abstraction_organization
const fxAbsOrg: PermitApplication = {
  id: "fx-2",
  application_number: "RWB-2026-000002",
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
    nameRepresentative: "Mukamana Alice",
    representativeTitle: "Managing Director",
    officeProvince: "Kigali",
    officeDistrict: "Gasabo",
    officeSector: "Kacyiru",
    waterSourceLatitude: -1.9441,
    waterSourceLongitude: 30.0619,
  }),
  water_taking_method: "pump",
  applicant: {
    company_name: "Rwanda Industries Ltd",
    first_name: "",
    last_name: "",
    email: "info@rwindustries.rw",
    account_type: "organization",
    company_address: "Kacyiru, Gasabo",
  },
};

// Fixture: concession_individual (fish farming triggers concession)
const fxConcInd: PermitApplication = {
  id: "fx-3",
  application_number: "RWB-2026-000003",
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

// Fixture: concession_organization
const fxConcOrg: PermitApplication = {
  id: "fx-4",
  application_number: "RWB-2026-000004",
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
    nameRepresentative: "Uwimana Marie",
    representativeTitle: "CEO",
    waterSourceProvince: "Western",
    waterSourceDistrict: "Rubavu",
    waterSourceSector: "Gisenyi",
  }),
  applicant: {
    company_name: "Kivu Resorts Ltd",
    first_name: "",
    last_name: "",
    email: "info@kivuresorts.rw",
    account_type: "organization",
  },
};

// ─── Expected strings (lifted verbatim from pre-Phase-2 pdf-permit-server.ts) ─

// Shared closing date — depends on issueDate (fixed in tests)
const expectedClosingDate = `Done at Kigali/Bikorewe i Kigali, On/kuwa ${fmtDMY(ISSUE_DATE)}`;
const expectedSignatureLine = "Signature/Umukono: ........................................";
const expectedSignatory = "Director General / Umuyobozi Mukuru";
const expectedQrDisclaimer =
  "Scan to verify. This digital permit is only valid if the information on it matches the water use permit registry.";
const expectedDraftBanner = "DRAFT — NOT YET ISSUED";
const expectedModifiedBadge = "MODIFIED PERMIT";

// ─── Run parity checks ───────────────────────────────────────────────────────

group("shared slots (variant-independent)", () => {
  // Use any fixture's ctx; shared resolvers don't read variant-specific data.
  const ctx = buildPermitCtx(fxAbsInd);
  eq(resolveSlotText("permit.shared.modified_badge.en", ctx), expectedModifiedBadge, "modified_badge.en");
  eq(resolveSlotText("permit.shared.closing.signature_line.bilingual", ctx), expectedSignatureLine, "closing.signature_line.bilingual");
  eq(resolveSlotText("permit.shared.closing.signatory.bilingual", ctx), expectedSignatory, "closing.signatory.bilingual");
  eq(resolveSlotText("permit.shared.closing.date.bilingual", ctx), expectedClosingDate, "closing.date.bilingual");
  eq(resolveSlotText("permit.shared.footer.qr_disclaimer.en", ctx), expectedQrDisclaimer, "footer.qr_disclaimer.en");
  eq(resolveSlotText("permit.shared.footer.draft_banner.en", ctx), expectedDraftBanner, "footer.draft_banner.en");
});

group("abstraction_individual", () => {
  const ctx = buildPermitCtx(fxAbsInd);
  const headerYear = ISSUE_DATE.getFullYear();
  const titleNum = resolvePermitTitleNumber(PERMIT_NUMBER, headerYear);

  // Title: pre-refactor → `WATER USE PERMIT N° ${titleNum}`
  eq(resolveSlotText("permit.abstraction_individual.title.en", ctx),
     `WATER USE PERMIT N° ${titleNum}`, "title.en");

  // Para 1
  eq(resolveSlotText("permit.abstraction_individual.en.para_1", ctx),
     `Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,`,
     "en.para_1");

  // Para 2: replicate pre-refactor template literal exactly.
  const name = resolveApplicantName(fxAbsInd);
  const idNum = resolveIdNumber(fxAbsInd);
  const wsName = resolveWaterSourceName(fxAbsInd);
  const loc = resolveAdminLocation(fxAbsInd);
  const { lat, lng } = resolveLatLng(fxAbsInd);
  const sysType = resolveSystemType(fxAbsInd);
  const vols = resolveVolumes(fxAbsInd);
  const yearlyStr = vols.yearly != null ? `${fmtNum(vols.yearly)} m³/year` : "N/A m³/year";
  const acts = resolveActivities(fxAbsInd);
  const expectedPara2 = `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to abstract water from ${wsName} located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysType} with a flow rate of ${yearlyStr}. Water abstracted will be used for ${acts}.`;
  eq(resolveSlotText("permit.abstraction_individual.en.para_2", ctx), expectedPara2, "en.para_2");

  // Para 3
  eq(resolveSlotText("permit.abstraction_individual.en.para_3", ctx),
     `This water use permit is valid from ${fmtDMY(ISSUE_DATE)} to ${fmtDMY(EXPIRY_DATE)}.`,
     "en.para_3");

  // Para 4
  eq(resolveSlotText("permit.abstraction_individual.en.para_4", ctx),
     `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
     "en.para_4");
});

group("concession_individual", () => {
  const ctx = buildPermitCtx(fxConcInd);
  const headerYear = ISSUE_DATE.getFullYear();
  const titleNum = resolvePermitTitleNumber(PERMIT_NUMBER, headerYear);

  eq(resolveSlotText("permit.concession_individual.title.en", ctx),
     `WATER USE PERMIT N° ${titleNum}`, "title.en");

  eq(resolveSlotText("permit.concession_individual.en.para_1", ctx),
     `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
     "en.para_1");

  const name = resolveApplicantName(fxConcInd);
  const idNum = resolveIdNumber(fxConcInd);
  const acts = resolveActivities(fxConcInd);
  const area = resolveArea(fxConcInd);
  const areaStr = area != null ? `${fmtNum(area)} Hectare` : "N/A Hectare";
  const lake = resolveLakeName(fxConcInd);
  const loc = resolveAdminLocation(fxConcInd);
  const prov = fmtProvince(loc.province);
  const expectedPara2 = `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to carry out ${acts} on the surface area of ${areaStr} (Concession area) in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov} as shown on the attached map. This permit applies for activities conducted solely within the water body.`;
  eq(resolveSlotText("permit.concession_individual.en.para_2", ctx), expectedPara2, "en.para_2");

  eq(resolveSlotText("permit.concession_individual.en.para_3", ctx),
     `This water use permit is valid from ${fmtDMY(ISSUE_DATE)} to ${fmtDMY(EXPIRY_DATE)}.`,
     "en.para_3");

  eq(resolveSlotText("permit.concession_individual.en.para_4", ctx),
     `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
     "en.para_4");
});

group("concession_organization", () => {
  const ctx = buildPermitCtx(fxConcOrg);
  const headerYear = ISSUE_DATE.getFullYear();
  const titleNum = resolvePermitTitleNumber(PERMIT_NUMBER, headerYear);

  eq(resolveSlotText("permit.concession_organization.title.en", ctx),
     `WATER USE PERMIT N° ${titleNum}`, "title.en");

  eq(resolveSlotText("permit.concession_organization.en.para_1", ctx),
     `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
     "en.para_1");

  // Para 2 — replicate the pre-refactor inline computation of wsLocParts +
  // template literal.
  const orgName = resolveApplicantName(fxConcOrg);
  const rep = resolveOrgRep(fxConcOrg);
  const acts = resolveActivities(fxConcOrg);
  const area = resolveArea(fxConcOrg);
  const areaStr = area != null ? `${fmtNum(area)} hectares` : "N/A hectares";
  const lake = resolveLakeName(fxConcOrg);
  const loc = resolveAdminLocation(fxConcOrg);
  const prov = fmtProvince(loc.province);
  const notes = getEffectiveInternalNotes(fxConcOrg.internal_notes);
  const wsSector = typeof notes?.waterSourceSector === "string" ? notes.waterSourceSector.trim() : "";
  const wsDist = typeof notes?.waterSourceDistrict === "string" ? notes.waterSourceDistrict.trim() : "";
  const wsProv = typeof notes?.waterSourceProvince === "string" ? notes.waterSourceProvince.trim() : "";
  const wsLocParts = [
    wsSector ? `${wsSector} Sector` : null,
    wsDist ? `${wsDist} District` : null,
    wsProv ? (wsProv.toLowerCase() === "kigali" ? "City OF Kigali" : `${wsProv} Province`) : null,
  ].filter(Boolean).join(", ") || "N/A";
  const expectedPara2 = `\u201C${orgName}\u201D, with its water source location as follows: ${wsLocParts}; represented by ${rep.name}; is authorized to carry out ${acts} on the surface area of ${areaStr} in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov}, as shown on the attached map. This permit applies to activities conducted solely within the water body.`;
  eq(resolveSlotText("permit.concession_organization.en.para_2", ctx), expectedPara2, "en.para_2");

  eq(resolveSlotText("permit.concession_organization.en.para_3", ctx),
     `This water use permit is valid from ${fmtDMY(ISSUE_DATE)} to ${fmtDMY(EXPIRY_DATE)}.`,
     "en.para_3");

  eq(resolveSlotText("permit.concession_organization.en.para_4", ctx),
     `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
     "en.para_4");
});

group("abstraction_organization (bilingual)", () => {
  const ctx = buildPermitCtx(fxAbsOrg);
  const headerYear = ISSUE_DATE.getFullYear();
  const titleNum = resolvePermitTitleNumber(PERMIT_NUMBER, headerYear);

  eq(resolveSlotText("permit.abstraction_organization.title.en", ctx),
     `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${titleNum}`, "title.en");

  eq(resolveSlotText("permit.abstraction_organization.en.para_1", ctx),
     `Pursuant to **Law N°49/2018 of 13/08/2018** determining the use and management of water resources in Rwanda,`,
     "en.para_1");

  // EN para_2
  const orgName = resolveApplicantName(fxAbsOrg);
  const orgAddr = resolveOrgAddress(fxAbsOrg);
  const rep = resolveOrgRep(fxAbsOrg);
  const wsName = resolveWaterSourceName(fxAbsOrg);
  const loc = resolveAdminLocation(fxAbsOrg);
  const { lat, lng } = resolveLatLng(fxAbsOrg);
  const sysLabel = resolveEnglishSystemLabel(fxAbsOrg);
  const flowRate = resolveFlowRate(fxAbsOrg);
  const acts = resolveActivities(fxAbsOrg);
  const provLabel = loc.province.toLowerCase() === "kigali" ? "City OF Kigali" : `${loc.province} Province`;
  const expectedEnPara2 = `\u201C**${orgName}**\u201D with its registered office address as follows: **${orgAddr}**; represented by ${rep.name} \u201C**${rep.title}**\u201D, is authorized to abstract water from **${wsName}** located in ${provLabel}, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysLabel} at a flow rate of **${flowRate}**. Water abstracted will be used for **${acts}**.`;
  eq(resolveSlotText("permit.abstraction_organization.en.para_2", ctx), expectedEnPara2, "en.para_2");

  eq(resolveSlotText("permit.abstraction_organization.en.para_3", ctx),
     `This water use permit is valid from ${fmtDMY(ISSUE_DATE)} to ${fmtDMY(EXPIRY_DATE)}.`,
     "en.para_3");

  eq(resolveSlotText("permit.abstraction_organization.en.para_4", ctx),
     `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
     "en.para_4");

  // RW para_1
  eq(resolveSlotText("permit.abstraction_organization.rw.para_1", ctx),
     "Hashingiwe ku Itegeko **N° 49/2018 ryo ku wa 13/08/2018** rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,",
     "rw.para_1");

  // RW para_2
  const systemTypeRw = resolveKinyarwandaSystemType(fxAbsOrg);
  const actsRw = resolveActivitiesKinyarwanda(fxAbsOrg);
  const orgAddrRw = resolveOrgAddressKinyarwanda(fxAbsOrg);
  const expectedRwPara2 =
    `"**${orgName}**" ifite ibiro biherereye mu **${orgAddrRw}**; ihagarariwe na ${rep.name} "**${rep.title}**", yemerewe ${systemTypeRw} amazi angana na **${flowRate}**, ` +
    `ava ku **${wsName}** iherereye mu ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
    `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, ` +
    `Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}. Aya mazi yemerewe gukoreshwa mu **${actsRw}**.`;
  eq(resolveSlotText("permit.abstraction_organization.rw.para_2", ctx), expectedRwPara2, "rw.para_2");

  // RW para_3
  eq(resolveSlotText("permit.abstraction_organization.rw.para_3", ctx),
     `Uru ruhushya rufite agaciro kuva ${fmtDMY(ISSUE_DATE)} kugeza ${fmtDMY(EXPIRY_DATE)}.`,
     "rw.para_3");

  // RW para_4
  eq(resolveSlotText("permit.abstraction_organization.rw.para_4", ctx),
     "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.",
     "rw.para_4");
});

// ─── Edge-case fixture coverage ──────────────────────────────────────────────
//
// The reviewer (Phase 2 code review) flagged that the four "happy-path"
// fixtures above don't exercise several `defaultResolver` fall-through
// branches. Add fixtures that hit:
//   - lat/lng = "N/A"   (no coordinates → no `°` suffix)
//   - area    = null    (no concession_area + no _assessorAdjustments)
//   - vols.yearly = null (no estimated/recommended volume → "N/A m³/year")
//   - org rep missing   (rep.name fallback to applicant first/last/N/A)
//   - province = "Kigali" for concession_individual (Umujyi-wa-Kigali branch
//     is exercised for abstraction_organization at line 990 of the renderer
//     but concession variants use `fmtProvince` → "CITY OF KIGALI" branch)
//   - transfer application — `application_type === "transfer"` triggers the
//     transferFormData branches in resolveApplicantName / resolveOrgRep /
//     resolveOrgAddress / resolveActivities / resolvePermitDuration
//
// Every fall-through string is asserted against the literal that the
// pre-Phase-2 renderer would have emitted.

// Fixture: abstraction_individual with NO coordinates and NO volume
const fxAbsIndMinimal: PermitApplication = {
  ...fxAbsInd,
  id: "fx-1b",
  estimated_usage_volume: 0,
  max_yearly_volume_m3: undefined,
  max_daily_volume_m3: undefined,
  assessor_recommended_volume_m3: undefined,
  internal_notes: JSON.stringify({}), // strips lat/lng + assessor adjustments
};

// Fixture: concession_individual in Kigali with NO concession_area
const fxConcIndKigaliNoArea: PermitApplication = {
  ...fxConcInd,
  id: "fx-3b",
  province: "Kigali",
  concession_area: undefined,
  internal_notes: JSON.stringify({ nameSourceWater: "Lake Muhazi" }),
};

// Fixture: concession_organization with no representative + no waterSource* notes
const fxConcOrgMinimal: PermitApplication = {
  ...fxConcOrg,
  id: "fx-4b",
  concession_area: undefined,
  internal_notes: JSON.stringify({ nameSourceWater: "Lake Kivu" }),
  applicant: { ...fxConcOrg.applicant, first_name: "", last_name: "" },
};

// Fixture: abstraction_organization with no rep + no coordinates (rep.name → "N/A")
const fxAbsOrgMinimal: PermitApplication = {
  ...fxAbsOrg,
  id: "fx-2b",
  estimated_usage_volume: 0,
  max_yearly_volume_m3: undefined,
  max_daily_volume_m3: undefined,
  assessor_recommended_volume_m3: undefined,
  internal_notes: JSON.stringify({}),
  applicant: { ...fxAbsOrg.applicant, first_name: "", last_name: "" },
};

group("abstraction_individual — N/A branches (no coords, no volume)", () => {
  const ctx = buildPermitCtx(fxAbsIndMinimal);
  const name = resolveApplicantName(fxAbsIndMinimal);
  const idNum = resolveIdNumber(fxAbsIndMinimal);
  const wsName = resolveWaterSourceName(fxAbsIndMinimal);
  const loc = resolveAdminLocation(fxAbsIndMinimal);
  // lat / lng both "N/A" — no `°` suffix should be appended.
  eq(resolveLatLng(fxAbsIndMinimal).lat, "N/A", "lat is N/A");
  eq(resolveLatLng(fxAbsIndMinimal).lng, "N/A", "lng is N/A");
  // vols.yearly null → "N/A m³/year"
  const vols = resolveVolumes(fxAbsIndMinimal);
  eq(vols.yearly === null ? "ok" : "fail", "ok", "vols.yearly is null");
  const sysType = resolveSystemType(fxAbsIndMinimal);
  const acts = resolveActivities(fxAbsIndMinimal);
  const expected = `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to abstract water from ${wsName} located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: N/A, Longitude: N/A, by a ${sysType} with a flow rate of N/A m³/year. Water abstracted will be used for ${acts}.`;
  eq(resolveSlotText("permit.abstraction_individual.en.para_2", ctx), expected, "en.para_2 (N/A branches)");
});

group("concession_individual — Kigali province + N/A area", () => {
  const ctx = buildPermitCtx(fxConcIndKigaliNoArea);
  const name = resolveApplicantName(fxConcIndKigaliNoArea);
  const idNum = resolveIdNumber(fxConcIndKigaliNoArea);
  const acts = resolveActivities(fxConcIndKigaliNoArea);
  const lake = resolveLakeName(fxConcIndKigaliNoArea);
  const loc = resolveAdminLocation(fxConcIndKigaliNoArea);
  // fmtProvince("Kigali") → "CITY OF KIGALI" (uppercase). Verify.
  eq(fmtProvince(loc.province), "CITY OF KIGALI", "fmtProvince(Kigali)");
  const expected = `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to carry out ${acts} on the surface area of N/A Hectare (Concession area) in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, CITY OF KIGALI as shown on the attached map. This permit applies for activities conducted solely within the water body.`;
  eq(resolveSlotText("permit.concession_individual.en.para_2", ctx), expected, "en.para_2 (Kigali + N/A area)");
});

group("concession_organization — minimal data (rep fallback, N/A area)", () => {
  const ctx = buildPermitCtx(fxConcOrgMinimal);
  const orgName = resolveApplicantName(fxConcOrgMinimal);
  const rep = resolveOrgRep(fxConcOrgMinimal);
  // No nameRepresentative + empty applicant first/last → rep.name === "N/A"
  eq(rep.name, "N/A", "rep.name fallback to N/A");
  eq(rep.title, "Representative", "rep.title default");
  const acts = resolveActivities(fxConcOrgMinimal);
  const lake = resolveLakeName(fxConcOrgMinimal);
  const loc = resolveAdminLocation(fxConcOrgMinimal);
  const prov = fmtProvince(loc.province);
  // No waterSourceSector/District/Province in notes → wsLocParts === "N/A"
  const expected = `\u201C${orgName}\u201D, with its water source location as follows: N/A; represented by ${rep.name}; is authorized to carry out ${acts} on the surface area of N/A hectares in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov}, as shown on the attached map. This permit applies to activities conducted solely within the water body.`;
  eq(resolveSlotText("permit.concession_organization.en.para_2", ctx), expected, "en.para_2 (rep+area+ws fallback)");
});

group("abstraction_organization — minimal data (no coords, no volume, fallback rep)", () => {
  const ctx = buildPermitCtx(fxAbsOrgMinimal);
  const orgName = resolveApplicantName(fxAbsOrgMinimal);
  const orgAddr = resolveOrgAddress(fxAbsOrgMinimal);
  const orgAddrRw = resolveOrgAddressKinyarwanda(fxAbsOrgMinimal);
  const rep = resolveOrgRep(fxAbsOrgMinimal);
  const wsName = resolveWaterSourceName(fxAbsOrgMinimal);
  const loc = resolveAdminLocation(fxAbsOrgMinimal);
  const sysLabel = resolveEnglishSystemLabel(fxAbsOrgMinimal);
  const flowRate = resolveFlowRate(fxAbsOrgMinimal);
  const acts = resolveActivities(fxAbsOrgMinimal);
  const provLabel = loc.province.toLowerCase() === "kigali" ? "City OF Kigali" : `${loc.province} Province`;
  const expectedEn2 = `\u201C**${orgName}**\u201D with its registered office address as follows: **${orgAddr}**; represented by ${rep.name} \u201C**${rep.title}**\u201D, is authorized to abstract water from **${wsName}** located in ${provLabel}, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: N/A, Longitude: N/A, by a ${sysLabel} at a flow rate of **${flowRate}**. Water abstracted will be used for **${acts}**.`;
  eq(resolveSlotText("permit.abstraction_organization.en.para_2", ctx), expectedEn2, "en.para_2 (no coords, fallback rep)");

  const systemTypeRw = resolveKinyarwandaSystemType(fxAbsOrgMinimal);
  const actsRw = resolveActivitiesKinyarwanda(fxAbsOrgMinimal);
  // Province is "Kigali" → formatIntaraOrUmujyiWaKigali returns "Umujyi wa Kigali"
  eq(formatIntaraOrUmujyiWaKigali(loc.province), "Umujyi wa Kigali", "formatIntaraOrUmujyiWaKigali(Kigali)");
  const expectedRw2 =
    `"**${orgName}**" ifite ibiro biherereye mu **${orgAddrRw}**; ihagarariwe na ${rep.name} "**${rep.title}**", yemerewe ${systemTypeRw} amazi angana na **${flowRate}**, ` +
    `ava ku **${wsName}** iherereye mu ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
    `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): N/A, ` +
    `Lonjitide (Longitude): N/A. Aya mazi yemerewe gukoreshwa mu **${actsRw}**.`;
  eq(resolveSlotText("permit.abstraction_organization.rw.para_2", ctx), expectedRw2, "rw.para_2 (no coords, Umujyi wa Kigali, fallback rep)");
});

group("permit.shared.closing.date — placeholder when ctx.permit missing", () => {
  // Build a ctx WITHOUT the permit namespace (mirrors what the editor
  // preview API will do in Phase 3 when there is no issuance yet).
  const ctxNoPermit: SlotResolverContext = {
    application: fxAbsInd as unknown as SlotResolverContext["application"],
    applicant: fxAbsInd.applicant as unknown as Record<string, unknown>,
    effectiveNotes: getEffectiveInternalNotes(fxAbsInd.internal_notes),
    variant: selectPermitVariant(fxAbsInd as Parameters<typeof selectPermitVariant>[0]),
  };
  eq(
    resolveSlotText("permit.shared.closing.date.bilingual", ctxNoPermit),
    "Done at Kigali/Bikorewe i Kigali, On/kuwa [ISSUE_DATE]",
    "labelled placeholder when no permit ctx",
  );
});

// ─── Override-wins regression check ──────────────────────────────────────────

group("override beats default for permit slots", () => {
  const overrideText = "TEST — assessor's custom paragraph 3 wording.";
  const editor = { id: "u-1", name: "Override Tester", email: "test@rwb.rw", role: "assessor" };
  const appWithOverride: PermitApplication = {
    ...fxAbsInd,
    internal_notes: JSON.stringify({
      ...JSON.parse(fxAbsInd.internal_notes!),
      document_text_overrides: {
        version: 1,
        updatedAt: "2026-04-23T10:00:00Z",
        updatedBy: editor,
        values: {
          "permit.abstraction_individual.en.para_3": {
            text: overrideText,
            editedAt: "2026-04-23T10:00:00Z",
            editedBy: editor,
          },
        },
      },
    }),
  };
  const ctx = buildPermitCtx(appWithOverride);
  eq(resolveSlotText("permit.abstraction_individual.en.para_3", ctx), overrideText, "override beats default");
  // Sibling slot in same variant unaffected.
  eq(resolveSlotText("permit.abstraction_individual.en.para_4", ctx),
     `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
     "sibling unaffected");
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
