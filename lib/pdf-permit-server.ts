/**
 * Server-side permit PDF renderer using PDFKit.
 * Produces crisp, high-quality PDFs with native PNG rendering and proper opacity.
 * Only runs in Node.js (API routes). Client-side code continues using jsPDF.
 *
 * As of 2026-04-23, every editorial text emission is routed through the
 * document-slots catalogue (`lib/document-slots/permit-slots.ts`). The slot
 * resolver returns an assessor's saved override when one exists; otherwise
 * the slot's `defaultResolver` reproduces the exact string this file used to
 * emit before the refactor. Layout / fonts / coordinates are unchanged.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md
 */
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { selectPermitVariant } from "@/lib/permit-variant";
import { addYearsSafe } from "./date-math";
import { getEffectiveInternalNotes } from "./document-overrides";
import {
  resolvePermitDuration,
  type PermitApplication,
} from "@/lib/permit/permit-text-data";
import { resolveSlotText } from "@/lib/document-slots";
import type { SlotResolverContext } from "@/lib/document-slots";

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

function contentBottomY(doc: PDFKit.PDFDocument, _skipQr = false): number {
  // Both footers (slim DRAFT banner for previews, compact QR footer for final
  // issuance) live in the same bottom band (~38mm from the page bottom), so
  // we reserve a single ~42mm bottom margin for body text in both modes.
  return pageHeight(doc) - 42 * PT;
}

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
  const logoW = 26 * PT;
  const logoH = 29 * PT;
  const logoX = (pw - logoW) / 2;
  const logoY = 6 * PT;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, logoX, logoY, { width: logoW, height: logoH });
  } else {
    doc.font(FONT_BOLD).fontSize(13)
      .text("Rwanda Water Resources Board", 0, 18 * PT, { align: "center", width: pw });
  }
  return logoY + logoH + 4 * PT;
}

function drawTitle(doc: PDFKit.PDFDocument, title: string, yPos: number): number {
  const pw = pageWidth(doc);
  const marginX = 24 * PT;
  const maxW = pw - marginX * 2;
  doc.font(FONT_BOLD).fontSize(12).fillColor("#000000");
  // Top rule (matches the sample permit, where the title is bracketed
  // between two horizontal rules covering the same width as the text).
  doc.moveTo(marginX, yPos).lineTo(marginX + maxW, yPos).lineWidth(0.5).stroke("#000");
  const titleY = yPos + 6;
  const titleH = doc.heightOfString(title, { width: maxW, align: "center" });
  doc.text(title, marginX, titleY, { width: maxW, align: "center" });
  const lineY = titleY + titleH + 4;
  doc.moveTo(marginX, lineY).lineTo(marginX + maxW, lineY).lineWidth(0.5).stroke("#000");
  return lineY + 8;
}

/**
 * "Signature/Umukono: …" line rendered between the validity paragraph
 * and the two-column signatory/date closing block. Matches the sample
 * permit layout where the signature placeholder sits above the
 * Director-General title.
 */
function drawSignatureLine(
  doc: PDFKit.PDFDocument,
  yPos: number,
  ctx: SlotResolverContext,
): number {
  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  doc.font(FONT_REGULAR).fontSize(11).fillColor("#000000");
  doc.text(
    resolveSlotText("permit.shared.closing.signature_line.bilingual", ctx),
    leftX, yPos, { width: maxW, align: "left" },
  );
  return yPos + 18;
}

async function drawQrFooter(
  doc: PDFKit.PDFDocument,
  permitNumber: string,
  ctx: SlotResolverContext,
): Promise<void> {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  const verifyUrl = `${PRODUCTION_URL}/permit/view/${encodeURIComponent(permitNumber.trim())}`;

  // Compact horizontal footer pinned near the page bottom (above the page-number row).
  const marginX = 15 * PT;
  const footerW = pw - marginX * 2;
  const footerH = 16 * PT; // ≈ 45pt
  const footerY = ph - 22 * PT - footerH;

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
    resolveSlotText("permit.shared.footer.qr_disclaimer.en", ctx),
    textX, textY, { width: textW, align: "left" },
  );
  doc.restore();
}

