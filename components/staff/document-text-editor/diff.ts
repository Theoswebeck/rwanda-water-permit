/**
 * Tiny pure helpers for the editor's diff modal. No React, no DOM.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §6.4
 */

import type {
  ClientResolvedSlot,
  DiffEntry,
  PendingChange,
} from "./types";

/**
 * Reduce the live slot list + a draft map into one DiffEntry per slot whose
 * effective text actually changes. Drafts that match the current effective
 * text are filtered out (they're a no-op).
 */
export function buildDiffEntries(
  slots: ClientResolvedSlot[],
  drafts: Map<string, string | null>,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  const slotById = new Map(slots.map((s) => [s.slot.id, s]));

  for (const [slotId, draftText] of drafts) {
    const slot = slotById.get(slotId);
    if (!slot) continue;

    const before = slot.overrideText ?? slot.defaultText;
    let after: string;
    let kind: DiffEntry["kind"];

    if (draftText === null) {
      // Reset intent
      if (!slot.overrideText) continue; // already at default; no-op
      after = slot.defaultText;
      kind = "reset";
    } else {
      if (draftText === before) continue; // unchanged
      after = draftText;
      kind = slot.overrideText ? "update" : "set";
    }

    out.push({
      slotId,
      label: slot.slot.label,
      group: slot.slot.group,
      language: slot.slot.language,
      documentKind: slot.slot.documentKind,
      before,
      after,
      kind,
      structuredField: slot.slot.structuredField,
    });
  }
  return out;
}

/**
 * Word-level diff highlights. We render entries as <ins>/<del> spans so the
 * assessor can see which words changed. Pure string in / array of segments
 * out — the React rendering is in the modal component.
 */
export type DiffSegment =
  | { kind: "same"; text: string }
  | { kind: "del"; text: string }
  | { kind: "ins"; text: string };

/**
 * Naïve word-level diff using LCS over whitespace-tokenized arrays. Adequate
 * for permit/contract paragraphs (typically <500 words per slot) and avoids
 * pulling in a 6k-line `diff` package for one modal.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // LCS table
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Walk back to produce ops.
  const ops: DiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: "same", text: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: "del", text: a[i - 1] });
      i--;
    } else {
      ops.push({ kind: "ins", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: "del", text: a[i - 1] }); i--; }
  while (j > 0) { ops.push({ kind: "ins", text: b[j - 1] }); j--; }
  ops.reverse();
  // Coalesce runs of same-kind tokens.
  return coalesce(ops);
}

function tokenize(s: string): string[] {
  // Keep whitespace + punctuation as their own tokens so the rendered diff
  // doesn't lose spacing.
  return s.match(/(\s+|[A-Za-z0-9_'’-]+|[^\sA-Za-z0-9_])/g) ?? [];
}

function coalesce(ops: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.kind === op.kind) {
      last.text += op.text;
    } else {
      out.push({ ...op });
    }
  }
  return out;
}
