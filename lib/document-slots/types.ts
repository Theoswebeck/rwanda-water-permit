/**
 * Foundation types for the document text slot system.
 *
 * A "slot" is one named position in a document (Permit or Contract) where the
 * renderer emits text. Each slot has a stable id, a default resolver that
 * reproduces the text the renderer would emit today, and optional metadata
 * that the editor UI uses (label, group, language, structured-field link).
 *
 * Edits to slots are stored per-application in `applications.internal_notes`
 * under the `document_text_overrides` envelope. See
 * `lib/document-slots/envelope.ts` and `lib/document-slots/resolver.ts`.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md
 */

import type { PermitVariant } from "@/lib/permit-variant";

export type { PermitVariant };

export type DocumentKind = "permit" | "contract";
export type SlotLanguage = "en" | "rw";

/** Structured fields on the application record that a slot can mirror. */
export type StructuredFieldKey =
  | "volume_m3_per_year"
  | "duration_years"
  | "applicant_name"
  | "issue_date"
  | "expiry_date";

/**
 * Caller-provided context that {@link DocumentTextSlot.defaultResolver}
 * receives when computing the default text for a slot. Renderers build this
 * once from the application record and pass it to every `resolveSlotText`
 * call. Keeping it as `Record<string, unknown>` here keeps this module
 * dependency-free; concrete renderers narrow it to their own context type.
 */
export type SlotResolverContext = {
  application: {
    id: string;
    internal_notes?: unknown;
    [key: string]: unknown;
  };
  applicant?: Record<string, unknown> | null;
  /** Effective notes (raw notes + flattened document_overrides). */
  effectiveNotes: Record<string, any>;
  /** Permit variant for the active application. */
  variant: PermitVariant;
  /** Locale tag for date formatting; defaults to "en-GB" (DD/MM/YYYY). */
  locale?: string;
  /** Free-form bag for renderer-specific fields. */
  extras?: Record<string, unknown>;
};

export type DocumentTextSlot = {
  /** Stable, dotted id. Format: `<documentKind>.<variant>.<language>.<key>` or
   *  `<documentKind>.<variant>.section_<i>.paragraph_<j>.<language>` for the
   *  contract. Never reuse an id for a different position. */
  id: string;
  documentKind: DocumentKind;
  /** When set, the slot only applies to this variant. Cross-variant slots
   *  (very rare in v1) leave this undefined. */
  variant?: PermitVariant;
  language: SlotLanguage;
  /** Editor section header. */
  group: string;
  /** Editor row label. */
  label: string;
  /** Returns the text the renderer would emit today (with all dynamic values
   *  resolved). The result is the *snapshot* shown in the editor. */
  defaultResolver: (ctx: SlotResolverContext) => string;
  /** When set, the editor offers a "also update structured field?" prompt on
   *  save when the override differs from the resolved structured value. */
  structuredField?: StructuredFieldKey;
  /** Editor warning threshold (chars). Hard cap is 8000 regardless. */
  softMaxLength?: number;
  /** When true, the editor renders a single-line input instead of a textarea
   *  (useful for headers, badges, signature lines). Default false. */
  inline?: boolean;
};

/** Identifier for the actor who saved an override. */
export type SlotEditor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type DocumentTextOverrideEntry = {
  /** The override text. Must be a non-empty string when stored. To clear an
   *  override use the patch API with `text: null`, which deletes the key. */
  text: string;
  editedAt: string;
  editedBy: SlotEditor;
};

export type DocumentTextOverridesEnvelope = {
  /** Monotonic; bumped on every save. Acts as the optimistic-lock token. */
  version: number;
  /** ISO timestamp of the latest save. */
  updatedAt: string | null;
  /** Actor who last saved. */
  updatedBy: SlotEditor | null;
  /** Per-slot overrides. Missing key == no override. */
  values: Record<string, DocumentTextOverrideEntry>;
};

/** The shape stored under `internal_notes.document_text_overrides`. Same as
 *  {@link DocumentTextOverridesEnvelope} — explicit alias for clarity in API
 *  contracts and tests. */
export type StoredDocumentTextOverrides = DocumentTextOverridesEnvelope;

/** Single slot patch sent by the client. `text: null` clears the override. */
export type DocumentTextPatch = {
  slotId: string;
  text: string | null;
};

/** Hard length cap enforced server-side. Any patch exceeding this is rejected
 *  with a 400 validation error. */
export const HARD_MAX_SLOT_LENGTH = 8000;

/** Default soft warning threshold when a slot doesn't declare one. */
export const DEFAULT_SOFT_MAX_SLOT_LENGTH = 4000;