/** Slim "DRAFT — NOT YET ISSUED" strip pinned just above the page-number footer. */
function drawPreviewBanner(doc: PDFKit.PDFDocument, ctx: SlotResolverContext): void {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  const marginX = 15 * PT;
  const bannerW = pw - marginX * 2;
  const bannerH = 18 * PT;
  const bannerY = ph - 38 * PT;

  doc.save();
  doc.roundedRect(marginX, bannerY, bannerW, bannerH, 3)
    .lineWidth(0.5).fillAndStroke("#fff8ed", "#f59e0b");
  doc.font(FONT_BOLD).fontSize(10).fillColor("#92400e");
  doc.text(
    resolveSlotText("permit.shared.footer.draft_banner.en", ctx),
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
      resolveSlotText("permit.shared.modified_badge.en", ctx),
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
  const marginX = 24 * PT;
  const colW = (pw - marginX * 2) / 2 - 4 * PT;
  const leftX = marginX;
  const rightX = pw / 2 + 4 * PT;

  doc.font(FONT_BOLD).fontSize(11).fillColor("#000000");
  doc.text(
    resolveSlotText("permit.shared.closing.signatory.bilingual", ctx),
    leftX, yPos, { width: colW, align: "left" },
  );
  doc.text(
    resolveSlotText("permit.shared.closing.date.bilingual", ctx),
    rightX, yPos, { width: colW, align: "right" },
  );
  return yPos + 16;
}

function drawPageFooter(doc: PDFKit.PDFDocument, permitNumber: string, page: number, total: number): void {
  const pw = pageWidth(doc);
  const y = pageHeight(doc) - 12 * PT;
  doc.save().font(FONT_REGULAR).fontSize(8).fillColor("#646464");
  doc.text(`Document ID: ${permitNumber}`, 0, y, { width: pw, align: "center" });
  doc.text(`Page ${page} of ${total}`, pw - 60 * PT, y, { width: 50 * PT, align: "right" });
  doc.restore();
}

// ─── Variant renderers ──────────────────────────────────────────────────────

async function renderConcessionIndividual(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();

  await drawWatermark(doc);
  drawLogo(doc);

  let y = drawTitle(doc, resolveSlotText("permit.concession_individual.title.en", ctx), 49 * PT);

  if (isModified) drawModifiedBadge(doc, ctx);

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const paragraphs = [
    resolveSlotText("permit.concession_individual.en.para_1", ctx),
    resolveSlotText("permit.concession_individual.en.para_2", ctx),
    resolveSlotText("permit.concession_individual.en.para_3", ctx),
    resolveSlotText("permit.concession_individual.en.para_4", ctx),
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }

  y += 8;
  y = drawSignatureLine(doc, y, ctx);
  y += 6;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, permitNumber, ctx); }

  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }

  return docToBuffer(doc);
}

async function renderAbstractionIndividual(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();
  await drawWatermark(doc);
  drawLogo(doc);
  let y = drawTitle(doc, resolveSlotText("permit.abstraction_individual.title.en", ctx), 49 * PT);

  if (isModified) drawModifiedBadge(doc, ctx);

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const paragraphs = [
    resolveSlotText("permit.abstraction_individual.en.para_1", ctx),
    resolveSlotText("permit.abstraction_individual.en.para_2", ctx),
    resolveSlotText("permit.abstraction_individual.en.para_3", ctx),
    resolveSlotText("permit.abstraction_individual.en.para_4", ctx),
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 8;
  y = drawSignatureLine(doc, y, ctx);
  y += 6;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, permitNumber, ctx); }
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }
  return docToBuffer(doc);
}

async function renderAbstractionOrganization(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();
  await drawWatermark(doc);
  const logoBottomY = drawLogo(doc);
  let y = drawTitle(doc, resolveSlotText("permit.abstraction_organization.title.en", ctx), logoBottomY);

  if (isModified) drawModifiedBadge(doc, ctx);

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 1.8;
  const paraGap = 6;

  const englishParagraphs = [
    resolveSlotText("permit.abstraction_organization.en.para_1", ctx),
    resolveSlotText("permit.abstraction_organization.en.para_2", ctx),
    resolveSlotText("permit.abstraction_organization.en.para_3", ctx),
    resolveSlotText("permit.abstraction_organization.en.para_4", ctx),
  ];
  const rwParagraphs = [
    resolveSlotText("permit.abstraction_organization.rw.para_1", ctx),
    resolveSlotText("permit.abstraction_organization.rw.para_2", ctx),
    resolveSlotText("permit.abstraction_organization.rw.para_3", ctx),
    resolveSlotText("permit.abstraction_organization.rw.para_4", ctx),
  ];

  y += 6;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of englishParagraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 8;
  doc.moveTo(leftX, y).lineTo(leftX + maxW, y).lineWidth(0.8).stroke("#1f2937");
  y += 10;

  for (const p of rwParagraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) {
      doc.addPage();
      await drawWatermark(doc);
      y = 30 * PT;
    }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 50) {
    doc.addPage();
    await drawWatermark(doc);
    y = 30 * PT;
  }
  y += 6;
  y = drawSignatureLine(doc, y, ctx);
  y += 6;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, permitNumber, ctx); }
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }
  return docToBuffer(doc);
}

async function renderConcessionOrganization(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));
  const ctx = buildSlotCtx(opts, issueDate, expiryDate);

  const doc = createDoc();
  await drawWatermark(doc);
  drawLogo(doc);

  let y = drawTitle(doc, resolveSlotText("permit.concession_organization.title.en", ctx), 49 * PT);

  if (isModified) drawModifiedBadge(doc, ctx);

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const paragraphs = [
    resolveSlotText("permit.concession_organization.en.para_1", ctx),
    resolveSlotText("permit.concession_organization.en.para_2", ctx),
    resolveSlotText("permit.concession_organization.en.para_3", ctx),
    resolveSlotText("permit.concession_organization.en.para_4", ctx),
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 50) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 8;
  y = drawSignatureLine(doc, y, ctx);
  y += 6;
  drawClosingLine(doc, y, ctx);

  if (opts.skipQr) { drawPreviewBanner(doc, ctx); } else { await drawQrFooter(doc, permitNumber, ctx); }
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }
  return docToBuffer(doc);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generatePermitPdfBuffer(opts: PermitRenderOpts): Promise<Buffer> {
  const variant = selectPermitVariant(opts.application as Parameters<typeof selectPermitVariant>[0]);
  switch (variant) {
    case "concession_individual":
      return renderConcessionIndividual(opts);
    case "concession_organization":
      return renderConcessionOrganization(opts);
    case "abstraction_individual":
      return renderAbstractionIndividual(opts);
    case "abstraction_organization":
      return renderAbstractionOrganization(opts);
    default:
      return renderConcessionIndividual(opts);
  }
}
