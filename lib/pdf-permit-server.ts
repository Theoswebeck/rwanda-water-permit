/**
 * Server-side permit PDF renderer using PDFKit.
 * Produces crisp, high-quality PDFs with native PNG rendering and proper opacity.
 * Only runs in Node.js (API routes). Client-side code continues using jsPDF.
 *
 * As of 2026-04-23, every editorial text emission is routed through the
 * document-slots catalogue (`lib/document-slots/permit-slots.ts`). The slot
 * resolver returns an assessor's saved override when one exists; otherwise
 * the slot's `defaultResolver` supplies the template text (including the
 * template's automatic `**bold**` emphasis on key values).
 *
 * As of 2026-08 (RWB feedback), every variant renders through ONE shared
 * body layout (`renderPermitBodyPages`): identical margins, body start
 * position, font size and paragraph spacing across abstraction / concession
 * / bulk permits, with justified body text.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md
 */
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";
import { addPermitExpiry } from "./date-math";
import { getEffectiveInternalNotes } from "./document-overrides";
import {
  resolvePermitDuration,
  resolveApplicantName,
  resolveOrgAddress,
  resolveOrgAddressKinyarwanda,
  resolveOrgRep,
  resolveAdminLocation,
  type PermitApplication,
} from "@/lib/permit/permit-text-data";
import { buildChildPermitNumber, isRealNetworkRow } from "@/lib/permit-number-utils";
import { resolveSlotText } from "@/lib/document-slots";
import type { SlotResolverContext } from "@/lib/document-slots";
import { parseBoldRuns, stripBoldMarkers } from "@/lib/document-slots/bold-markers";

// Re-export PermitApplication so existing callers that imported it from this
// file keep working (e.g. API routes that build the input object).
export type { PermitApplication };

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSETS_DIR = path.join(process.cwd(), "public", "assets");
const LOGO_PATH = path.join(ASSETS_DIR, "rwanda_water_board_Logo.png");
// Cropped watermark asset to avoid transparent margins that cause blur/offset.
const WATERMARK_PATH = path.join(ASSETS_DIR, "rwanda_logo_watermark.png");
const WATERMARK_BW_PATH = path.join(ASSETS_DIR, "rwanda_logo_watermark_bw.png");
let watermarkBufferPromise: Promise<Buffer | null> | null = null;

// ─── Fonts ────────────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(process.cwd(), "public", "assets", "fonts");
const SEGOE_REGULAR = path.join(FONTS_DIR, "segoeui.ttf");
const SEGOE_BOLD    = path.join(FONTS_DIR, "segoeuib.ttf");
const SEGOE_ITALIC  = path.join(FONTS_DIR, "segoeuii.ttf");

const hasSegoe = fs.existsSync(SEGOE_REGULAR) && fs.existsSync(SEGOE_BOLD);

const FONT_REGULAR = hasSegoe ? "SegoeUI"        : "Times-Roman";
const FONT_BOLD    = hasSegoe ? "SegoeUI-Bold"   : "Times-Bold";
const FONT_ITALIC  = hasSegoe ? "SegoeUI-Italic" : "Times-Italic";

function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    bufferPages: true,
  });
  if (hasSegoe) {
    doc.registerFont("SegoeUI", SEGOE_REGULAR);
    doc.registerFont("SegoeUI-Bold", SEGOE_BOLD);
    doc.registerFont("SegoeUI-Italic", fs.existsSync(SEGOE_ITALIC) ? SEGOE_ITALIC : SEGOE_REGULAR);
  }
  return doc;
}

const PRODUCTION_URL = "https://waterpermit.rwb.rw";

const PT = 2.83465; // 1mm in points

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width;
}

function pageHeight(doc: PDFKit.PDFDocument): number {
  return doc.page.height;
}

// Footer geometry — kept as named constants so `contentBottomY` can never
// drift below the QR/DRAFT band. The old bottom page row ("Document ID" and
// "Page 1 of 1") has been removed, so the QR/DRAFT band can sit lower and
// return more body space to the bilingual content.
const FOOTER_TOP_OFFSET = 44 * PT;
const BODY_BOTTOM_PAD = 2 * PT;

/**
 * Shared body typography + vertical rhythm (PDF points, not mm).
 *
 * Every permit variant (abstraction / concession, individual / organization,
 * bulk) renders its body through `renderPermitBodyPages`, so these constants
 * are the single source of truth for the body layout. RWB feedback
 * (2026-08): the abstraction and concession permits used to differ in font
 * size and spacing — they must be geometrically identical.
 */
const PERMIT_BODY_FONT_SIZE = 10;
const PERMIT_BODY_LINE_GAP = 0.5;
/** Gap between the title underline and the first body paragraph. */
const PERMIT_BODY_TOP_PAD_PT = 2;
/** Space after every paragraph — clearly separated, never overcrowded. */
const PERMIT_PARA_GAP_PT = 4;
const PERMIT_EN_RW_RULE_PAD_BEFORE_PT = 4;
const PERMIT_EN_RW_RULE_PAD_AFTER_PT = 6;
const PERMIT_BEFORE_CLOSING_PT = 8;

