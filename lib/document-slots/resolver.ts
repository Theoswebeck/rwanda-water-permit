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
 * Slots whose rendered text is fully derived from the permit's issuance /
 * expiry date. These are always re-resolved from the live `ctx.permit.*`
 * values; any saved override is ignored (and silently dropped from the
 * editor list — see {@link resolveSlotsForEditor}).
 *
 * Why: the assessor preview can sit in `pending_final_approval` for several
 * days before the relevant party signs terms. If the assessor saved the
 * preview on day N, the closing date and validity-period paragraphs would
 * have frozen with day N's date string. On day N+1 the preview would still
 * show day N — wrong, and there is no clean way for the assessor to "unsave"
 * a date once it's locked into prose. The simplest fix is to treat date
 * slots as system-managed: the assessor cannot edit them and stale
 * snapshots are never honoured.
 *
 * The marker is the slot's `structuredField` link — every date-bearing slot
 * already declares either `issue_date` or `expiry_date`, so the rule
 * extends automatically to any future date slot a developer adds.
 */
const DATE_BEARING_STRUCTURED_FIELDS: ReadonlySet<string> = new Set([
  "issue_date",
  "expiry_date",
]);

export function isDateBearingSlot(slot: DocumentTextSlot): boolean {
  return Boolean(
    slot.structuredField && DATE_BEARING_STRUCTURED_FIELDS.has(slot.structuredField),
  );
}

/**
 * Matches every permit-number format the renderer or assessors might type:
 *   `0918/RWB/2026`, `918/RWB/2026`, `WP-0918/RWB/2026`, `RWBP-2026-0918`.
 * Also matches the `XXXXXX/RWB/2026` placeholder stored in slot overrides
 * when an assessor saved the contract before the real permit number was
 * assigned by the DB trigger — those X-placeholder strings were never caught
 * by the original `\d{1,6}` pattern and leaked to the applicant's view.
 *
 * Used to canonicalise override text at render time. An assessor who pre-typed
 * a permit number into a contract/permit body slot (e.g. on 2026-05-06 for
 * UFURATE LIFE INDUSTRY → `918/RWB/2026`) used to win over the actual number
 * assigned by the DB trigger at terms acceptance (`0920/RWB/2026`), causing
 * the applicant's PDF and the staff registry to show different numbers.
 * Substituting any pattern match with the canonical `ctx.permit.permitNumber`
 * guarantees that — no matter what's in the override — the rendered PDF and
 * the DB agree.
 */
const PERMIT_NUMBER_PATTERN = /(?:WP-)?(?:\d|X){1,6}\/RWB\/\d{4}|RWBP-\d{4}-(?:\d|X){1,6}/gi;

/** Pull the 4-digit year segment out of any supported permit-number format,
 *  or `null` if the input isn't a recognisable permit number. */
function extractPermitNumberYear(value: string): string | null {
  const slash = value.match(/^(?:WP-)?(?:\d|X){1,6}\/RWB\/(\d{4})$/i);
  if (slash) return slash[1];
  const rwbp = value.match(/^RWBP-(\d{4})-(?:\d|X){1,6}$/i);
  if (rwbp) return rwbp[1];
  return null;
}

function canonicaliseEmbeddedPermitNumber(text: string, canonical: string | undefined): string {
  if (!canonical) return text;
  const canonicalYear = extractPermitNumberYear(canonical);
  if (!canonicalYear) return text;
  // Only rewrite matches that belong to the same issuance year as the
  // canonical permit number. Renewal/transfer/modification documents
  // legitimately reference the ORIGINAL permit (different year) in section
  // body text — those references must be preserved verbatim. The bug we are
  // guarding against is an assessor pre-typing the wrong digits for the
  // permit being issued *right now*, which is always the same-year number.
  return text.replace(PERMIT_NUMBER_PATTERN, (match) => {
    const matchYear = extractPermitNumberYear(match);
    return matchYear === canonicalYear ? canonical : match;
  });
}

/**
 * Returns the text the renderer should emit for the given slot id. Override
 * wins when present; otherwise the slot's own `defaultResolver` runs.
 *
 * Throws {@link UnknownSlotError} when the slot id is not registered — this
 * is always a renderer bug (typo in the slot id), and silently emitting an
 * empty string would corrupt the PDF.
 *
 * Date-bearing slots (closing date line, validity-period paragraphs) ignore
 * any saved override and always re-resolve from the live context, so a
 * stale snapshot from a previous-day preview cannot leak into the rendered
 * PDF. See {@link DATE_BEARING_STRUCTURED_FIELDS}.
 */
export function resolveSlotText(slotId: string, ctx: SlotResolverContext): string {
  const slot = findSlot(slotId);
  if (!slot) throw new UnknownSlotError(slotId);
  if (isDateBearingSlot(slot)) {
    return slot.defaultResolver(ctx);
  }
  const env = getDocumentTextOverridesEnvelope(ctx.application.internal_notes);
  const override = env.values[slotId];
  const baseText =
    override && override.text !== "" ? override.text : slot.defaultResolver(ctx);
  // Canonical permit number always wins over any number an assessor typed.
  // See PERMIT_NUMBER_PATTERN docblock above for the historical incident this
  // guards against.
  return canonicaliseEmbeddedPermitNumber(baseText, ctx.permit?.permitNumber);
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
 *
 * Date-bearing slots ({@link isDateBearingSlot}) always report
 * `overrideText === null`, regardless of what the envelope holds — the
 * renderer ignores those overrides anyway, so showing them in the editor
 * (or in the approver "changed slots" pane) would be misleading. The
 * underlying envelope row is left intact for audit history; the next save
 * naturally garbage-collects it because the editor never sends it back.
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
      const dateBearing = isDateBearingSlot(slot);
      const override = dateBearing ? undefined : env.values[slot.id];
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
