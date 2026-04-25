/**
 * Inline bold-marker handling for slot text.
 *
 * Convention: assessor-edited slot text uses Markdown-style `**bold**` markers
 * to opt into emphasis. The same source string is:
 *   - rendered as alternating regular/bold runs by the permit PDF renderer
 *     (`drawRichText` in `lib/pdf-permit-server.ts`), and
 *   - stored verbatim in `internal_notes.document_text_overrides.values[*].text`.
 *
 * Escape rule: a literal four-character sequence `\*\*` is escaped — it is
 * treated as text and renders as a visible `**` in the PDF without toggling
 * emphasis. This lets assessors write paragraphs that genuinely contain `**`
 * without accidentally bolding the rest of the line.
 *
 * Robustness rule: an unbalanced `**` (odd count after escapes are removed)
 * is **defensively normalised** by `parseBoldRuns`. The trailing unmatched
 * marker is collapsed back into the preceding segment as literal text. This
 * means a typo like `"Mister **Smith"` renders as the literal string
 * `Mister **Smith` (regular weight) instead of cascade-bolding the rest of
 * the paragraph. The API layer (`hasBalancedBoldMarkers`) rejects unbalanced
 * input on save so the assessor sees a friendly 400 first; the renderer
 * normalisation is a belt-and-braces guard for any data that slipped in
 * before the rule existed.
 *
 * Used by:
 *   - lib/pdf-permit-server.ts (rich-text rendering)
 *   - app/api/staff/applications/[id]/document-text-overrides/route.ts (validation)
 *   - lib/pdf-permit-server.ts (stripping markers in non-rich slot paths)
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
 * markdown convention and the API rejects unbalanced cases up front, so
 * accidental interpretation of a path is the worst-case price for keeping
 * the parser simple.
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

/**
 * Returns true iff every `**` opener has a matching closer (after `\*\*`
 * escapes are removed). Used by the API to give a friendly 400 instead of
 * relying on the renderer's defensive normalisation.
 */
export function hasBalancedBoldMarkers(text: string): boolean {
  const stripped = text.replace(BOLD_ESCAPE_PATTERN, "");
  const matches = stripped.match(/\*\*/g);
  return ((matches?.length ?? 0) % 2) === 0;
}