function contentBottomY(doc: PDFKit.PDFDocument): number {
  // Reserve = footer height (38pt) + small visual breathing room (2pt).
  // Earlier revisions tightened this to 28pt to win vertical space, but that
  // moved the cap *into* the footer band (see review C1) and silently
  // truncated paragraphs whose last lines fell in the [ph−38pt, ph−28pt]
  // band — the footer's solid fill hid the bug. Both footer variants start
  // at the same offset, so a single reserve is correct.
  return pageHeight(doc) - FOOTER_TOP_OFFSET - BODY_BOTTOM_PAD;
}

/**
 * Horizontal page margin used by the title rule and every paragraph block.
 * Tightened from 20–24pt to 12pt so the long single-line items (the title
 * and the bilingual signature line) hug less whitespace and the EN+RW
 * paragraphs wrap to fewer lines — required to fit the sample on one page.
 */
const PERMIT_MARGIN_X = 12 * PT;

/**
 * Extra horizontal inset for "Director General / Umuyobozi Mukuru" below the
 * body margin so the closing row reads as a formal signature block (nested
 * under the paragraphs above). Uses the same mm-based `PT` scale as
 * {@link PERMIT_MARGIN_X}.
 */
const CLOSING_SIGNATORY_INDENT = 0;
/** Gap between signatory column and date column. */
const CLOSING_COLUMNS_GAP = 6 * PT;

function drawPageBorder(doc: PDFKit.PDFDocument): void {
  const inset = 5 * PT;
  const borderW = pageWidth(doc) - inset * 2;
  const borderH = pageHeight(doc) - inset * 2;
  doc.save();
  doc.lineWidth(0.9);
  doc.strokeColor("#2f2f2f");
  doc.rect(inset, inset, borderW, borderH).stroke();
  doc.restore();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PermitRenderOpts {
  application: PermitApplication;
  permitNumber: string;
  permitValidityYears?: number;
  issuedDate?: Date;
  expiryDate?: Date;
  /**
   * Signing/execution date for the "Done at Kigali, On …" line. Defaults to
   * `issuedDate` when omitted (new/renewal/transfer, where they coincide). For
   * a modification this is the approval date, distinct from the preserved
   * validity `issuedDate`.
   */
  signingDate?: Date;
  isModified?: boolean;
  /** When true, omits the QR code and replaces the footer with a DRAFT banner. */
  skipQr?: boolean;
}

// ─── Slot context builder ───────────────────────────────────────────────────

/**
 * Build the SlotResolverContext that every per-variant renderer hands to
 * `resolveSlotText`. Centralising it here means the slot defaults always see
 * the same `permit` namespace + `effectiveNotes` regardless of which variant
 * function called them.
 */
function buildSlotCtx(opts: PermitRenderOpts, issueDate: Date, expiryDate: Date): SlotResolverContext {
  const variant = selectPermitVariant(opts.application as Parameters<typeof selectPermitVariant>[0]);
  return {
    application: opts.application as unknown as SlotResolverContext["application"],
    applicant: (opts.application.applicant ?? null) as Record<string, unknown> | null,
    effectiveNotes: getEffectiveInternalNotes(opts.application.internal_notes),
    variant,
    permit: {
      permitNumber: opts.permitNumber,
      issueDate,
      expiryDate,
      signingDate: opts.signingDate ?? issueDate,
      isModified: !!opts.isModified,
      skipQr: !!opts.skipQr,
      headerYear: issueDate.getFullYear(),
    },
  };
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

async function getWatermarkBuffer(): Promise<Buffer | null> {
  if (watermarkBufferPromise) return watermarkBufferPromise;
  watermarkBufferPromise = (async () => {
    const sourcePath = fs.existsSync(WATERMARK_BW_PATH)
      ? WATERMARK_BW_PATH
      : fs.existsSync(WATERMARK_PATH)
        ? WATERMARK_PATH
        : null;
    if (!sourcePath) return null;

    try {
      const sharpModule = await import("sharp").catch(() => null);
      const sharp = sharpModule?.default;
      if (!sharp) return fs.readFileSync(sourcePath);
      return await sharp(sourcePath).grayscale().png().toBuffer();
    } catch {
      try {
        return fs.readFileSync(sourcePath);
      } catch {
        return null;
      }
    }
  })();
  return watermarkBufferPromise;
}

async function drawWatermark(doc: PDFKit.PDFDocument): Promise<void> {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  const watermarkBuffer = await getWatermarkBuffer();
  if (watermarkBuffer) {
    const wmSize = Math.min(pw, ph) * 0.9;
    const x = (pw - wmSize) / 2;
    const y = (ph - wmSize) / 2;
    doc.save();
    doc.opacity(0.12);
    doc.image(watermarkBuffer, x, y, { width: wmSize, height: wmSize });
    doc.restore();
  }
  drawPageBorder(doc);
}

function drawLogo(doc: PDFKit.PDFDocument): number {
  const pw = pageWidth(doc);
  // Natural aspect ratio of logo image (1450×1600px ≈ 0.906 w:h).
  const logoW = 31 * PT;
  const logoH = 34.2 * PT;
  const logoX = (pw - logoW) / 2;
  const logoY = 4.5 * PT;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, logoX, logoY, { width: logoW, height: logoH });
  } else {
    doc.font(FONT_BOLD).fontSize(14)
      .text("Rwanda Water Resources Board", 0, 18 * PT, { align: "center", width: pw });
  }
  return logoY + logoH + 3 * PT;
}

