/**
 * Inline bold-marker handling for slot text.
 *
 * Convention: slot text uses Markdown-style `**bold**` markers to opt into
 * emphasis. As of 2026-08 (RWB feedback) the markers come from the slot
 * DEFAULTS — the template's required emphasis is applied automatically and
 * assessors are never instructed to type markers themselves. The same source
 * string is:
 *   - rendered as alternating regular/bold runs by the permit PDF renderer
 *     (`drawRichText` in `lib/pdf-permit-server.ts`), and
 *   - stored verbatim in `internal_notes.document_text_overrides.values[*].text`.
 *
 * Escape rule: a literal four-character sequence `\*\*` is escaped — it is
 * treated as text and renders as a visible `**` in the PDF without toggling
 * emphasis. Legacy overrides that rely on this keep rendering unchanged.
 *
 * Robustness rule (two layers):
 *   1. ON SAVE, the overrides API runs `repairBoldMarkers` over the submitted
 *      text and STORES the repaired string, so unbalanced markers can never
 *      reach an issued permit. The assessor is not asked to fix anything and
 *      the save is not blocked — the stored value, the preview and the PDF all
 *      agree because they all read the same repaired text.
 *   2. AT RENDER time, `parseBoldRuns` still normalises anything unbalanced
 *      that predates layer 1 (legacy overrides): the trailing unmatched marker
 *      is folded back into the preceding segment as literal text, so a typo
 *      like `"Mister **Smith"` renders as `Mister **Smith` (regular weight)
 *      instead of cascade-bolding the rest of the paragraph.
 * `hasBalancedBoldMarkers` is no longer an API gate; it drives the editor's
 * informational hint and the parity-script invariants.
 *
 * Used by:
 *   - lib/pdf-permit-server.ts (rich-text rendering + stripping markers in
 *     non-rich slot paths)
 *   - components/staff/document-text-editor/slot-row.tsx (formatted preview)
 *   - scripts/check-permit-slots-parity.ts (parser invariants)
 */

// Sentinel that cannot appear in real slot text. SOH (U+0001) is rejected by
// almost every editor and would never survive a copy-paste from a Word doc
// or browser textarea, so we can use it as a private marker while parsing.
const BOLD_ESCAPE_SENTINEL = "\u0001";
// Matches the literal four characters `\`, `*`, `\`, `*` (the escape form
// users type to get a visible `**` in the PDF).
const BOLD_ESCAPE_PATTERN = /\\\*\\\*/g;

export interface BoldRun {
  readonly text: string;
  readonly bold: boolean;
}

/**
 * Strip every `**` marker from `text` and unescape any `\*\*` to a literal
 * `**`. Used by non-rich-text PDF emitters (title, closing block, footers,
 * modified-permit badge) so that a slot whose value contains stray markers
 * never leaks them into the final document.
 */
export function stripBoldMarkers(text: string): string {
  return text
    .replace(BOLD_ESCAPE_PATTERN, BOLD_ESCAPE_SENTINEL)
    .replace(/\*\*/g, "")
    .split(BOLD_ESCAPE_SENTINEL)
    .join("**");
}

/**
 * Parse `text` into alternating regular/bold runs. Escaped `\*\*` survives as
 * literal `**` in run text. Unbalanced markers are normalised: the trailing
 * unmatched `**` is folded back into the preceding regular run as literal
 * characters, which prevents a typo from cascade-bolding the rest of the
 * paragraph.
 *
 * Examples:
 *   `foo **bold** rest`        -> [reg "foo ", bold "bold", reg " rest"]
 *   `foo **unclosed`           -> [reg "foo **unclosed"]    (normalised)
 *   `\*\*literal\*\*`          -> [reg "**literal**"]       (escaped)
 *   `****`                     -> [reg "", bold "", reg ""]
 *
 * Note: a single isolated `**` followed by other characters and another `**`
 * elsewhere (e.g. inside a URL or path) is treated as balanced markers and
 * the slice between them is bolded — that's an inherent ambiguity of the
 * markdown convention; accidental interpretation of a path is the
 * worst-case price for keeping the parser simple.
 */
export function parseBoldRuns(text: string): BoldRun[] {
  const escaped = text.replace(BOLD_ESCAPE_PATTERN, BOLD_ESCAPE_SENTINEL);
  const parts = escaped.split("**");
  let normalised: string[];
  if (parts.length % 2 === 1) {
    // Balanced — every opener has a closer.
    normalised = parts;
  } else {
    // Unbalanced — fold the trailing unmatched `**` back into the last two
    // segments as a literal, so a typo never cascades.
    const head = parts.slice(0, -2);
    const tail = parts.slice(-2).join("**");
    normalised = [...head, tail];
  }
  return normalised.map((p, i) => ({
    text: p.split(BOLD_ESCAPE_SENTINEL).join("**"),
    bold: i % 2 === 1,
  }));
}

export type BoldMarkerRepairKind =
  | "none"
  /** an odd, marker-shaped lone `*` was completed back into a `**` pair */
  | "completed"
  /** the unmatched trailing `**` was removed */
  | "dropped"
  /** a run of 3+ asterisks was collapsed back to a single `**` marker */
  | "collapsed";

