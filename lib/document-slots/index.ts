/**
 * Public entry point for the document text slot system.
 *
 * Importing this module also imports the catalogue files for their
 * registration side-effects, so callers don't have to remember to load
 * `permit-slots` (and, in Phase 4, `contract-slots`) separately.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md
 */

import "./permit-slots";

export * from "./types";
export {
  makeEmptyEnvelope,
  getDocumentTextOverridesEnvelope,
  readEnvelopeForWrite,
  writeEnvelopeIntoNotes,
  applyPatches,
  type StrictEnvelopeReadResult,
  type ApplyPatchesResult,
} from "./envelope";
export {
  registerSlots,
  findSlot,
  getSlotsForDocument,
  SlotRegistrationError,
  __resetSlotRegistryForTests,
} from "./registry";
export {
  resolveSlotText,
  resolveSlotsForEditor,
  UnknownSlotError,
  type ResolvedSlotForEditor,
} from "./resolver";