// ─── Rich-text (inline `**bold**`) helpers ──────────────────────────────────
//
// Slot text that needs inline emphasis wraps the bold runs in `**…**` markers
// (Markdown-style). Parsing/escape/normalisation rules live in
// `lib/document-slots/bold-markers.ts` so the renderer and the slot-overrides
// API speak the same dialect (review I1).
//
// The emphasis the template requires is baked into the slot DEFAULTS —
// assessors are never asked to type markers themselves (RWB feedback
// 2026-08). Legacy overrides that do contain `**…**` still render bold, and
// escaped `\*\*` still renders as a literal `**`; unbalanced markers are
// silently normalised by `parseBoldRuns` instead of being rejected.

interface RichTextOptions {
  width: number;
  fontSize: number;
  lineGap?: number;
  /**
   * `"justify"` stretches inter-word gaps so every line except the last one
   * of a paragraph ends flush at `width` (standard book justification; the
   * final line stays left-aligned). Implemented by our own line-breaker
   * below — PDFKit's native `align: "justify"` is not safe with
   * `continued: true` chains, so mixed regular/bold paragraphs need manual
   * layout anyway.
   */
  align?: "left" | "justify";
}

interface RichFrag {
  text: string;
  bold: boolean;
  width: number;
}
interface RichWord {
  frags: RichFrag[];
  width: number;
}
interface RichLine {
  words: RichWord[];
  /** Width with single spaces between words (before justification). */
  naturalWidth: number;
  /** True when the line ends a logical paragraph (or an explicit `\n`) — such
   *  lines are never stretched. */
  hardBreak: boolean;
}

interface RichLayout {
  lines: RichLine[];
  lineHeight: number;
  spaceWidth: number;
}

/**
 * Split a single word that is wider than `maxWidth` into pieces that each
 * fit, breaking at character granularity (the same mid-word split PDFKit's
 * native `doc.text` + `width` performs). Regular/bold attribution is kept:
 * fragments are cut in place and each chunk is re-measured with
 * `widthOfString` in its own face, so kerning inside a chunk stays exact.
 * The returned pieces behave like ordinary words afterwards — the caller
 * lays out every full piece on its own line and lets the final remainder
 * flow (and justify) like any other word.
 */
function splitOverwideWord(
  doc: PDFKit.PDFDocument,
  word: RichWord,
  fontSize: number,
  maxWidth: number,
): RichWord[] {
  const pieces: RichWord[] = [];
  let piece: RichWord = { frags: [], width: 0 };
  const flushPiece = () => {
    if (piece.frags.length > 0) {
      pieces.push(piece);
      piece = { frags: [], width: 0 };
    }
  };
  for (const frag of word.frags) {
    doc.font(frag.bold ? FONT_BOLD : FONT_REGULAR).fontSize(fontSize);
    let rest = frag.text;
    while (rest !== "") {
      // Largest prefix of `rest` that keeps the current piece within maxWidth.
      // Found by binary search rather than by decrementing one character at a
      // time: prefix width grows monotonically with prefix length, so the
      // largest fitting prefix is a classic "last true" search. The old linear
      // scan re-measured the whole prefix on every step, making a split
      // quadratic in token length — a pasted ~3,000-character unbroken token
      // cost tens of millions of glyph measurements and stalled generation.
      let take = 0;
      let lo = 1;
      let hi = rest.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (piece.width + doc.widthOfString(rest.slice(0, mid)) <= maxWidth) {
          take = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (take === 0) {
        if (piece.frags.length > 0) {
          // No room left on this piece — close it and retry on a fresh one.
          flushPiece();
          continue;
        }
        // A single glyph wider than the block cannot be split further; emit
        // it anyway rather than looping forever.
        take = 1;
      }
      const chunk = rest.slice(0, take);
      const w = doc.widthOfString(chunk);
      piece.frags.push({ text: chunk, bold: frag.bold, width: w });
      piece.width += w;
      rest = rest.slice(take);
      // Leftover chars mean this piece is full to the line width — close it.
      if (rest !== "") flushPiece();
    }
  }
  flushPiece();
  return pieces;
}

/**
 * Break a paragraph that may contain `**bold**` runs into lines that fit
 * `options.width`. Words are maximal non-whitespace sequences and may span a
 * regular/bold boundary (e.g. `**Law**,`) without introducing a gap. A word
 * wider than the block itself is split at character granularity (see
 * `splitOverwideWord`) instead of overflowing the right edge. The same
 * layout drives both height measurement and drawing, so the page-break
 * budget is exact by construction.
 */
function layoutRichText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: RichTextOptions,
): RichLayout {
  const { width, fontSize } = options;
  const lineGap = options.lineGap ?? 0;

  type Token = { kind: "word"; word: RichWord } | { kind: "break" };
  const tokens: Token[] = [];
  let current: RichWord | null = null;
  const flushWord = () => {
    if (current) {
      tokens.push({ kind: "word", word: current });
      current = null;
    }
  };
  for (const run of parseBoldRuns(text)) {
    if (run.text === "") continue;
    doc.font(run.bold ? FONT_BOLD : FONT_REGULAR).fontSize(fontSize);
    for (const part of run.text.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        flushWord();
        // Explicit newlines force a line break; other whitespace is a word gap.
        const newlines = part.split("\n").length - 1;
        for (let i = 0; i < newlines; i++) tokens.push({ kind: "break" });
      } else {
        const w = doc.widthOfString(part);
        if (!current) current = { frags: [], width: 0 };
        current.frags.push({ text: part, bold: run.bold, width: w });
        current.width += w;
      }
    }
  }
  flushWord();

  doc.font(FONT_REGULAR).fontSize(fontSize);
  const spaceWidth = doc.widthOfString(" ");
  // Line height measured with the bold face — marginally taller for some
  // faces, so mixed-weight lines never collide (same upper-bound rationale
  // as the previous bold-font heightOfString measurement).
  doc.font(FONT_BOLD).fontSize(fontSize);
  const lineHeight = doc.currentLineHeight() + lineGap;

  const lines: RichLine[] = [];
  let line: RichLine = { words: [], naturalWidth: 0, hardBreak: false };
  const pushLine = (hard: boolean) => {
    line.hardBreak = hard;
    lines.push(line);
    line = { words: [], naturalWidth: 0, hardBreak: false };
  };
  for (const token of tokens) {
    if (token.kind === "break") {
      pushLine(true);
      continue;
    }
    let w = token.word;
    if (line.words.length > 0 && line.naturalWidth + spaceWidth + w.width > width) {
      pushLine(false);
    }
    if (line.words.length === 0 && w.width > width) {
      // Token wider than the whole block: split it so each piece fits. Full
      // pieces take a line each; the remainder stays as the open line's
      // first word and flows (and justifies) like a normal word.
      const pieces = splitOverwideWord(doc, w, fontSize, width);
      w = pieces.pop() as RichWord;
      for (const piece of pieces) {
        line.words.push(piece);
        line.naturalWidth = piece.width;
        pushLine(false);
      }
    }
    if (line.words.length === 0) {
      line.words.push(w);
      line.naturalWidth = w.width;
    } else {
      line.words.push(w);
      line.naturalWidth += spaceWidth + w.width;
    }
  }
  if (line.words.length > 0) pushLine(true);

  return { lines, lineHeight, spaceWidth };
}

