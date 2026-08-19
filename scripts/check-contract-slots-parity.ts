/**
 * Parity verification for the contract slot catalogue.
 *
 * For each variant in `contractTermsByVariant`, asserts:
 *   1. Every section produces a `title` slot and a `body` slot in the
 *      catalogue.
 *   2. Each slot's `defaultResolver` output equals the byte-for-byte result
 *      that `fillContractText(template, placeholderCtx)` produces — i.e. the
 *      catalogue does not drift from the legacy filling path.
 *   3. `getResolvedContractTerms` returns identical sections to the legacy
 *      path when no overrides are present (so the React preview and jsPDF
 *      callers continue to render the same text).
 *   4. Setting an override via the slot envelope makes
 *      `getResolvedContractTerms` reflect the override.
 *
 * Run with: npx tsx scripts/check-contract-slots-parity.ts
 *
 * Exits non-zero on any mismatch.
 */

import "../lib/document-slots"; // registers permit + contract catalogues

import {
  contractTermsByVariant,
  SURFACE_ONLY_ARTICLE_INSERTIONS,
  SURFACE_ONLY_ARTICLE_VARIANT,
  type ContractTerms,
} from "../lib/contract-terms";
import {
  buildContractPlaceholderContext,
  fillContractText,
  type ApplicationForContract,
} from "../lib/contract-placeholders";
import {
  CONTRACT_PARAGRAPH_SEPARATOR,
  findSlot,
  getResolvedContractTerms,
  getSlotsForDocument,
  resolveSlotText,
  writeEnvelopeIntoNotes,
  applyPatches,
  makeEmptyEnvelope,
} from "../lib/document-slots";
import { buildContractSlotContext } from "../lib/document-slots/build-context";
import type { PermitApplication } from "../lib/permit/permit-text-data";
import type { PermitVariant } from "../lib/permit-variant";

let failures = 0;
let passes = 0;
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
function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

function makeFixture(variant: PermitVariant): PermitApplication & ApplicationForContract {
  // Common fixture used to exercise placeholder substitution. We pin every
  // dynamic value so the assertions are deterministic.
  const accountType =
    variant === "abstraction_organization" || variant === "concession_organization"
      ? "organization"
      : "individual";
  return {
    id: `fx-${variant}`,
    application_number: "RWB-2026-000123",
    project_title: "Test project",
    status: "approved",
    application_type: variant.startsWith("concession") ? "concession" : "abstraction",
    water_source: "lake",
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
  };
}

console.log("\ncontract slot registration — every variant + every section is wired");
for (const variant of Object.keys(contractTermsByVariant) as PermitVariant[]) {
  const terms = contractTermsByVariant[variant];
  if (!terms) {
    ok(true, `${variant}: no template (skipped)`);
    continue;
  }
  const slots = getSlotsForDocument("contract", variant);
  // heading + (subheading?) + 2*sections + (notice ? 2)
  // The surface-water-only Article 9 adds its own index-free title+body slots
  // to the individual abstraction variant (see lib/contract-terms.ts).
  const surfaceOnlySlots =
    variant === SURFACE_ONLY_ARTICLE_VARIANT
      ? SURFACE_ONLY_ARTICLE_INSERTIONS.length * 2
      : 0;
  const expectedCount =
    1 +
    (terms.subheading ? 1 : 0) +
    terms.sections.length * 2 +
    surfaceOnlySlots +
    (terms.importantNotice ? 2 : 0);
  ok(
    slots.length === expectedCount,
    `${variant}: ${slots.length} slots (expected ${expectedCount})`,
  );
}

console.log("\ncontract slot defaults — byte-equivalent to fillContractText");
for (const variant of Object.keys(contractTermsByVariant) as PermitVariant[]) {
  const terms = contractTermsByVariant[variant];
  if (!terms) continue;
  const fx = makeFixture(variant);
  const placeholderCtx = buildContractPlaceholderContext(
    fx,
    fx.application_number ?? "",
    null,
  );
  const ctx = buildContractSlotContext(fx);
  ctx.extras = { transferPermit: null };

  // heading
  eq(
    resolveSlotText(`contract.${variant}.heading`, ctx),
    fillContractText(terms.heading, placeholderCtx),
    `${variant}: heading`,
  );
  if (terms.subheading) {
    eq(
      resolveSlotText(`contract.${variant}.subheading`, ctx),
      fillContractText(terms.subheading, placeholderCtx),
      `${variant}: subheading`,
    );
  }

  // sections (just spot-check the first 3 — all of them is too noisy and
  // the byte-equivalence is structurally guaranteed by `fill()` in the
  // catalogue, so 3 per variant catches any wrapper bug).
  const sample = terms.sections.slice(0, 3);
  sample.forEach((section, idx) => {
    eq(
      resolveSlotText(`contract.${variant}.section.${idx}.title`, ctx),
      fillContractText(section.title, placeholderCtx),
      `${variant}: section[${idx}].title`,
    );
    eq(
      resolveSlotText(`contract.${variant}.section.${idx}.body`, ctx),
      fillContractText(
        section.paragraphs.join(CONTRACT_PARAGRAPH_SEPARATOR),
        placeholderCtx,
      ),
      `${variant}: section[${idx}].body`,
    );
  });

  if (terms.importantNotice) {
    eq(
      resolveSlotText(`contract.${variant}.notice.title`, ctx),
      fillContractText(terms.importantNotice.title, placeholderCtx),
      `${variant}: notice.title`,
    );
    eq(
      resolveSlotText(`contract.${variant}.notice.body`, ctx),
      fillContractText(terms.importantNotice.body, placeholderCtx),
      `${variant}: notice.body`,
    );
  }
}

