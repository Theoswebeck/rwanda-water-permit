/**
 * Pure helpers for reading/writing the `document_text_overrides` envelope
 * inside `applications.internal_notes`.
 *
 * Storage shape:
 *   internal_notes (TEXT column, JSON-encoded object) → key `document_text_overrides`:
 *     {
 *       version: number,
 *       updatedAt: string | null,
 *       updatedBy: { id, name, email, role } | null,
 *       values: { [slotId]: { text, editedAt, editedBy } }
 *     }
 *
 * No I/O here — read paths take the raw notes value, write paths return a new
 * notes object. Persistence happens in the API route inside a transaction
 * that holds a row-level lock (see `app/api/staff/applications/[id]/document-text-overrides/route.ts`).
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4.2, §4.5
 */

import {
  parseInternalNotes,
  parseInternalNotesStrict,
  type StrictParseResult,
} from "@/lib/document-overrides";
import type {
  DocumentTextOverrideEntry,
  DocumentTextOverridesEnvelope,
  DocumentTextPatch,
  SlotEditor,
} from "./types";
import { HARD_MAX_SLOT_LENGTH } from "./types";

const ENVELOPE_KEY = "document_text_overrides";

export function makeEmptyEnvelope(): DocumentTextOverridesEnvelope {
  return { version: 0, updatedAt: null, updatedBy: null, values: {} };
}

/**
 * Coerce arbitrary input into a {@link SlotEditor}.
 *
 * Returns `null` only when the actor cannot reasonably be identified at all
 * (no id+name+email). `role` is *tolerated as missing* and defaults to
 * `"unknown"` — older envelopes written before the `role` field existed (or
 * by future feature flags that omitted it) must not silently lose their
 * `editedBy` audit trail.
 */
function coerceEditor(value: unknown): SlotEditor | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.name !== "string" || !o.name) return null;
  if (typeof o.email !== "string" || !o.email) return null;
  const role = typeof o.role === "string" && o.role ? o.role : "unknown";
  return { id: o.id, name: o.name, email: o.email, role };
}

function coerceEntry(raw: unknown): DocumentTextOverrideEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.text !== "string" || o.text === "") return null;
  if (typeof o.editedAt !== "string" || !o.editedAt) return null;
  const editor = coerceEditor(o.editedBy);
  if (!editor) return null;
  return {
    text: o.text,
    editedAt: o.editedAt,
    editedBy: editor,
  };
}

function coerceEnvelope(raw: unknown): DocumentTextOverridesEnvelope {
  const env = makeEmptyEnvelope();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return env;
  const o = raw as Record<string, unknown>;
  if (typeof o.version === "number" && Number.isFinite(o.version)) {
    env.version = Math.max(0, Math.trunc(o.version));
  }
  if (typeof o.updatedAt === "string" && o.updatedAt) env.updatedAt = o.updatedAt;
  const updatedBy = coerceEditor(o.updatedBy);
  if (updatedBy) env.updatedBy = updatedBy;
  if (o.values && typeof o.values === "object" && !Array.isArray(o.values)) {
    for (const [slotId, raw2] of Object.entries(o.values as Record<string, unknown>)) {
      if (typeof slotId !== "string" || !slotId) continue;
      const entry = coerceEntry(raw2);
      if (entry) env.values[slotId] = entry;
    }
  }
  return env;
}

/**
 * Best-effort read. Used by render paths that must never throw — if the
 * column is corrupt we fall back to "no overrides" rather than blowing up
 * PDF generation.
 */
export function getDocumentTextOverridesEnvelope(
  notesRaw: unknown,
): DocumentTextOverridesEnvelope {
  const notes = parseInternalNotes(notesRaw);
  return coerceEnvelope(notes[ENVELOPE_KEY]);
}

/**
 * Strict read for write paths. Mirrors {@link parseInternalNotesStrict}: an
 * empty/whitespace-only column is treated as `{}`, but a non-empty
 * unparseable column returns `ok: false` so the caller can return 409 instead
 * of silently overwriting legacy data.
 */