/**
 * Draw the half-open line range `[from, to)` of an already-computed layout at
 * `(x, y)`, rendering the `**bold**` runs in their own face. With
 * `align: "justify"` every full line is stretched to the block width by
 * distributing the slack across inter-word gaps; the last line of each
 * paragraph (and any line ended by an explicit `\n`) stays left-aligned.
 *
 * Splitting the emission from the layout is what lets a paragraph continue
 * across a page break: the line breaking — and therefore every bold run and
 * every justification decision, which depend only on `line.hardBreak` — is
 * computed ONCE for the whole paragraph by `drawParagraphPaginated` and then
 * emitted in as many chunks as the pages allow. (The previous
 * height-then-draw pair also ran the line breaker twice per paragraph.)
 */
function drawRichLines(
  doc: PDFKit.PDFDocument,
  layout: RichLayout,
  x: number,
  y: number,
  options: RichTextOptions,
  from: number,
  to: number,
): void {
  const { lines, lineHeight, spaceWidth } = layout;
  const justify = options.align === "justify";
  let cy = y;
  for (const line of lines.slice(from, to)) {
    const gaps = line.words.length - 1;
    let gapExtra = 0;
    if (justify && !line.hardBreak && gaps > 0) {
      gapExtra = Math.max(0, (options.width - line.naturalWidth) / gaps);
    }
    let cx = x;
    for (const word of line.words) {
      for (const frag of word.frags) {
        doc.font(frag.bold ? FONT_BOLD : FONT_REGULAR).fontSize(options.fontSize);
        doc.text(frag.text, cx, cy, { lineBreak: false });
        cx += frag.width;
      }
      cx += spaceWidth + gapExtra;
    }
    cy += lineHeight;
  }
}

function ensureBilingualPermitTitle(title: string): string {
  if (/URUHUSHYA RWO GUKORESHA AMAZI/i.test(title)) {
    return title;
  }
  // Existing saved overrides use the legacy English-only title shape
  // (`WATER USE PERMIT N° ...`). Preserve the override's permit number while
  // normalising that stale shape to the new bilingual heading, so old
  // application-level title overrides do not keep staging/prod English-only.
  return title.replace(
    /^WATER USE PERMIT\s+(N[°º]\s*)/i,
    "WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI $1",
  );
}

function drawTitle(doc: PDFKit.PDFDocument, title: string, yPos: number): number {
  const pw = pageWidth(doc);
  const marginX = PERMIT_MARGIN_X;
  const maxW = pw - marginX * 2;
  // The title is rendered through `doc.text()` (not `drawRichText`), so
  // strip any inline `**` markers that may have leaked in via an assessor
  // override — otherwise they'd render as visible asterisks (review I3).
  const cleanTitle = stripBoldMarkers(ensureBilingualPermitTitle(title));
  // Re-assert the bold font + size immediately before measuring + drawing so
  // the rule width is never accidentally derived from a stale font state
  // left over from a previous render call (review M4).
  doc.font(FONT_BOLD).fontSize(12).fillColor("#000000");
  // Render the title centered, then draw a single underline whose width
  // matches the actual text width (sample-style — see screenshot 6).
  const titleH = doc.heightOfString(cleanTitle, { width: maxW, align: "center" });
  doc.text(cleanTitle, marginX, yPos, { width: maxW, align: "center" });
  doc.font(FONT_BOLD).fontSize(12); // belt-and-braces re-set before width measurement
  const textW = Math.min(doc.widthOfString(cleanTitle), maxW);
  const ruleStartX = marginX + (maxW - textW) / 2;
  const lineY = yPos + titleH + 2;
  doc
    .moveTo(ruleStartX, lineY)
    .lineTo(ruleStartX + textW, lineY)
    .lineWidth(0.7)
    .stroke("#000");
  return lineY + 8;
}

