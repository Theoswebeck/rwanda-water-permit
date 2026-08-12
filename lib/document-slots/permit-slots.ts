/**
 * Permit document slot catalogue.
 *
 * Each slot's `defaultResolver` supplies the template text the renderer in
 * `lib/pdf-permit-server.ts` emits at that position, including the
 * template's automatic `**bold**` emphasis on key values (RWB feedback
 * 2026-08 — assessors must never have to type emphasis markers themselves).
 * `scripts/check-permit-slots-parity.ts` asserts the exact expected string
 * for every slot; keep the two in lockstep.
 *
 * Self-registers on import — `lib/document-slots/index.ts` imports this file
 * for its registration side-effect.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §7.1
 *
 * ---
 *
 * RETIRED SLOT IDS — DO NOT REUSE
 *
 * Slot ids are the primary key for stored override entries. Once a release
 * has shipped a slot, its id must never be re-used for a different purpose,
 * because any application that has an override saved under that id would
 * silently inherit the new slot's content (see `types.ts` JSDoc on
 * `DocumentTextSlot.id`).
 *
 * The following ids were once registered and are now retired:
 *
 *   - `permit.shared.closing.signature_line.bilingual`
 *       Removed in commit `c0c3afa` (2026-04). Was the
 *       "Signature/Umukono: ……" placeholder line above the closing block.
 *       Removal SQL for orphan override entries is documented in
 *       `docs/superpowers/specs/2026-04-23-document-text-editor-design.md`.
 *       The `resolveSlotsForEditor` helper already filters out entries
 *       whose slot id is no longer registered, so the renderer and the
 *       editor both ignore any leftover override for this id.
 */

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
  resolveFlowRateKinyarwanda,
  resolveIdNumber,
  resolveIsGroundwater,
  resolveKinyarwandaSystemType,
  resolvePumpingRateM3Day,
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
} from "@/lib/permit/permit-text-data";
import { registerSlots } from "./registry";
import type {
  DocumentTextSlot,
  PermitSlotContextExtras,
  PermitVariant,
  SlotResolverContext,
} from "./types";

// ─── Group labels (used by the editor UI section headers) ────────────────────

const GROUP = {
  HEADER: "Header",
  AUTH_EN: "Authorization (English)",
  AUTH_RW: "Authorization (Kinyarwanda)",
  CLOSING: "Closing block",
  FOOTER: "Footer",
};

// ─── Helpers used by every variant resolver ──────────────────────────────────

function permitOf(ctx: SlotResolverContext): PermitSlotContextExtras | null {
  return ctx.permit ?? null;
}

function appOf(ctx: SlotResolverContext): PermitApplication {
  return ctx.application as unknown as PermitApplication;
}

function placeholder(label: string): string {
  return `[${label}]`;
}

// ─── Shared (cross-variant) slots ────────────────────────────────────────────

