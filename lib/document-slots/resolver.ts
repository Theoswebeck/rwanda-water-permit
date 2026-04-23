/**
 * Renderer-facing helper for resolving slot text at PDF generation time.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4.3
 */

import { getDocumentTextOverridesEnvelope } from "./envelope";
import { findSlot } from "./registry";
import type {
  DocumentKind,
  DocumentTextSlot,
  PermitVariant,
  SlotResolverContext,
} from "./types";

export class UnknownSlotError extends Error {
  readonly slotId: string;
  constructor(slotId: string) {
    super(`Unknown slot id: ${slotId}`);
    this.name = "UnknownSlotError";
    this.slotId = slotId;
  }
}

/**
 * Returns the text the renderer should emit for the given slot id. Override
 * wins when present; otherwise the slot's own `defaultResolver` runs.
 *
 * Throws {@link UnknownSlotError} when the slot id is not registered — this
 * is always a renderer bug (typo in the slot id), and silently emitting an
 * empty string would corrupt the PDF.
 */
export function resolveSlotText(slotId: string, ctx: SlotResolverContext): string {
  const slot = findSlot(slotId);
  if (!slot) throw new UnknownSlotError(slotId);
  const env = getDocumentTextOverridesEnvelope(ctx.application.internal_notes);
  const override = env.values[slotId];
  // Explicit `!== ""` so that any future code path that bypasses
  // `coerceEntry` and writes an empty string still falls back to the default
  // (an empty override is never a valid edit per spec §4.3).
  if (override && override.text !== "") return override.text;
  return slot.defaultResolver(ctx);
}

/** Resolved entry returned by {@link resolveSlotsForEditor}. */
export type ResolvedSlotForEditor = {
  slot: DocumentTextSlot;
  defaultText: string;
  /** Null when no override present. Empty string is never returned (would not
   *  be a valid override per envelope rules). */
  overrideText: string | null;
  editedAt: string | null;
  editedBy: { id: string; name: string; email: string; role: string } | null;
};

/**
 * Returns one entry per slot for the given document/variant, with both the
 * resolved default and the current override (if any). The editor UI consumes
 * this list to prefill its rows.
 */
export function resolveSlotsForEditor(
  documentKind: DocumentKind,
  variant: PermitVariant | undefined,
  ctx: SlotResolverContext,
  slots: DocumentTextSlot[],
): ResolvedSlotForEditor[] {
  const env = getDocumentTextOverridesEnvelope(ctx.application.internal_notes);
  return slots
    .filter((slot) => {
      if (slot.documentKind !== documentKind) return false;
      if (variant === undefined) return true;
      return slot.variant === undefined || slot.variant === variant;
    })
    .map((slot) => {
      const override = env.values[slot.id];
      let defaultText = "";
      try {
        defaultText = slot.defaultResolver(ctx);
      } catch (err) {
        // A buggy resolver shouldn't 500 the whole editor; surface a marker
        // string and let the assessor see the slot exists.
        defaultText = `[default-resolver-error: ${(err as Error).message}]`;
      }
      return {
        slot,
        defaultText,
        overrideText: override ? override.text : null,
        editedAt: override ? override.editedAt : null,
        editedBy: override ? override.editedBy : null,
      };
    });
}