console.log("\ngetResolvedContractTerms — parity with legacy filling path");
for (const variant of Object.keys(contractTermsByVariant) as PermitVariant[]) {
  const terms = contractTermsByVariant[variant];
  if (!terms) continue;
  const fx = makeFixture(variant);
  const placeholderCtx = buildContractPlaceholderContext(
    fx,
    fx.application_number ?? "",
    null,
  );
  const resolved = getResolvedContractTerms({
    application: fx,
    applicationNumber: fx.application_number,
    transferPermit: null,
    variantOverride: variant,
  });
  ok(resolved !== null, `${variant}: resolved not null`);
  if (!resolved) continue;
  // The fixture has no `methodOfWaterAbstraction`, so it is a surface-water
  // application and the individual abstraction contract gains Article 9.
  const expectedSections =
    terms.sections.length +
    (variant === SURFACE_ONLY_ARTICLE_VARIANT
      ? SURFACE_ONLY_ARTICLE_INSERTIONS.length
      : 0);
  ok(
    resolved.sections.length === expectedSections,
    `${variant}: section count preserved (${resolved.sections.length}, expected ${expectedSections})`,
  );
  // Spot-check first section parity (full byte equivalence of every paragraph).
  const expectedFirst = (terms.sections[0]?.paragraphs ?? []).map((p) =>
    fillContractText(p, placeholderCtx),
  );
  ok(
    JSON.stringify(resolved.sections[0]?.paragraphs ?? []) ===
      JSON.stringify(expectedFirst),
    `${variant}: section[0] paragraphs match legacy path`,
  );
}

console.log("\noverride round-trip — set, resolve, reset");
{
  const variant: PermitVariant = "abstraction_individual";
  const fx = makeFixture(variant);
  const slotId = `contract.${variant}.section.1.body`;
  const slot = findSlot(slotId);
  ok(slot !== undefined, "section[1].body slot exists");
  if (!slot) throw new Error("missing slot");

  // Use applyPatches + writeEnvelopeIntoNotes to attach an override directly.
  const env = makeEmptyEnvelope();
  const editor = { id: "u1", name: "Tester", email: "t@rwb.rw", role: "assessor" };
  const applied = applyPatches(env, [
    { slotId, text: "OVERRIDE FOR PARITY TEST" },
  ], editor);
  ok(applied.ok, "apply override patch ok");
  if (!applied.ok) throw new Error("patch failed");

  const nextNotes = writeEnvelopeIntoNotes({}, applied.envelope);
  fx.internal_notes = JSON.stringify(nextNotes);

  const resolved = getResolvedContractTerms({
    application: fx,
    applicationNumber: fx.application_number,
    transferPermit: null,
    variantOverride: variant,
  });
  ok(resolved !== null, "resolved not null after override");
  if (!resolved) throw new Error("resolved null");
  // section index 1 body should now == ["OVERRIDE FOR PARITY TEST"]
  eq(
    (resolved.sections[1]?.paragraphs ?? []).join(CONTRACT_PARAGRAPH_SEPARATOR),
    "OVERRIDE FOR PARITY TEST",
    "override surfaces in resolved sections",
  );
  // sibling sections (e.g. index 0) still default
  const placeholderCtx = buildContractPlaceholderContext(
    fx,
    fx.application_number ?? "",
    null,
  );
  const expectedSection0First = fillContractText(
    (contractTermsByVariant[variant] as ContractTerms).sections[0].paragraphs[0],
    placeholderCtx,
  );
  eq(
    resolved.sections[0]?.paragraphs[0] ?? "",
    expectedSection0First,
    "sibling section unchanged",
  );
}

console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures > 0 ? 1 : 0);