const sharedSlots: DocumentTextSlot[] = [
  {
    id: "permit.shared.modified_badge.en",
    documentKind: "permit",
    language: "en",
    group: GROUP.HEADER,
    label: "Modified-permit badge text",
    inline: true,
    softMaxLength: 40,
    defaultResolver: () => "MODIFIED PERMIT",
  },
  {
    id: "permit.shared.closing.signatory.bilingual",
    documentKind: "permit",
    language: "bilingual",
    group: GROUP.CLOSING,
    label: "Signatory title (bilingual, no person name)",
    inline: true,
    softMaxLength: 200,
    defaultResolver: () => "Director General / Umuyobozi Mukuru",
  },
  {
    id: "permit.shared.closing.date.bilingual",
    documentKind: "permit",
    language: "bilingual",
    group: GROUP.CLOSING,
    label: "Closing date line (bilingual, snapshot)",
    inline: true,
    softMaxLength: 200,
    structuredField: "issue_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      // When the editor preview builds a partial ctx (no `permit` namespace),
      // surface a labelled placeholder rather than silently substituting
      // today's date — otherwise the assessor sees a misleading snapshot.
      if (!p) {
        return "Done at Kigali/Bikorewe i Kigali, On/kuwa [ISSUE_DATE]";
      }
      // Signing/execution date = approval date (or today in preview), NOT the
      // validity start. A modification keeps the original validity window but
      // is signed on the day its modification is approved.
      return `Done at Kigali/Bikorewe i Kigali, On/kuwa ${fmtDMY(p.signingDate)}`;
    },
  },
  {
    id: "permit.shared.footer.qr_disclaimer.en",
    documentKind: "permit",
    language: "en",
    group: GROUP.FOOTER,
    label: "QR-footer disclaimer (final-issued PDF only)",
    softMaxLength: 300,
    defaultResolver: () =>
      "Scan to verify. This digital permit is only valid if the information on it matches the water use permit registry.",
  },
  {
    id: "permit.shared.footer.draft_banner.en",
    documentKind: "permit",
    language: "en",
    group: GROUP.FOOTER,
    label: "Draft preview banner (assessor preview only)",
    inline: true,
    softMaxLength: 80,
    defaultResolver: () => "DRAFT — NOT YET ISSUED",
  },
];

// ─── Per-variant slots ───────────────────────────────────────────────────────

/** Build the title slot for every permit variant. The slot id remains
 * `title.en` for backwards compatibility with saved overrides, but the
 * rendered title is bilingual so individual/concession previews match the
 * organization-abstraction layout. */