export type StrictEnvelopeReadResult =
  | {
      ok: true;
      /** The full notes object (parsed); use this when writing back. */
      notes: Record<string, any>;
      envelope: DocumentTextOverridesEnvelope;
    }
  | {
      ok: false;
      reason: "non_object" | "invalid_json";
      rawPreview: string;
    };

export function readEnvelopeForWrite(notesRaw: unknown): StrictEnvelopeReadResult {
  const parsed: StrictParseResult = parseInternalNotesStrict(notesRaw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, rawPreview: parsed.rawPreview };
  }
  const envelope = coerceEnvelope(parsed.value[ENVELOPE_KEY]);
  return { ok: true, notes: parsed.value, envelope };
}

/**
 * Returns a new notes object with the given envelope written back under the
 * `document_text_overrides` key. Pure — does not mutate the input.
 */
export function writeEnvelopeIntoNotes(
  notes: Record<string, any>,
  envelope: DocumentTextOverridesEnvelope,
): Record<string, any> {
  const out: Record<string, any> = { ...notes };
  out[ENVELOPE_KEY] = {
    version: envelope.version,
    updatedAt: envelope.updatedAt,
    updatedBy: envelope.updatedBy,
    values: { ...envelope.values },
  };
  return out;
}

export type ApplyPatchesResult =
  | { ok: true; envelope: DocumentTextOverridesEnvelope; appliedCount: number }
  | { ok: false; reason: "too_long" | "empty_text"; slotId: string; detail?: string };

/**
 * Pure patch application. Returns a new envelope with each patch applied.
 *
 * - `text === null` deletes the slot key (reset to default).
 * - `text === ""` is rejected (use `null` to reset). Spec §4.3.
 * - `text` longer than {@link HARD_MAX_SLOT_LENGTH} is rejected.
 * - `version` is bumped only when at least one patch actually changes state.
 * - `updatedAt` / `updatedBy` are set to the new editor + timestamp when any
 *   patch changes state (deletes count as state change).
 *
 * Slot-id catalogue validation (does the slot exist? does its variant
 * match?) is the API-route's responsibility, not this function's. This
 * function is a dumb storage primitive.
 */
export function applyPatches(
  current: DocumentTextOverridesEnvelope,
  patches: DocumentTextPatch[],
  editor: SlotEditor,
  now: Date = new Date(),
): ApplyPatchesResult {
  const nextValues: Record<string, DocumentTextOverrideEntry> = { ...current.values };
  let stateChanged = false;
  let appliedCount = 0;

  for (const patch of patches) {
    if (typeof patch.slotId !== "string" || !patch.slotId) {
      return { ok: false, reason: "empty_text", slotId: String(patch.slotId), detail: "Slot id missing" };
    }
    if (patch.text === null) {
      if (patch.slotId in nextValues) {
        delete nextValues[patch.slotId];
        stateChanged = true;
        appliedCount += 1;
      }
      continue;
    }
    if (typeof patch.text !== "string") {
      return { ok: false, reason: "empty_text", slotId: patch.slotId };
    }
    if (patch.text === "") {
      return { ok: false, reason: "empty_text", slotId: patch.slotId };
    }
    if (patch.text.length > HARD_MAX_SLOT_LENGTH) {
      return { ok: false, reason: "too_long", slotId: patch.slotId };
    }
    const existing = nextValues[patch.slotId];
    if (existing && existing.text === patch.text) continue;
    nextValues[patch.slotId] = {
      text: patch.text,
      editedAt: now.toISOString(),
      editedBy: editor,
    };
    stateChanged = true;
    appliedCount += 1;
  }

  if (!stateChanged) {
    return { ok: true, envelope: current, appliedCount: 0 };
  }

  const nextEnvelope: DocumentTextOverridesEnvelope = {
    version: current.version + 1,
    updatedAt: now.toISOString(),
    updatedBy: editor,
    values: nextValues,
  };
  return { ok: true, envelope: nextEnvelope, appliedCount };
}
