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
import "./contract-slots";

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
} from "./registry";
// __INTERNAL_resetSlotRegistryForTests is deliberately NOT re-exported. Test
// scripts that need it must import from "./registry" directly.
export {
  resolveSlotText,
  resolveSlotsForEditor,
  isDateBearingSlot,
  UnknownSlotError,
  type ResolvedSlotForEditor,
} from "./resolver";
export { CONTRACT_PARAGRAPH_SEPARATOR } from "./contract-slots";
export {
  getResolvedContractTerms,
  type GetResolvedContractTermsInput,
} from "./contract-resolver";