async function drawQrFooter(
  doc: PDFKit.PDFDocument,
  permitNumber: string,
  ctx: SlotResolverContext,
): Promise<void> {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  const verifyUrl = `${PRODUCTION_URL}/permit/view/${encodeURIComponent(permitNumber.trim())}`;

  // Compact horizontal footer pinned near the page bottom.
  // The footer top sits exactly at `ph - FOOTER_TOP_OFFSET` so that
  // `contentBottomY` (which reserves the same offset + a small pad) cannot
  // be set to a value that would let body text overlap the footer chrome.
  const marginX = 15 * PT;
  const footerW = pw - marginX * 2;
  const footerH = 28 * PT;
  const footerY = ph - FOOTER_TOP_OFFSET; // top of the QR footer band

  // QR box on the left side of the footer.
  const qrPad = 1.2 * PT;
  const qrBox = footerH - qrPad * 2;
  const qrX = marginX + qrPad;
  const qrY = footerY + qrPad;

  doc.save();
  doc.roundedRect(marginX, footerY, footerW, footerH, 4).lineWidth(0.5).fillAndStroke("#fbfdff", "#e2e8f0");
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 3).fillAndStroke("#ffffff", "#e2e8f0");
  doc.restore();

  const qrPng = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrInner = qrBox - qrPad * 2;
  doc.image(qrPng, qrX + qrPad, qrY + qrPad, { width: qrInner, height: qrInner });

  // Disclaimer wrapped to the right of the QR box.
  doc.save();
  doc.font(FONT_ITALIC).fontSize(8).fillColor("#646464");
  const textX = qrX + qrBox + 6 * PT;
  const textW = footerW - (textX - marginX) - 4 * PT;
  const textY = footerY + 4 * PT;
  doc.text(
    stripBoldMarkers(resolveSlotText("permit.shared.footer.qr_disclaimer.en", ctx)),
    textX, textY, { width: textW, align: "left" },
  );
  doc.restore();
}

/** Slim "DRAFT — NOT YET ISSUED" strip pinned near the bottom border. */
function drawPreviewBanner(doc: PDFKit.PDFDocument, ctx: SlotResolverContext): void {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  const marginX = 15 * PT;
  const bannerW = pw - marginX * 2;
  const bannerH = 18 * PT;
  const bannerY = ph - FOOTER_TOP_OFFSET; // matches QR-footer top so contentBottomY is consistent

  doc.save();
  doc.roundedRect(marginX, bannerY, bannerW, bannerH, 3)
    .lineWidth(0.5).fillAndStroke("#fff8ed", "#f59e0b");
  doc.font(FONT_BOLD).fontSize(10).fillColor("#92400e");
  doc.text(
    stripBoldMarkers(resolveSlotText("permit.shared.footer.draft_banner.en", ctx)),
    marginX, bannerY + 4.5 * PT, { width: bannerW, align: "center" },
  );
  doc.restore();
}

/** Render the "MODIFIED PERMIT" badge in the top-right corner. */
function drawModifiedBadge(doc: PDFKit.PDFDocument, ctx: SlotResolverContext): void {
  doc.save();
  const bx = pageWidth(doc) - 60 * PT;
  doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
  doc.font(FONT_BOLD).fontSize(8).fillColor("#ffffff")
    .text(
      stripBoldMarkers(resolveSlotText("permit.shared.modified_badge.en", ctx)),
      bx, 6.5 * PT, { width: 52 * PT, align: "center" },
    );
  doc.restore();
}

/**
 * Two-column closing block:
 *   left  — signatory line (`permit.shared.closing.signatory.bilingual`)
 *   right — date line       (`permit.shared.closing.date.bilingual`)
 *
 * The right column's default resolver inserts the renderer's `issueDate`
 * formatted DD/MM/YYYY (Rwanda format). When an assessor overrides it, the
 * frozen text is rendered as-is.
 */
function drawClosingLine(
  doc: PDFKit.PDFDocument,
  yPos: number,
  ctx: SlotResolverContext,
): number {
  const pw = pageWidth(doc);
  const m = PERMIT_MARGIN_X;
  const innerW = pw - 2 * m;
  const colW = (innerW - CLOSING_COLUMNS_GAP) / 2;

  // Same outer margin as body text; signatory title indented further in for a
  // clear signature-block alignment (not flush with the paragraph block edge).
  const signatoryX = m + CLOSING_SIGNATORY_INDENT;
  const signatoryW = Math.max(40, colW - CLOSING_SIGNATORY_INDENT);

  const dateX = m + colW + CLOSING_COLUMNS_GAP;

  doc.fontSize(11).fillColor("#000000");
  // Signatory stays bold (matches the sample's "Director General/ Umuyobozi
  // Mukuru" treatment); the date line on the right is regular weight. Both
  // sides flow through `doc.text()` (not `drawRichText`), so any `**` an
  // assessor types is stripped here to avoid leaking visible markers.
  doc.font(FONT_BOLD);
  doc.text(
    stripBoldMarkers(resolveSlotText("permit.shared.closing.signatory.bilingual", ctx)),
    signatoryX,
    yPos,
    { width: signatoryW, align: "left" },
  );
  doc.font(FONT_REGULAR);
  doc.text(
    stripBoldMarkers(resolveSlotText("permit.shared.closing.date.bilingual", ctx)),
    dateX,
    yPos,
    { width: colW, align: "right" },
  );
  return yPos + 16;
}