function titleSlot(variant: PermitVariant): DocumentTextSlot {
  return {
    id: `permit.${variant}.title.en`,
    documentKind: "permit",
    variant,
    language: "en",
    group: GROUP.HEADER,
    label: "Permit title (bilingual)",
    inline: true,
    softMaxLength: 250,
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${placeholder("PERMIT_NUMBER")}`;
      const titleNum = resolvePermitTitleNumber(p.permitNumber, p.headerYear);
      return `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${titleNum}`;
    },
  };
}

// NOTE (RWB feedback 2026-08): the emphasis the permit template requires is
// baked into these defaults as `**…**` markers — the renderer emits the
// wrapped runs bold automatically, so assessors never have to type markers
// themselves. Every variant now carries the same emphasis conventions the
// abstraction_organization defaults established (law number in para_1; the
// applicant/organization name and the key authorization values in para_2).

function rwLegalBasis(): string {
  return "Hashingiwe ku Itegeko **N° 49/2018 ryo ku wa 13/08/2018** rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,";
}

function rwValidity(ctx: SlotResolverContext): string {
  const p = permitOf(ctx);
  if (!p) return "Uru ruhushya rufite agaciro kuva … kugeza ….";
  return `Uru ruhushya rufite agaciro kuva ${fmtDMY(p.issueDate)} kugeza ${fmtDMY(p.expiryDate)}.`;
}

function rwContractReference(): string {
  return "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.";
}

// ─── concession_individual ──────────────────────────────────────────────────

const concessionIndividualSlots: DocumentTextSlot[] = [
  titleSlot("concession_individual"),
  {
    id: "permit.concession_individual.en.para_1",
    documentKind: "permit",
    variant: "concession_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 1 — Legal basis",
    softMaxLength: 400,
    defaultResolver: () =>
      `Pursuant to **Law N°49/2018 of 13/08/2018** determining the use and management of water resources in Rwanda,`,
  },
  {
    id: "permit.concession_individual.en.para_2",
    documentKind: "permit",
    variant: "concession_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 2 — Authorization (snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const name = resolveApplicantName(app);
      const idNum = resolveIdNumber(app);
      const acts = resolveActivities(app);
      const area = resolveArea(app);
      const areaStr = area != null ? `${fmtNum(area)} Hectare` : "N/A Hectare";
      const lake = resolveLakeName(app);
      const loc = resolveAdminLocation(app);
      const prov = fmtProvince(loc.province);
      // Template emphasis applied automatically: name, activities, area, lake.
      return `\u201C**${name}**\u201D, with ID Number: ${idNum}, is authorized to carry out **${acts}** on the surface area of **${areaStr}** (Concession area) in **${lake}**, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov} as shown on the attached map. This permit applies for activities conducted solely within the water body.`;
    },
  },
  {
    id: "permit.concession_individual.en.para_3",
    documentKind: "permit",
    variant: "concession_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 3 — Validity period (snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return "This water use permit is valid from … to ….";
      return `This water use permit is valid from ${fmtDMY(p.issueDate)} to ${fmtDMY(p.expiryDate)}.`;
    },
  },
  {
    id: "permit.concession_individual.en.para_4",
    documentKind: "permit",
    variant: "concession_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 4 — Contract reference",
    softMaxLength: 300,
    defaultResolver: () =>
      `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  },
  {
    id: "permit.concession_individual.rw.para_1",
    documentKind: "permit",
    variant: "concession_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 1 — Igihe gisanzwe (Kinyarwanda)",
    softMaxLength: 400,
    defaultResolver: rwLegalBasis,
  },
  {
    id: "permit.concession_individual.rw.para_2",
    documentKind: "permit",
    variant: "concession_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 2 — Authorization (Kinyarwanda, snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const name = resolveApplicantName(app);
      const idNum = resolveIdNumber(app);
      const actsRw = resolveActivitiesKinyarwanda(app);
      const area = resolveArea(app);
      const areaStr = area != null ? `${fmtNum(area)} Hectare` : "N/A Hectare";
      const lake = resolveLakeName(app);
      const loc = resolveAdminLocation(app);
      // Template emphasis applied automatically — bold parity with the
      // English paragraph is required.
      return `"**${name}**", ufite Indangamuntu nimero: ${idNum}, yemerewe gukora **${actsRw}** ku buso bungana na **${areaStr}** (ahakorerwa ibikorwa) muri **${lake}**, ku gice giherereye mu Mudugudu wa ${loc.village}, Akagari ka ${loc.cell}, Umurenge wa ${loc.sector}, Akarere ka ${loc.district}, ${formatIntaraOrUmujyiWaKigali(loc.province)}, nk'uko bigaragara ku ikarita iri ku mugereka. Uru ruhushya rukoreshwa gusa ku bikorwa bikorerwa muri ayo mazi.`;
    },
  },
  {
    id: "permit.concession_individual.rw.para_3",
    documentKind: "permit",
    variant: "concession_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 3 — Igihe rufite agaciro (Kinyarwanda, snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: rwValidity,
  },
  {
    id: "permit.concession_individual.rw.para_4",
    documentKind: "permit",
    variant: "concession_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 4 — Amasezerano (Kinyarwanda)",
    softMaxLength: 300,
    defaultResolver: rwContractReference,
  },
];

// ─── abstraction_individual ──────────────────────────────────────────────────

