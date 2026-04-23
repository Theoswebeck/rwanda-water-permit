/**
 * Slot registry. Catalogues (permit-slots, contract-slots) call
 * {@link registerSlots} at module load time; renderers and the editor API
 * use {@link findSlot} / {@link getSlotsForDocument} to look them up.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4.1
 */

import type {
  DocumentKind,
  DocumentTextSlot,
  PermitVariant,
} from "./types";

const REGISTRY: Map<string, DocumentTextSlot> = new Map();
/** Insertion-order list per (kind, variant) for deterministic editor ordering. */
const ORDERED: DocumentTextSlot[] = [];

export class SlotRegistrationError extends Error {
  readonly slotId: string;
  constructor(message: string, slotId: string) {
    super(message);
    this.name = "SlotRegistrationError";
    this.slotId = slotId;
  }
}

/**
 * Register a batch of slots. Throws on duplicate id (catalogues are loaded
 * once at module init; a duplicate id is always a programmer error).
 */
export function registerSlots(slots: DocumentTextSlot[]): void {
  for (const slot of slots) {
    if (REGISTRY.has(slot.id)) {
      throw new SlotRegistrationError(`Duplicate slot id: ${slot.id}`, slot.id);
    }
    REGISTRY.set(slot.id, slot);
    ORDERED.push(slot);
  }
}

export function findSlot(slotId: string): DocumentTextSlot | undefined {
  return REGISTRY.get(slotId);
}

/**
 * Return slots for a given document, optionally filtered to a variant. When
 * `variant` is omitted, returns slots that have no variant constraint plus
 * variant-scoped slots for every variant. When `variant` is provided, returns
 * slots that either declare no variant or declare that exact variant.
 *
 * Order matches catalogue declaration order so the editor list is stable.
 */
export function getSlotsForDocument(
  documentKind: DocumentKind,
  variant?: PermitVariant,
): DocumentTextSlot[] {
  return ORDERED.filter((slot) => {
    if (slot.documentKind !== documentKind) return false;
    if (variant === undefined) return true;
    return slot.variant === undefined || slot.variant === variant;
  });
}

/**
 * Test helper — clear the registry. **Never** import this from production code.
 *
 * Guarded at runtime: throws when `NODE_ENV === "production"` to make the
 * footgun audible if it ever gets called from a server build. Tests must
 * import this directly from `./registry`, not from the package barrel
 * (`@/lib/document-slots`), which deliberately does not re-export it.
 */
export function __INTERNAL_resetSlotRegistryForTests(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__INTERNAL_resetSlotRegistryForTests must not run in production");
  }
  REGISTRY.clear();
  ORDERED.length = 0;
}
