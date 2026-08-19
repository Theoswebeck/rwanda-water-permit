/**
 * Verification for the surface-water-only article in the individual
 * abstraction contract.
 *
 * Background: the `abstraction_individual` contract template was transcribed
 * from the GROUNDWATER (borehole) individual contract, which deliberately
 * omits "Article 9: Other people's rights and access to water" and therefore
 * numbers every later article one lower. That template was then used for
 * every individual abstraction permit, so SURFACE-water users also lost the
 * article (RWB feedback, 2026-08-19).
 *
 * These checks pin both branches:
 *   1. Surface water  → the article is present and later articles are
 *      renumbered to match `abstraction_organization` (9 → 10 → 11 …).
 *   2. Groundwater    → output is byte-identical to the raw template (i.e.
 *      today's behaviour is untouched).
 *   3. Every other variant is unaffected by the water source.
 *   4. Existing per-section slot overrides keep landing on the same section
 *      (slot indices are NOT shifted by the insertion).
 *
 * Run with: npx tsx scripts/check-contract-surface-article.ts
 *
 * Exits non-zero on any mismatch.
 */

import "../lib/document-slots"; // registers permit + contract catalogues

import {
  contractTermsByVariant,
  surfaceOnlyArticleAnchorsOk,
  type ContractTermsSection,
} from "../lib/contract-terms";
import type { ApplicationForContract } from "../lib/contract-placeholders";
import {
  CONTRACT_PARAGRAPH_SEPARATOR,
  getResolvedContractTerms,
  getSlotsForDocument,
  isSurfaceOnlyArticleSlot,
  writeEnvelopeIntoNotes,
  applyPatches,
  makeEmptyEnvelope,
} from "../lib/document-slots";
import type { PermitApplication } from "../lib/permit/permit-text-data";
import type { PermitVariant } from "../lib/permit-variant";

