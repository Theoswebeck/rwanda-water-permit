/**
 * Runtime invariant checks for lib/document-slots.
 *
 * Run with: npx tsx scripts/check-document-slots.ts
 *
 * Exits non-zero if any assertion fails. Used in lieu of a unit-test
 * framework (the repo doesn't have vitest/jest yet — see plan addendum).
 */

import {
  applyPatches,
  getDocumentTextOverridesEnvelope,
  makeEmptyEnvelope,
  readEnvelopeForWrite,
  writeEnvelopeIntoNotes,
} from "../lib/document-slots/envelope";
import {
  __INTERNAL_resetSlotRegistryForTests,
  findSlot,
  getSlotsForDocument,
  registerSlots,
  SlotRegistrationError,
} from "../lib/document-slots/registry";
import {
  resolveSlotText,
  resolveSlotsForEditor,
  UnknownSlotError,
} from "../lib/document-slots/resolver";
import type {
  DocumentTextSlot,
  SlotEditor,
  SlotResolverContext,
} from "../lib/document-slots/types";

let failures = 0;
let passes = 0;

function assert(cond: unknown, label: string): void {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const editor: SlotEditor = {
  id: "user-1",
  name: "Test Assessor",
  email: "test@rwb.rw",
  role: "assessor",
};

const ctxBase: SlotResolverContext = {
  application: { id: "app-1", internal_notes: null },
  applicant: null,
  effectiveNotes: {},
  variant: "abstraction_individual",
};

group("envelope: makeEmptyEnvelope", () => {
  const env = makeEmptyEnvelope();
  assert(env.version === 0, "version is 0");
  assert(env.updatedAt === null, "updatedAt is null");
  assert(env.updatedBy === null, "updatedBy is null");
  assert(Object.keys(env.values).length === 0, "values is empty");
});

group("envelope: getDocumentTextOverridesEnvelope from null/empty/garbage", () => {
  assert(getDocumentTextOverridesEnvelope(null).version === 0, "null notes → empty env");
  assert(getDocumentTextOverridesEnvelope("").version === 0, "empty string → empty env");
  assert(getDocumentTextOverridesEnvelope("not json").version === 0, "garbage → empty env");
  assert(
    getDocumentTextOverridesEnvelope({ document_text_overrides: { version: 5, values: {} } })
      .version === 5,
    "valid object → version preserved",
  );
});

group("envelope: readEnvelopeForWrite distinguishes empty vs corrupt", () => {
  const okEmpty = readEnvelopeForWrite(null);
  assert(okEmpty.ok === true, "null is ok");
  const okStr = readEnvelopeForWrite('{"foo":"bar"}');
  assert(okStr.ok === true && okStr.envelope.version === 0, "valid JSON without envelope is ok");
  const corrupt = readEnvelopeForWrite("legacy plain text note");
  assert(corrupt.ok === false, "non-JSON string is rejected");
  if (!corrupt.ok) {
    assert(corrupt.reason === "invalid_json", "corrupt reason is invalid_json");
  }
});

group("envelope: applyPatches purity + version bump + null delete", () => {
  const start = makeEmptyEnvelope();
  const r1 = applyPatches(start, [{ slotId: "a.b", text: "hello" }], editor, new Date("2026-04-23T10:00:00Z"));
  assert(r1.ok === true, "first patch ok");
  if (r1.ok) {
    assert(r1.envelope.version === 1, "version bumped to 1");
    assert(r1.envelope.values["a.b"]?.text === "hello", "value stored");
    assert(r1.envelope.values["a.b"]?.editedBy.id === "user-1", "editor recorded");
    assert(start.version === 0, "input envelope NOT mutated");
  }

  if (r1.ok) {
    const r2 = applyPatches(r1.envelope, [{ slotId: "a.b", text: "hello" }], editor);
    assert(r2.ok === true && r2.appliedCount === 0, "no-op patch does not bump version");
    if (r2.ok) {
      assert(r2.envelope.version === 1, "version unchanged when no state change");
    }
  }

  if (r1.ok) {
    const r3 = applyPatches(r1.envelope, [{ slotId: "a.b", text: null }], editor);
    assert(r3.ok === true, "null patch ok");
    if (r3.ok) {
      assert(r3.envelope.version === 2, "delete bumps version");
      assert(!("a.b" in r3.envelope.values), "key deleted");
    }
  }

  const r4 = applyPatches(start, [{ slotId: "a.b", text: "" }], editor);
  assert(r4.ok === false, "empty string rejected");

  const r5 = applyPatches(start, [{ slotId: "a.b", text: "x".repeat(8001) }], editor);
  assert(r5.ok === false, "over-cap rejected");
});

group("envelope: writeEnvelopeIntoNotes is pure", () => {
  const notes: Record<string, any> = { foo: "bar" };
  const env = makeEmptyEnvelope();
  const out = writeEnvelopeIntoNotes(notes, env);
  assert(out !== notes, "returns a new object");
  assert(notes.document_text_overrides === undefined, "input not mutated");
  assert(out.foo === "bar", "other notes preserved");
  assert(out.document_text_overrides.version === 0, "envelope embedded");
});

group("registry + resolver: register, find, resolve, override", () => {
  __INTERNAL_resetSlotRegistryForTests();

  const slotA: DocumentTextSlot = {
    id: "permit.test.en.alpha",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: "Test",
    label: "Alpha",
    defaultResolver: () => "ALPHA-DEFAULT",
  };
  const slotB: DocumentTextSlot = {
    id: "permit.test.en.beta",
    documentKind: "permit",
    variant: "abstraction_individual",
    language: "en",
    group: "Test",
    label: "Beta",
    defaultResolver: (c) => `BETA-${c.application.id}`,
  };
  const slotC: DocumentTextSlot = {
    id: "contract.test.rw.gamma",
    documentKind: "contract",
    variant: "concession_organization",
    language: "rw",
    group: "Test",
    label: "Gamma",
    defaultResolver: () => "GAMMA-DEFAULT",
  };
  registerSlots([slotA, slotB, slotC]);

  assert(findSlot("permit.test.en.alpha")?.id === "permit.test.en.alpha", "findSlot ok");
  assert(findSlot("nope") === undefined, "findSlot miss returns undefined");

  let dupErr: SlotRegistrationError | null = null;
  try {
    registerSlots([slotA]);
  } catch (e) {
    if (e instanceof SlotRegistrationError) dupErr = e;
  }
  assert(dupErr !== null && dupErr.slotId === "permit.test.en.alpha", "duplicate id throws");

  const permitSlots = getSlotsForDocument("permit", "abstraction_individual");
  assert(permitSlots.length === 2, "permit/abstraction_individual returns 2 slots");
  const contractSlots = getSlotsForDocument("contract", "concession_organization");
  assert(contractSlots.length === 1 && contractSlots[0].id === slotC.id, "contract slot filter ok");
  const otherVariant = getSlotsForDocument("permit", "concession_individual");
  assert(otherVariant.length === 0, "wrong variant returns no slots");

  // Default resolution
  assert(resolveSlotText("permit.test.en.alpha", ctxBase) === "ALPHA-DEFAULT", "default resolver runs");
  assert(
    resolveSlotText("permit.test.en.beta", ctxBase) === "BETA-app-1",
    "default resolver receives ctx",
  );

  // Override wins
  const ctxWithOverride: SlotResolverContext = {
    ...ctxBase,
    application: {
      ...ctxBase.application,
      internal_notes: JSON.stringify({
        document_text_overrides: {
          version: 1,
          updatedAt: "2026-04-23T10:00:00Z",
          updatedBy: editor,
          values: {
            "permit.test.en.alpha": {
              text: "ALPHA-OVERRIDE",
              editedAt: "2026-04-23T10:00:00Z",
              editedBy: editor,
            },
          },
        },
      }),
    },
  };
  assert(
    resolveSlotText("permit.test.en.alpha", ctxWithOverride) === "ALPHA-OVERRIDE",
    "override beats default",
  );
  assert(
    resolveSlotText("permit.test.en.beta", ctxWithOverride) === "BETA-app-1",
    "non-overridden slot still uses default",
  );

  // Unknown slot
  let unknownErr: UnknownSlotError | null = null;
  try {
    resolveSlotText("permit.test.en.zeta", ctxBase);
  } catch (e) {
    if (e instanceof UnknownSlotError) unknownErr = e;
  }
  assert(unknownErr !== null && unknownErr.slotId === "permit.test.en.zeta", "unknown slot throws");

  // Editor list shape
  const list = resolveSlotsForEditor("permit", "abstraction_individual", ctxWithOverride, getSlotsForDocument("permit"));
  assert(list.length === 2, "editor list has 2 entries");
  const alphaEntry = list.find((e) => e.slot.id === "permit.test.en.alpha");
  const betaEntry = list.find((e) => e.slot.id === "permit.test.en.beta");
  assert(alphaEntry?.overrideText === "ALPHA-OVERRIDE", "alpha override surfaced");
  assert(alphaEntry?.defaultText === "ALPHA-DEFAULT", "alpha default surfaced");
  assert(betaEntry?.overrideText === null, "beta has no override");
  assert(betaEntry?.editedBy === null, "beta editor null");

  __INTERNAL_resetSlotRegistryForTests();
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