const abstractionIndividualSlots: DocumentTextSlot[] = [
  titleSlot("abstraction_individual"),
  {
    id: "permit.abstraction_individual.en.para_1",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 1 — Legal basis",
    softMaxLength: 400,
    defaultResolver: () =>
      `Pursuant to **Law N°49/2018 of 13/08/2018**, determining the use and management of water resources in Rwanda,`,
  },
  {
    id: "permit.abstraction_individual.en.para_2",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 2 — Authorization (snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const name = resolveApplicantName(app);
      const idNum = resolveIdNumber(app);
      const wsName = resolveWaterSourceName(app);
      const loc = resolveAdminLocation(app);
      const { lat, lng } = resolveLatLng(app);
      const sysType = resolveSystemType(app);
      const vols = resolveVolumes(app);
      const yearlyStr = vols.yearly != null ? `${fmtNum(vols.yearly)} m³/year` : "N/A m³/year";
      const acts = resolveActivities(app);
      const isGw = resolveIsGroundwater(app);
      const prGw = isGw ? resolvePumpingRateM3Day(app) : undefined;
      const rateWord = isGw ? "pumping rate" : "flow rate";
      const rateStr = isGw && prGw != null ? `${fmtNum(prGw)} m³/day` : yearlyStr;
      // Template emphasis applied automatically: name, water source, rate,
      // activities (same convention as abstraction_organization).
      return `\u201C**${name}**\u201D, with ID Number: ${idNum}, is authorized to abstract ${isGw ? "ground water" : "water"} from **${wsName}** located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysType} with a ${rateWord} of **${rateStr}**. Water abstracted will be used for **${acts}**.`;
    },
  },
  {
    id: "permit.abstraction_individual.en.para_3",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 3 — Validity period (snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return "This water use permit is valid from … to ….";
      return `This water use permit is valid from ${fmtDMY(p.issueDate)} to ${fmtDMY(p.expiryDate)}.`;
    },
  },
  {
    id: "permit.abstraction_individual.en.para_4",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 4 — Contract reference",
    softMaxLength: 300,
    defaultResolver: () =>
      `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  },
  {
    id: "permit.abstraction_individual.rw.para_1",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 1 — Igihe gisanzwe (Kinyarwanda)",
    softMaxLength: 400,
    defaultResolver: rwLegalBasis,
  },
  {
    id: "permit.abstraction_individual.rw.para_2",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 2 — Authorization (Kinyarwanda, snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const name = resolveApplicantName(app);
      const idNum = resolveIdNumber(app);
      const wsName = resolveWaterSourceName(app);
      const loc = resolveAdminLocation(app);
      const { lat, lng } = resolveLatLng(app);
      const systemTypeRw = resolveKinyarwandaSystemType(app);
      const yearlyStr = resolveFlowRateKinyarwanda(app);
      const actsRw = resolveActivitiesKinyarwanda(app);
      const isGw = resolveIsGroundwater(app);
      // Groundwater: strip "borehole"/"Nayikondo ya" so the phrase reads
      // "Nayikondo ya <name>" without duplication.
      const gwClean = (n: string) =>
        n.replace(/\s*\bborehole\b/gi, "").replace(/^\s*Nayikondo\s+ya\s*/i, "").trim() || n;
      // Template emphasis applied automatically — bold parity with the
      // English paragraph is required.
      const wsLocPhrase = isGw
        ? `ava muri Nayikondo ya **${gwClean(wsName)}**, iherereye mu`
        : `ava ku **${wsName}** iherereye mu`;
      // Groundwater: value comes first ("angana na <rate> ku munsi, ava muri Nayikondo ya …"),
      // matching the organization/sample wording. Surface keeps the trailing "ku gipimo cya …".
      const rwValuePrefix = isGw ? `angana na **${yearlyStr}**, ` : ``;
      const rwValueSuffix = isGw ? `` : `, ku gipimo cya **${yearlyStr}**`;
      // Groundwater uses "gukoresha" (to use) rather than the pumping-system verb.
      const rwVerb = isGw ? "gukoresha" : systemTypeRw;
      return `"**${name}**", ufite Indangamuntu nimero: ${idNum}, yemerewe ${rwVerb} amazi ${rwValuePrefix}${wsLocPhrase} ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}${rwValueSuffix}. Aya mazi yemerewe gukoreshwa mu **${actsRw}**.`;
    },
  },
  {
    id: "permit.abstraction_individual.rw.para_3",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 3 — Igihe rufite agaciro (Kinyarwanda, snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: rwValidity,
  },
  {
    id: "permit.abstraction_individual.rw.para_4",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 4 — Amasezerano (Kinyarwanda)",
    softMaxLength: 300,
    defaultResolver: rwContractReference,
  },
];

// ─── concession_organization ─────────────────────────────────────────────────

/** True when a resolved admin-location part carries real information. */
function hasLocPart(v: string): boolean {
  return Boolean(v) && v !== "N/A";
}

function concessionOrgWaterSourceLocation(ctx: SlotResolverContext): string {
  // Water-source location is APPLICATION data: notes overrides (assessor
  // manual edits flattened into notes) win, then the application's own
  // sector/district/province columns — the exact chain the contract
  // placeholders use, so permit and contract stay consistent.
  const loc = resolveAdminLocation(appOf(ctx));
  return [
    hasLocPart(loc.sector) ? `${loc.sector} Sector` : null,
    hasLocPart(loc.district) ? `${loc.district} District` : null,
    hasLocPart(loc.province)
      ? loc.province.toLowerCase() === "kigali"
        ? "City OF Kigali"
        : `${loc.province} Province`
      : null,
  ]
    .filter(Boolean)
    .join(", ") || "N/A";
}

function concessionOrgWaterSourceLocationRw(ctx: SlotResolverContext): string {
  const loc = resolveAdminLocation(appOf(ctx));
  return [
    hasLocPart(loc.sector) ? `Umurenge wa ${loc.sector}` : null,
    hasLocPart(loc.district) ? `Akarere ka ${loc.district}` : null,
    hasLocPart(loc.province) ? formatIntaraOrUmujyiWaKigali(loc.province) : null,
  ]
    .filter(Boolean)
    .join(", ") || "N/A";
}

const concessionOrganizationSlots: DocumentTextSlot[] = [
  titleSlot("concession_organization"),
  {
    id: "permit.concession_organization.en.para_1",
    documentKind: "permit",
    variant: "concession_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 1 — Legal basis",
    softMaxLength: 400,
    defaultResolver: () =>
      `Pursuant to **Law N°49/2018 of 13/08/2018** determining the use and management of water resources in Rwanda,`,
  },
  {
    id: "permit.concession_organization.en.para_2",
    documentKind: "permit",
    variant: "concession_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 2 — Authorization (snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const orgName = resolveApplicantName(app);
      const rep = resolveOrgRep(app);
      const acts = resolveActivities(app);
      const area = resolveArea(app);
      const areaStr = area != null ? `${fmtNum(area)} hectares` : "N/A hectares";
      const lake = resolveLakeName(app);
      const loc = resolveAdminLocation(app);
      const prov = fmtProvince(loc.province);
      const wsLocParts = concessionOrgWaterSourceLocation(ctx);
      // Template emphasis applied automatically: org name, activities,
      // area, lake.
      return `\u201C**${orgName}**\u201D, with its water source location as follows: ${wsLocParts}; represented by ${rep.name}; is authorized to carry out **${acts}** on the surface area of **${areaStr}** in **${lake}**, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov}, as shown on the attached map. This permit applies to activities conducted solely within the water body.`;
    },
  },
  {
    id: "permit.concession_organization.en.para_3",
    documentKind: "permit",
    variant: "concession_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 3 — Validity period (snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return "This water use permit is valid from … to ….";
      return `This water use permit is valid from ${fmtDMY(p.issueDate)} to ${fmtDMY(p.expiryDate)}.`;
    },
  },
  {
    id: "permit.concession_organization.en.para_4",
    documentKind: "permit",
    variant: "concession_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 4 — Contract reference",
    softMaxLength: 300,
    defaultResolver: () =>
      `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  },
  {
    id: "permit.concession_organization.rw.para_1",
    documentKind: "permit",
    variant: "concession_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 1 — Igihe gisanzwe (Kinyarwanda)",
    softMaxLength: 400,
    defaultResolver: rwLegalBasis,
  },
  {
    id: "permit.concession_organization.rw.para_2",
    documentKind: "permit",
    variant: "concession_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 2 — Authorization (Kinyarwanda, snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const orgName = resolveApplicantName(app);
      const rep = resolveOrgRep(app);
      const actsRw = resolveActivitiesKinyarwanda(app);
      const area = resolveArea(app);
      const areaStr = area != null ? `${fmtNum(area)} hectares` : "N/A hectares";
      const lake = resolveLakeName(app);
      const loc = resolveAdminLocation(app);
      const wsLocParts = concessionOrgWaterSourceLocationRw(ctx);
      // Template emphasis applied automatically — bold parity with the
      // English paragraph is required.
      return `"**${orgName}**", ifite aho ifatira amazi hakurikira: ${wsLocParts}; ihagarariwe na ${rep.name}; yemerewe gukora **${actsRw}** ku buso bungana na **${areaStr}** muri **${lake}**, ku gice giherereye mu Mudugudu wa ${loc.village}, Akagari ka ${loc.cell}, Umurenge wa ${loc.sector}, Akarere ka ${loc.district}, ${formatIntaraOrUmujyiWaKigali(loc.province)}, nk'uko bigaragara ku ikarita iri ku mugereka. Uru ruhushya rukoreshwa gusa ku bikorwa bikorerwa muri ayo mazi.`;
    },
  },
  {
    id: "permit.concession_organization.rw.para_3",
    documentKind: "permit",
    variant: "concession_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 3 — Igihe rufite agaciro (Kinyarwanda, snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: rwValidity,
  },
  {
    id: "permit.concession_organization.rw.para_4",
    documentKind: "permit",
    variant: "concession_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 4 — Amasezerano (Kinyarwanda)",
    softMaxLength: 300,
    defaultResolver: rwContractReference,
  },
];