export interface BoldMarkerRepair {
  /** the text that should be STORED and rendered */
  readonly text: string;
  readonly changed: boolean;
  readonly kind: BoldMarkerRepairKind;
}

/**
 * Auto-repair the `**` markers of assessor-edited slot text so that no
 * unbalanced marker can ever reach an issued permit.
 *
 * Why repair instead of rejecting: since 2026-08 the markers arrive baked into
 * the slot DEFAULTS and assessors are never taught the syntax, so a 400 would
 * ask them to reason about something they were never told about. But
 * `parseBoldRuns` deliberately folds an unmatched marker back into the text as
 * LITERAL characters, which means an unbalanced save would print a visible
 * `**` inside a signed, issued legal document. Repairing on save satisfies
 * both: the assessor does nothing and the PDF is always clean.
 *
 * Rules (escaped `\*\*` is protected throughout and never counted or altered):
 *   1. a run of 3 or more `*` can only come from a mangled marker -> collapse
 *      it to exactly `**`;
 *   2. if the number of `**` markers is then ODD:
 *      a. if the text contains exactly ONE lone `*` AND that `*` hugs a
 *         non-space character (the shape every real marker has), it is almost
 *         certainly the clipped half of a marker (the classic "shortened the
 *         holder name and deleted one asterisk" edit) -> promote it to `**`,
 *         which restores the emphasis the template intended. A free-standing
 *         asterisk in prose ("5 * 10") is never promoted;
 *      b. otherwise remove the last, unmatched `**`, so the text renders
 *         cleanly with no stray asterisks (the earlier pairs keep their bold).
 *   3. balanced, well-formed text is returned byte-identical (`changed: false`).
 *
 * Note: slot defaults never contain a lone `*` (they are legal prose), so rule
 * 2a cannot mis-fire on template text; a lone `*` in prose only matters when
 * the markers are ALREADY broken, and even then the result is clean output.
 */
/** True when a single `*` at `index` sits directly against a non-space
 *  character — the shape a real `**` marker always has. */
function isMarkerShapedLoneStar(text: string, index: number): boolean {
  const before = index > 0 ? text[index - 1] : "";
  const after = index + 1 < text.length ? text[index + 1] : "";
  const hugsBefore = before !== "" && !/\s/.test(before);
  const hugsAfter = after !== "" && !/\s/.test(after);
  return hugsBefore || hugsAfter;
}

export function repairBoldMarkers(text: string): BoldMarkerRepair {
  const escaped = text.replace(BOLD_ESCAPE_PATTERN, BOLD_ESCAPE_SENTINEL);
  if (!escaped.includes("*")) {
    return { text, changed: false, kind: "none" };
  }

  type Run = { index: number; length: number };
  const runs: Run[] = [];
  const runPattern = /\*+/g;
  let match: RegExpExecArray | null;
  while ((match = runPattern.exec(escaped)) !== null) {
    runs.push({ index: match.index, length: match[0].length });
  }

  const markerRuns = runs.filter((r) => r.length >= 2);
  const loneRuns = runs.filter((r) => r.length === 1);
  const hasOverlongRun = markerRuns.some((r) => r.length > 2);
  const balanced = markerRuns.length % 2 === 0;
  if (balanced && !hasOverlongRun) {
    return { text, changed: false, kind: "none" };
  }

  // Decide what to do with the odd marker (if any).
  let kind: BoldMarkerRepairKind = hasOverlongRun ? "collapsed" : "none";
  let promoteIndex: number | null = null;
  let dropIndex: number | null = null;
  if (!balanced) {
    // A lone `*` only counts as a clipped marker when it HUGS the text it was
    // emphasising (as every real marker does: `**Name**`). An asterisk floating
    // between spaces ("5 * 10", "see note *") is ordinary prose and is left
    // alone — promoting it would both invent a bold span and swallow the
    // character.
    const clipped =
      loneRuns.length === 1 && isMarkerShapedLoneStar(escaped, loneRuns[0].index);
    if (clipped) {
      promoteIndex = loneRuns[0].index;
      kind = "completed";
    } else {
      dropIndex = markerRuns[markerRuns.length - 1].index;
      kind = "dropped";
    }
  }

  let out = "";
  let cursor = 0;
  for (const run of runs) {
    out += escaped.slice(cursor, run.index);
    cursor = run.index + run.length;
    if (run.length === 1) {
      out += run.index === promoteIndex ? "**" : "*";
    } else {
      out += run.index === dropIndex ? "" : "**";
    }
  }
  out += escaped.slice(cursor);

  const repaired = out.split(BOLD_ESCAPE_SENTINEL).join("\\*\\*");
  return { text: repaired, changed: repaired !== text, kind };
}

/**
 * Returns true iff every `**` opener has a matching closer (after `\*\*`
 * escapes are removed). No longer used as an API gate — unbalanced input is
 * auto-repaired on save by `repairBoldMarkers` and, as a last resort at render
 * time, normalised by `parseBoldRuns`. Kept for legacy callers, the editor's
 * informational hint, and the parity-script invariants.
 */
export function hasBalancedBoldMarkers(text: string): boolean {
  const stripped = text.replace(BOLD_ESCAPE_PATTERN, "");
  const matches = stripped.match(/\*\*/g);
  return ((matches?.length ?? 0) % 2) === 0;
}
