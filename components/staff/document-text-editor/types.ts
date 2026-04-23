/**
 * Shared client-side types for the document text editor. Kept narrower than
 * the server-side {@link DocumentTextSlot} so we don't accidentally try to
 * serialize the {@code defaultResolver} function across the network.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §6
 */

export type ClientDocumentKind = "permit" | "contract";
export type ClientSlotLanguage = "en" | "rw" | "bilingual";

export type ClientSlotMeta = {
  id: string;
  documentKind: ClientDocumentKind;
  variant?: string;
  language: ClientSlotLanguage;
  group: string;
  label: string;
  structuredField?: string;
  softMaxLength?: number;
  inline: boolean;
};

export type ClientSlotEditor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type ClientResolvedSlot = {
  slot: ClientSlotMeta;
  defaultText: string;
  overrideText: string | null;
  editedAt: string | null;
  editedBy: ClientSlotEditor | null;
};

export type ClientEnvelope = {
  version: number;
  updatedAt: string | null;
  updatedBy: ClientSlotEditor | null;
  values: Record<
    string,
    {
      text: string;
      editedAt: string;
      editedBy: ClientSlotEditor;
    }
  >;
};

export type EditorPayload = {
  success: true;
  envelope: ClientEnvelope;
  variant: string;
  hardMaxLength: number;
  permitSlots: ClientResolvedSlot[];
  contractSlots: ClientResolvedSlot[];
};

/** Pending change in the editor before save. `text === null` is a "reset to
 *  default" intent — only meaningful when the slot currently has an override. */
export type PendingChange = {
  slotId: string;
  /** New value being typed. `null` when user clicked Reset. */
  draftText: string | null;
};

/** A computed diff entry for the confirmation modal. */
export type DiffEntry = {
  slotId: string;
  label: string;
  group: string;
  language: ClientSlotLanguage;
  documentKind: ClientDocumentKind;
  /** Text that will be rendered in the PDF/preview today. */
  before: string;
  /** Text that will be rendered after save. */
  after: string;
  kind: "set" | "reset" | "update";
  structuredField?: string;
};