// ─── abstraction_organization (bilingual) ────────────────────────────────────

const abstractionOrganizationSlots: DocumentTextSlot[] = [
  {
    id: "permit.abstraction_organization.title.en",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "en",
    group: GROUP.HEADER,
    label: "Permit title (bilingual)",
    inline: true,
    softMaxLength: 250,
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${placeholder("PERMIT_NUMBER")}`;
      const titleNum = resolvePermitTitleNumber(p.permitNumber, p.headerYear);
      return `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${titleNum}`;
    },
  },
  {
    id: "permit.abstraction_organization.en.para_1",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 1 — Legal basis (English)",
    softMaxLength: 400,
    defaultResolver: () =>
      `Pursuant to **Law N°49/2018 of 13/08/2018** determining the use and management of water resources in Rwanda,`,
  },
  {
    id: "permit.abstraction_organization.en.para_2",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 2 — Authorization (English, snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const orgName = resolveApplicantName(app);
      const orgAddr = resolveOrgAddress(app);
      const rep = resolveOrgRep(app);
      const wsName = resolveWaterSourceName(app);
      const loc = resolveAdminLocation(app);
      const { lat, lng } = resolveLatLng(app);
      const sysLabel = resolveEnglishSystemLabel(app);
      const flowRate = resolveFlowRate(app);
      const acts = resolveActivities(app);
      const provLabel =
        loc.province.toLowerCase() === "kigali" ? "City OF Kigali" : `${loc.province} Province`;
      const isGw = resolveIsGroundwater(app);
      // Dynamic values are wrapped in `**…**` so the renderer emits them
      // bold inline (matches the official RWB sample). The office address
      // itself is intentionally NOT bold — only org name, rep title, water
      // source, flow rate, and activities are emphasised.
      return `\u201C**${orgName}**\u201D with its registered office address as follows: ${orgAddr}; represented by ${rep.name} \u201C**${rep.title}**\u201D, is authorized to abstract ${isGw ? "ground water" : "water"} from **${wsName}** located in ${provLabel}, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysLabel} at a ${isGw ? "pumping rate" : "flow rate"} of **${flowRate}**. Water abstracted will be used for **${acts}**.`;
    },
  },
  {
    id: "permit.abstraction_organization.en.para_3",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 3 — Validity period (English, snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return "This water use permit is valid from … to ….";
      return `This water use permit is valid from ${fmtDMY(p.issueDate)} to ${fmtDMY(p.expiryDate)}.`;
    },
  },
  {
    id: "permit.abstraction_organization.en.para_4",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "en",
    group: GROUP.AUTH_EN,
    label: "Paragraph 4 — Contract reference (English)",
    softMaxLength: 300,
    defaultResolver: () =>
      `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  },
  {
    id: "permit.abstraction_organization.rw.para_1",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 1 — Igihe gisanzwe (Kinyarwanda)",
    softMaxLength: 400,
    defaultResolver: () =>
      "Hashingiwe ku Itegeko **N° 49/2018 ryo ku wa 13/08/2018** rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,",
  },
  {
    id: "permit.abstraction_organization.rw.para_2",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 2 — Authorization (Kinyarwanda, snapshot of dynamic values)",
    defaultResolver: (ctx) => {
      const app = appOf(ctx);
      const orgName = resolveApplicantName(app);
      const orgAddrRw = resolveOrgAddressKinyarwanda(app);
      const rep = resolveOrgRep(app);
      const wsName = resolveWaterSourceName(app);
      const loc = resolveAdminLocation(app);
      const { lat, lng } = resolveLatLng(app);
      const systemTypeRw = resolveKinyarwandaSystemType(app);
      const flowRate = resolveFlowRateKinyarwanda(app);
      const actsRw = resolveActivitiesKinyarwanda(app);
      const isGw = resolveIsGroundwater(app);
      // Groundwater: strip "borehole"/"Nayikondo ya" so the phrase reads
      // "Nayikondo ya <name>" without duplication.
      const gwClean = (n: string) =>
        n.replace(/\s*\bborehole\b/gi, "").replace(/^\s*Nayikondo\s+ya\s*/i, "").trim() || n;
      const wsDisplay = isGw ? gwClean(wsName) : wsName;
      // Dynamic values are wrapped in `**…**` so the renderer emits them
      // bold inline (matches the official RWB sample). The office address
      // itself is intentionally NOT bold — only org name, rep title, water
      // source, flow rate, and activities are emphasised. Bold parity with
      // the English paragraph is required.
      const wsLocPhrase = isGw
        ? `ava muri Nayikondo ya **${wsDisplay}**, iherereye mu`
        : `ava ku **${wsName}** iherereye mu`;
      // Groundwater uses "gukoresha" (to use) rather than the pumping-system verb.
      const rwVerb = isGw ? "gukoresha" : systemTypeRw;
      return `"**${orgName}**" ifite ibiro biherereye mu ${orgAddrRw}; ihagarariwe na ${rep.name} "**${rep.title}**", yemerewe ${rwVerb} amazi angana na **${flowRate}**, ` +
        `${wsLocPhrase} ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
        `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, ` +
        `Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}. Aya mazi yemerewe gukoreshwa mu **${actsRw}**.`;
    },
  },
  {
    id: "permit.abstraction_organization.rw.para_3",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 3 — Igihe rufite agaciro (Kinyarwanda, snapshot of dates)",
    softMaxLength: 200,
    structuredField: "expiry_date",
    defaultResolver: (ctx) => {
      const p = permitOf(ctx);
      if (!p) return "Uru ruhushya rufite agaciro kuva … kugeza ….";
      return `Uru ruhushya rufite agaciro kuva ${fmtDMY(p.issueDate)} kugeza ${fmtDMY(p.expiryDate)}.`;
    },
  },
  {
    id: "permit.abstraction_organization.rw.para_4",
    documentKind: "permit",
    variant: "abstraction_organization",
    language: "rw",
    group: GROUP.AUTH_RW,
    label: "Paragraph 4 — Amasezerano (Kinyarwanda)",
    softMaxLength: 300,
    defaultResolver: () =>
      "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.",
  },
];

// ─── Catalogue export + registration ─────────────────────────────────────────

export const permitSlots: DocumentTextSlot[] = [
  ...sharedSlots,
  ...abstractionIndividualSlots,
  ...abstractionOrganizationSlots,
  ...concessionIndividualSlots,
  ...concessionOrganizationSlots,
];

registerSlots(permitSlots);