// ─── Variant renderers ───────────────────────────────────────────────────────────

/** Y position where body text resumes on a continuation page. */
const PERMIT_CONT_PAGE_TOP_Y = 30 * PT;

/** Start a fresh body page (watermark + border) and return the new body top Y. */
async function startContinuationPage(doc: PDFKit.PDFDocument): Promise<number> {
  doc.addPage();
  await drawWatermark(doc);
  doc.fillColor("#000000");
  return PERMIT_CONT_PAGE_TOP_Y;
}

/**
 * Draw one paragraph starting at `y`, breaking it ACROSS PAGES at line
 * granularity when it does not fit, and return the Y just below the last line
 * drawn (on whatever page that turned out to be).
 *
 * Behaviour, in order of preference:
 *  1. The paragraph fits in the space left on the current page → drawn there.
 *  2. It does not fit here but would fit on a page of its own → the whole
 *     paragraph moves to a fresh page (no orphaned first lines). This is the
 *     pre-existing behaviour and keeps every real permit's output identical.
 *  3. It is taller than a full page → lines are emitted until the content
 *     bottom, a new page starts, and the remaining lines continue there.
 *
 * Before this, `drawRichText` emitted every line unconditionally at
 * `cy += lineHeight`, so an over-long paragraph was drawn straight off the
 * bottom of the sheet — over the QR/signature footer and past the page border.
 */
async function drawParagraphPaginated(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: RichTextOptions,
): Promise<number> {
  const layout = layoutRichText(doc, text, options);
  const { lines, lineHeight } = layout;
  if (lines.length === 0) return y;

  const bottom = contentBottomY(doc);
  const totalH = lines.length * lineHeight;
  const fullPageCapacity = bottom - PERMIT_CONT_PAGE_TOP_Y;

  let cy = y;
  // Case 2: keep a page-sized paragraph together by moving it wholesale.
  if (cy + totalH > bottom && totalH <= fullPageCapacity) {
    cy = await startContinuationPage(doc);
  }

  let i = 0;
  while (i < lines.length) {
    let capacity = Math.floor((contentBottomY(doc) - cy) / lineHeight);
    if (capacity <= 0) {
      cy = await startContinuationPage(doc);
      capacity = Math.floor((contentBottomY(doc) - cy) / lineHeight);
      // Degenerate geometry (line taller than a whole page): emit one line
      // rather than loop forever adding blank pages.
      if (capacity <= 0) capacity = 1;
    }
    const take = Math.min(capacity, lines.length - i);
    drawRichLines(doc, layout, x, cy, options, i, i + take);
    cy += take * lineHeight;
    i += take;
  }
  return cy;
}

interface PermitBodyContent {
  title: string;
  englishParagraphs: string[];
  rwParagraphs: string[];
}

/**
 * Shared page layout for EVERY permit variant: watermark + border, centered
 * logo, underlined bilingual title, justified English block, separator rule,
 * justified Kinyarwanda block, closing signature row and footer (QR band or
 * DRAFT banner). All geometry comes from the PERMIT_* constants above, so
 * abstraction and concession permits are geometrically identical in margins,
 * body start position, font size and spacing (RWB feedback 2026-08).
 */
async function renderPermitBodyPages(
  doc: PDFKit.PDFDocument,
  opts: PermitRenderOpts,
  ctx: SlotResolverContext,
  content: PermitBodyContent,
): Promise<void> {
  await drawWatermark(doc);
  const logoBottomY = drawLogo(doc);
  let y = drawTitle(doc, content.title, logoBottomY);

  if (opts.isModified) drawModifiedBadge(doc, ctx);

  const leftX = PERMIT_MARGIN_X;
  const maxW = pageWidth(doc) - leftX * 2;
  const rich: RichTextOptions = {
    width: maxW,
    fontSize: PERMIT_BODY_FONT_SIZE,
    lineGap: PERMIT_BODY_LINE_GAP,
    align: "justify",
  };

  y += PERMIT_BODY_TOP_PAD_PT;
  doc.fillColor("#000000");
  for (const p of content.englishParagraphs) {
    y = await drawParagraphPaginated(doc, p, leftX, y, rich) + PERMIT_PARA_GAP_PT;
  }

  if (y > contentBottomY(doc) - 50) { y = await startContinuationPage(doc); }
  y += PERMIT_EN_RW_RULE_PAD_BEFORE_PT;
  doc.moveTo(leftX, y).lineTo(leftX + maxW, y).lineWidth(0.6).stroke("#1f2937");
  y += PERMIT_EN_RW_RULE_PAD_AFTER_PT;

  for (const p of content.rwParagraphs) {
    y = await drawParagraphPaginated(doc, p, leftX, y, rich) + PERMIT_PARA_GAP_PT;
  }

  if (y > contentBottomY(doc) - 22) { y = await startContinuationPage(doc); }
  y += PERMIT_BEFORE_CLOSING_PT;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, opts.permitNumber, ctx); }
}

