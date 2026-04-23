/**
 * Public entry point for the document text slot system.
 *
 * Phases 2 + 4 will register their catalogues here so a single import
 * (`@/lib/document-slots`) gives renderers access to every registered slot.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md
 */

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