let failures = 0;
let passes = 0;
function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}
function eq(actual: string, expected: string, label: string): void {
  if (actual === expected) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected.slice(0, 240))}`);
    console.error(`    actual:   ${JSON.stringify(actual.slice(0, 240))}`);
  }
}

type Fixture = PermitApplication & ApplicationForContract;

function makeFixture(
  variant: PermitVariant,
  source: "surface" | "groundwater",
  extraNotes: Record<string, unknown> = {},
): Fixture {
  const accountType =
    variant === "abstraction_organization" || variant === "concession_organization"
      ? "organization"
      : "individual";
  const notes: Record<string, unknown> = { ...extraNotes };
  if (source === "groundwater") notes.methodOfWaterAbstraction = "groundwater";
  return {
    id: `fx-${variant}-${source}`,
    application_number: "RWB-2026-000123",
    project_title: "Test project",
    status: "approved",
    application_type: variant.startsWith("concession") ? "concession" : "abstraction",
    water_source: source === "groundwater" ? "borehole" : "lake",
    water_purpose: "irrigation",
    water_body_name: "Lake Kivu",
    estimated_usage_volume: 0,
    usage_unit: "m3_per_year",
    intended_activities: ["Fish farming in lakes"],
    province: "north",
    district: "Gicumbi",
    sector: "Manyagiro",
    cell: "Mukono",
    village: "Mukono",
    concession_area: 12,
    proposed_duration_years: 5,
    assessor_recommended_volume_m3: 47,
    max_yearly_volume_m3: 47,
    water_taking_method: "gravity",
    internal_notes: JSON.stringify(notes),
    applicant: {
      first_name: "Jane",
      last_name: "Doe",
      company_name: "Acme Aqua Ltd",
      email: "jane@example.com",
      account_type: accountType,
      id_number: "1199012345678901",
      company_tin: "100123456",
      company_address: "Kigali",
    },
  } as Fixture;
}

function resolve(variant: PermitVariant, fx: Fixture): ContractTermsSection[] {
  const resolved = getResolvedContractTerms({
    application: fx,
    applicationNumber: fx.application_number,
    transferPermit: null,
    variantOverride: variant,
  });
  if (!resolved) throw new Error(`no resolved terms for ${variant}`);
  return resolved.sections;
}

/** Article heading part of a title, e.g. "Article 10: Records keeping". */
function articleOf(title: string): string {
  const parts = title.split("—").map((s) => s.trim());
  return parts.length > 1 ? parts.slice(1).join(" — ") : title;
}

const VARIANT: PermitVariant = "abstraction_individual";
const template = contractTermsByVariant[VARIANT];
if (!template) throw new Error("abstraction_individual template missing");

// ── 1. Surface water: the article is present, numbering matches org ────────
console.log("\nsurface-water individual abstraction — Article 9 present + renumbered");
{
  const sections = resolve(VARIANT, makeFixture(VARIANT, "surface"));
  const titles = sections.map((s) => s.title);

  ok(
    sections.length === template.sections.length + 2,
    `two sections injected (${sections.length} vs template ${template.sections.length})`,
  );

  const enArticle = titles.find((t) =>
    t.includes("Article 9: Other people’s rights and access to water"),
  );
  ok(Boolean(enArticle), "EN Article 9 — Other people’s rights and access to water");

  const rwArticle = titles.find((t) =>
    t.includes("Ingingo ya 9: Uburenganzira bw’abandi bantu bwo kugera ku mazi"),
  );
  ok(Boolean(rwArticle), "RW Ingingo ya 9 — Uburenganzira bw’abandi bantu");

  // Body text must match the RWB contract wording exactly.
  const enBody = sections.find((s) => s.title === enArticle)?.paragraphs ?? [];
  eq(
    enBody[0] ?? "",
    "1. The Water User may not take any action that restricts the right of the public to reasonably use the Water Resources, including, without limitation, the right to fetch water for domestic use.",
    "EN Article 9 paragraph 1",
  );
  ok(
    (enBody[1] ?? "").startsWith(
      "2. The issuance of a Water Use Permit does not authorize any injury to private or public property",
    ),
    "EN Article 9 paragraph 2",
  );

  const rwBody = sections.find((s) => s.title === rwArticle)?.paragraphs ?? [];
  eq(
    rwBody[0] ?? "",
    "1.Ukoresha amazi ntashobora gukora ibikorwa bibuza uburenganzira abandi bantu bwo gukoresha umutungo kamere w’amazi, harimo kuvoma amazi akoreshwa murugo.",
    "RW Ingingo ya 9 paragraph 1",
  );
  ok(
    (rwBody[1] ?? "").startsWith("2. Itangwa ry"),
    "RW Ingingo ya 9 paragraph 2",
  );

  // The renumbered run must be identical to abstraction_organization's.
  const orgTemplate = contractTermsByVariant.abstraction_organization;
  if (!orgTemplate) throw new Error("abstraction_organization template missing");
  const orgArticles = orgTemplate.sections.map((s) => articleOf(s.title));
  const ourArticles = sections.map((s) => articleOf(s.title));
  for (const expected of [
    "Article 9: Other people’s rights and access to water",
    "Article 10: Records keeping",
    "Article 11: Duty to Provide Information",
    "Article 12: Obligations of the Director General",
    "Article 15: Cancellation of the Water Use Permit and Termination of the Contract",
    "Article 16: Contract amendment",
    "Article 19: Commencement Date",
    "Ingingo ya 10: Kubika amakuru",
    "Ingingo ya 11: Inshingano yo gutanga amakuru",
    "Ingingo ya 19: Igihe amasezerano atangira gukurikizwa",
  ]) {
    ok(ourArticles.includes(expected), `renumbered: ${expected}`);
    ok(orgArticles.includes(expected), `  (matches organization contract)`);
  }

  // No article number may appear twice within a language block.
  const enNums = ourArticles
    .map((a) => /^Article (\d+):/.exec(a)?.[1])
    .filter(Boolean) as string[];
  ok(new Set(enNums).size === enNums.length, `EN article numbers unique (${enNums.join(",")})`);
  const rwNums = ourArticles
    .map((a) => /^Ingingo ya (\d+):/.exec(a)?.[1])
    .filter(Boolean) as string[];
  ok(new Set(rwNums).size === rwNums.length, `RW article numbers unique (${rwNums.join(",")})`);
}

// ── 2. Groundwater: byte-identical to today's output ──────────────────────
console.log("\ngroundwater individual abstraction — unchanged (article stays out)");
{
  const sections = resolve(VARIANT, makeFixture(VARIANT, "groundwater"));
  ok(
    sections.length === template.sections.length,
    `section count unchanged (${sections.length})`,
  );
  eq(
    JSON.stringify(sections.map((s) => s.title)),
    JSON.stringify(template.sections.map((s) => s.title)),
    "titles byte-identical to template (no renumbering)",
  );
  ok(
    !sections.some((s) => s.title.includes("Other people")),
    "Article 9 (other people's rights) absent for groundwater",
  );
}

// ── 3. Other variants unaffected by water source ──────────────────────────
console.log("\nother variants — water source makes no difference");
for (const variant of Object.keys(contractTermsByVariant) as PermitVariant[]) {
  if (variant === VARIANT) continue;
  const terms = contractTermsByVariant[variant];
  if (!terms) continue;
  const surface = resolve(variant, makeFixture(variant, "surface"));
  const ground = resolve(variant, makeFixture(variant, "groundwater"));
  ok(
    surface.length === terms.sections.length && ground.length === terms.sections.length,
    `${variant}: section count unchanged for both sources`,
  );
  eq(
    JSON.stringify(surface.map((s) => s.title)),
    JSON.stringify(ground.map((s) => s.title)),
    `${variant}: titles identical for both sources`,
  );
}

// ── 4. Existing slot overrides still land on the same section ─────────────
console.log("\nslot stability — existing overrides are not shifted by the insertion");
{
  // Index 9 in the template is "Article 9: Records keeping" (which becomes
  // "Article 10: Records keeping" for surface water). An override saved
  // against that slot must still render as the records-keeping section.
  const templateIdx = 9;
  ok(
    template.sections[templateIdx].title.includes("Records keeping"),
    "template section[9] is the records-keeping article",
  );

  const env = makeEmptyEnvelope();
  const editor = { id: "u1", name: "Tester", email: "t@rwb.rw", role: "assessor" };
  const applied = applyPatches(
    env,
    [{ slotId: `contract.${VARIANT}.section.${templateIdx}.body`, text: "RECORDS OVERRIDE" }],
    editor,
  );
  ok(applied.ok, "apply override patch ok");
  if (!applied.ok) throw new Error("patch failed");
  const notes = writeEnvelopeIntoNotes({}, applied.envelope);

  for (const source of ["surface", "groundwater"] as const) {
    const fx = makeFixture(VARIANT, source);
    const merged = { ...JSON.parse(fx.internal_notes as string), ...notes };
    fx.internal_notes = JSON.stringify(merged);
    const sections = resolve(VARIANT, fx);
    const hit = sections.find(
      (s) => s.paragraphs.join(CONTRACT_PARAGRAPH_SEPARATOR) === "RECORDS OVERRIDE",
    );
    ok(Boolean(hit), `${source}: override still resolves`);
    ok(
      Boolean(hit && hit.title.includes("Records keeping")),
      `${source}: override still attached to the records-keeping article (${hit?.title ?? "—"})`,
    );
  }
}

// ── 5. The injected article is editable in the document text editor ───────
console.log("\ndocument text editor — injected article has its own slots");
{
  const slots = getSlotsForDocument("contract", VARIANT);
  const ids = slots.map((s) => s.id);
  for (const suffix of [
    "surface_only.other_rights_en.title",
    "surface_only.other_rights_en.body",
    "surface_only.other_rights_rw.title",
    "surface_only.other_rights_rw.body",
  ]) {
    ok(ids.includes(`contract.${VARIANT}.${suffix}`), `slot exists: ${suffix}`);
  }
}

// ── 6. Template anchors ───────────────────────────────────────────────────
// The insertion indices are positions in the template array. At runtime a
// mismatch only disables the insertion (contract-terms.ts must not throw on
// the client); here it is a hard failure so drift is caught in dev/CI.
console.log("\ntemplate anchors — insertion indices still point at the right sections");
ok(surfaceOnlyArticleAnchorsOk(), "surface-only insertion anchors validate");

// ── 7. A stale assessor TITLE override does not duplicate Article 9 ───────
console.log("\nstale title override — renumbered, never duplicated");
{
  const templateIdx = 9; // "Article 9: Records keeping" pre-fix
  const staleTitle = template.sections[templateIdx].title; // saved before the fix
  const env = makeEmptyEnvelope();
  const editor = { id: "u1", name: "Tester", email: "t@rwb.rw", role: "assessor" };
  const applied = applyPatches(
    env,
    [{ slotId: `contract.${VARIANT}.section.${templateIdx}.title`, text: staleTitle }],
    editor,
  );
  if (!applied.ok) throw new Error("patch failed");
  const notes = writeEnvelopeIntoNotes({}, applied.envelope);

  const fx = makeFixture(VARIANT, "surface");
  fx.internal_notes = JSON.stringify({
    ...JSON.parse(fx.internal_notes as string),
    ...notes,
  });
  const titles = resolve(VARIANT, fx).map((s) => articleOf(s.title));
  const nines = titles.filter((t) => t.startsWith("Article 9:"));
  ok(nines.length === 1, `exactly one EN Article 9 (${nines.join(" | ") || "none"})`);
  ok(
    titles.includes("Article 10: Records keeping"),
    "stale override renumbered to Article 10",
  );

  // An override with deliberately different wording AND a deliberate number is
  // left exactly as the assessor wrote it.
  const custom = applyPatches(
    makeEmptyEnvelope(),
    [
      {
        slotId: `contract.${VARIANT}.section.${templateIdx}.title`,
        text: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: Custom heading",
      },
    ],
    editor,
  );
  if (!custom.ok) throw new Error("patch failed");
  const fx2 = makeFixture(VARIANT, "surface");
  fx2.internal_notes = JSON.stringify(writeEnvelopeIntoNotes({}, custom.envelope));
  ok(
    resolve(VARIANT, fx2)
      .map((s) => articleOf(s.title))
      .includes("Article 4: Custom heading"),
    "an assessor's own numbering is left untouched",
  );
}

// ── 8. Editor slot list: ordering + groundwater hiding ────────────────────
console.log("\ndocument text editor — ordering and groundwater hiding");
{
  const ids = getSlotsForDocument("contract", VARIANT).map((s) => s.id);
  const enArticleSlot = ids.indexOf(`contract.${VARIANT}.surface_only.other_rights_en.title`);
  ok(
    enArticleSlot > ids.indexOf(`contract.${VARIANT}.section.8.title`) &&
      enArticleSlot < ids.indexOf(`contract.${VARIANT}.section.9.title`),
    "EN Article 9 slots sit between section 8 and section 9 (document order)",
  );
  const rwArticleSlot = ids.indexOf(`contract.${VARIANT}.surface_only.other_rights_rw.title`);
  ok(
    rwArticleSlot > ids.indexOf(`contract.${VARIANT}.section.29.title`) &&
      rwArticleSlot < ids.indexOf(`contract.${VARIANT}.section.30.title`),
    "RW Ingingo ya 9 slots sit between section 29 and section 30",
  );
  ok(
    ids.filter(isSurfaceOnlyArticleSlot).length === 4,
    "isSurfaceOnlyArticleSlot matches exactly the four injected slots",
  );
  ok(
    !getSlotsForDocument("contract", "abstraction_organization")
      .map((s) => s.id)
      .some(isSurfaceOnlyArticleSlot),
    "no surface-only slots on other variants",
  );
}

console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures > 0 ? 1 : 0);