/**
 * Renderer shared by the four standard slot-driven variants
 * (abstraction/concession × individual/organization). The only difference
 * between them is which slot ids supply the text — the layout itself is
 * fully shared via `renderPermitBodyPages`.
 */
async function renderStandardPermit(
  opts: PermitRenderOpts,
  variant: Exclude<PermitVariant, "bulk_water_supply" | "fallback_generic">,
): Promise<Buffer> {
  const { application: app } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addPermitExpiry(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();
  await renderPermitBodyPages(doc, opts, ctx, {
    title: resolveSlotText(`permit.${variant}.title.en`, ctx),
    englishParagraphs: [1, 2, 3, 4].map((i) =>
      resolveSlotText(`permit.${variant}.en.para_${i}`, ctx),
    ),
    rwParagraphs: [1, 2, 3, 4].map((i) =>
      resolveSlotText(`permit.${variant}.rw.para_${i}`, ctx),
    ),
  });
  return docToBuffer(doc);
}

// ─── Bulk water supply renderer ─────────────────────────────────────────────

function resolveBulkNetworks(app: PermitApplication): Array<Record<string, unknown>> {
  const notes = getEffectiveInternalNotes(app.internal_notes);
  const adjNetworks = (notes as Record<string, unknown> | null)?._assessorAdjustments as Record<string, unknown> | null | undefined;
  const adj = adjNetworks?.bulkNetworks;
  // Filter out empty placeholder rows so the PDF annex + child-permit numbering match the
  // child permits actually issued by the terms page (both use isRealNetworkRow).
  if (Array.isArray(adj) && adj.length > 0) return (adj as Array<Record<string, unknown>>).filter(isRealNetworkRow);
  if (Array.isArray(app.bulk_networks) && app.bulk_networks.length > 0) return (app.bulk_networks as Array<Record<string, unknown>>).filter(isRealNetworkRow);
  return [];
}

async function renderBulkWaterSupply(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  // Fallback only — callers that already know the permit's validity window
  // (terms page, permits row, contract, registry) pass `expiryDate` explicitly.
  // When they do not, the expiry must be computed with the SAME semantics as
  // every other variant (`addPermitExpiry` = +N years − 1 day). Using
  // `addYearsSafe` here printed a bulk permit expiring one day later than the
  // permits row / contract / registry showed for the same permit.
  const expiryDate =
    opts.expiryDate ??
    addPermitExpiry(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();

  // Resolve networks early so we can adjust para_4 text accordingly
  const networks = resolveBulkNetworks(app);
  const hasNetworks = networks.length > 0;

  // Build bulk-specific para_2 (authorization sentence — no coordinates/sector/cell).
  // Template emphasis (`**…**`) is applied here automatically — assessors
  // never need to type bold markers themselves.
  const orgName = resolveApplicantName(app);
  const orgAddr = resolveOrgAddress(app);
  const orgAddrRw = resolveOrgAddressKinyarwanda(app);
  const rep = resolveOrgRep(app);
  const adminLoc = resolveAdminLocation(app);
  const networkCount = networks.length;
  const networkCountLabel = `${networkCount} water supply network${networkCount !== 1 ? "s" : ""}`;

  const bulkPara2En = `"**${orgName}**" with its registered office address as follows: ${orgAddr}; represented by ${rep.name} "**${rep.title}**", is authorized to abstract water from **${networkCountLabel}** located in ${adminLoc.district} District as specified in the attached annex. Water abstracted will be used for **water supply**.`;
  const bulkPara2Rw = `"**${orgName}**" ifite ibiro biherereye mu ${orgAddrRw}; ihagarariwe na ${rep.name} "**${rep.title}**", yemerewe gukoresha amazi y'imiyoboro **${networkCount}** iherereye mu Akarere ka ${adminLoc.district} nkuko bigaragara ku mugereka. Aya mazi yemerewe gukoreshwa mu bikorwa byo **gukwirakwiza amazi**.`;

  const englishParagraphs = [
    resolveSlotText("permit.abstraction_organization.en.para_1", ctx),
    bulkPara2En,
    resolveSlotText("permit.abstraction_organization.en.para_3", ctx),
    hasNetworks
      ? "In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in the attached contract. The list of authorized distribution networks is provided in the Annex."
      : "In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in the attached contract.",
  ];
  const rwParagraphs = [
    resolveSlotText("permit.abstraction_organization.rw.para_1", ctx),
    bulkPara2Rw,
    resolveSlotText("permit.abstraction_organization.rw.para_3", ctx),
    hasNetworks
      ? "Uretse ibyemejwe n'itegeko rivugwaho haruguru, uyu Uruhushya rugengwa n'amategeko n'ibisabwa bisobanurwa mu masezerano agenye. Urutonde rw'amashyamba y'amazi yemerewe ruragaragara mu Umugereka."
      : "Uretse ibyemejwe n'itegeko rivugwaho haruguru, uyu Uruhushya rugengwa n'amategeko n'ibisabwa bisobanurwa mu masezerano agenye.",
  ];

  // Body layout is fully shared with the standard variants — same margins,
  // font size, justification and spacing (reuses the
  // abstraction_organization slot key for the bilingual title).
  await renderPermitBodyPages(doc, opts, ctx, {
    title: resolveSlotText("permit.abstraction_organization.title.en", ctx),
    englishParagraphs,
    rwParagraphs,
  });

  // ─── Annex page: distribution networks table ────────────────────────────
  if (hasNetworks) {
    doc.addPage();
    await drawWatermark(doc);

    const annexMarginX = PERMIT_MARGIN_X;
    const annexMaxW = pageWidth(doc) - annexMarginX * 2;
    let ay = 20 * PT;

    // Annex title — matches the official DOCX template: "Annex to the Water Use Permit N° .../RWB/YYYY"
    doc.font(FONT_BOLD).fontSize(12).fillColor("#000000");
    const annexTitle = `Annex to the Water Use Permit N° ${permitNumber}`;
    doc.text(annexTitle, annexMarginX, ay, { width: annexMaxW, align: "center" });
    ay += doc.heightOfString(annexTitle, { width: annexMaxW }) + 6 * PT;
    doc.moveTo(annexMarginX, ay).lineTo(annexMarginX + annexMaxW, ay).lineWidth(0.5).stroke("#1f2937");
    ay += 4 * PT;

    // Column definitions (widths in pt, total = annexMaxW)
    const cols = [
      { label: "Permit Number",   width: 72 * PT },
      { label: "Network Name",    width: 60 * PT },
      { label: "Sector",          width: 40 * PT },
      { label: "Cell",            width: 40 * PT },
      { label: "Village",         width: 40 * PT },
      { label: "Coordinates",     width: 52 * PT },
      { label: "Capacity (m³/d)", width: 40 * PT },
      { label: "Method",          width: 40 * PT },
    ];
    // Distribute remaining width proportionally
    const colTotal = cols.reduce((s, c) => s + c.width, 0);
    const scale = annexMaxW / colTotal;
    const scaledCols = cols.map(c => ({ ...c, width: c.width * scale }));

    const rowH = 14 * PT;
    const cellPad = 2.5 * PT;

    const drawTableRow = (
      rowData: string[],
      rowY: number,
      bg?: string,
      bold?: boolean,
    ) => {
      let cx = annexMarginX;
      for (let i = 0; i < scaledCols.length; i++) {
        const col = scaledCols[i];
        if (bg) {
          doc.rect(cx, rowY, col.width, rowH).fill(bg);
        }
        doc.rect(cx, rowY, col.width, rowH).lineWidth(0.3).stroke("#9ca3af");
        doc.font(bold ? FONT_BOLD : FONT_REGULAR).fontSize(7.5).fillColor("#000000");
        const cellText = rowData[i] ?? "";
        doc.text(cellText, cx + cellPad, rowY + cellPad, {
          width: col.width - cellPad * 2,
          height: rowH - cellPad * 2,
          ellipsis: true,
        });
        cx += col.width;
      }
    };

    // Header row
    drawTableRow(
      scaledCols.map(c => c.label),
      ay,
      "#1f2937",
      true,
    );
    // Override text color for header
    let hx = annexMarginX;
    for (let i = 0; i < scaledCols.length; i++) {
      const col = scaledCols[i];
      doc.font(FONT_BOLD).fontSize(7.5).fillColor("#ffffff");
      doc.text(scaledCols[i].label, hx + cellPad, ay + cellPad, {
        width: col.width - cellPad * 2,
        height: rowH - cellPad * 2,
        ellipsis: true,
      });
      hx += col.width;
    }
    ay += rowH;

    // Data rows
    for (let i = 0; i < networks.length; i++) {
      const net = networks[i];
      if (ay + rowH > contentBottomY(doc)) {
        doc.addPage();
        await drawWatermark(doc);
        ay = 20 * PT;
      }
      const childPermitNum = buildChildPermitNumber(permitNumber, i + 1);
      const coords = typeof net.coordinates === "string" ? net.coordinates : "";
      const capacity = net.capacity_m3_day != null ? String(net.capacity_m3_day) : "";
      const method = typeof net.abstraction_method === "string"
        ? net.abstraction_method.replace(/_/g, " ")
        : "";
      drawTableRow(
        [
          childPermitNum,
          typeof net.network_name === "string" ? net.network_name : "",
          typeof net.sector === "string" ? net.sector : "",
          typeof net.cell === "string" ? net.cell : "",
          typeof net.village === "string" ? net.village : "",
          coords,
          capacity,
          method,
        ],
        ay,
        i % 2 === 0 ? "#f8fafc" : "#ffffff",
        false,
      );
      ay += rowH;
    }

    if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, permitNumber, ctx); }
  }

  return docToBuffer(doc);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generatePermitPdfBuffer(opts: PermitRenderOpts): Promise<Buffer> {
  const variant = selectPermitVariant(opts.application as Parameters<typeof selectPermitVariant>[0]);
  switch (variant) {
    case "concession_individual":
    case "concession_organization":
    case "abstraction_individual":
    case "abstraction_organization":
      return renderStandardPermit(opts, variant);
    case "bulk_water_supply":
      return renderBulkWaterSupply(opts);
    default:
      return renderStandardPermit(opts, "concession_individual");
  }
}
