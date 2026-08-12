/**
 * Server-side Assessment Report PDF renderer using PDFKit.
 *
 * The assessment report has only ever existed as a live form
 * (`components/inspection/assessment-report-form.tsx`) rendered on the four
 * pipeline pages — there was no PDF export. The full-dossier download (RWB
 * archiving points 4 & 8) needs a printable snapshot of the saved
 * `technical_assessments.assessment_report_data`, so this module renders that
 * JSON with the same section structure and labels as the form.
 *
 * Node-only (API routes). Follows the font/logo conventions of
 * `lib/pdf-permit-server.ts`.
 */
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";

// ─── Assets / fonts (same conventions as lib/pdf-permit-server.ts) ───────────

const ASSETS_DIR = path.join(process.cwd(), "public", "assets");
const LOGO_PATH = path.join(ASSETS_DIR, "rwanda_water_board_Logo.png");

const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
const SEGOE_REGULAR = path.join(FONTS_DIR, "segoeui.ttf");
const SEGOE_BOLD = path.join(FONTS_DIR, "segoeuib.ttf");
const SEGOE_ITALIC = path.join(FONTS_DIR, "segoeuii.ttf");

const hasSegoe = fs.existsSync(SEGOE_REGULAR) && fs.existsSync(SEGOE_BOLD);

const FONT_REGULAR = hasSegoe ? "SegoeUI" : "Times-Roman";
const FONT_BOLD = hasSegoe ? "SegoeUI-Bold" : "Times-Bold";
const FONT_ITALIC = hasSegoe ? "SegoeUI-Italic" : "Times-Italic";

const RWB_BLUE = "#004b87";
const TEXT_COLOR = "#1a1a1a";
const MUTED_COLOR = "#555555";

export interface AssessmentReportRenderOpts {
  applicationNumber: string;
  projectTitle?: string | null;
  reportType: ReportType;
  data: Partial<AssessmentReportData>;
  assessmentNumber?: string | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
  /** 'yes' | 'no' from technical_assessments.recommendation */
  recommendation?: string | null;
  explanationText?: string | null;
  submittedAt?: string | null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withUnit(value: string | undefined, unit: string | undefined): string | null {
  if (!hasText(value)) return null;
  return unit && unit.trim() ? `${value.trim()} ${unit.trim()}` : value.trim();
}

function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: 50, bottom: 56, left: 50, right: 50 },
  });
  if (hasSegoe) {
    doc.registerFont("SegoeUI", SEGOE_REGULAR);
    doc.registerFont("SegoeUI-Bold", SEGOE_BOLD);
    doc.registerFont(
      "SegoeUI-Italic",
      fs.existsSync(SEGOE_ITALIC) ? SEGOE_ITALIC : SEGOE_REGULAR
    );
  }
  return doc;
}

/**
 * Renders the saved assessment report data to a PDF buffer.
 * Sections with no saved values are skipped, so partially filled reports
 * still produce a clean document.
 */
export async function generateAssessmentReportPdfBuffer(
  opts: AssessmentReportRenderOpts
): Promise<Buffer> {
  const { data, reportType } = opts;
  const doc = createDoc();

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ── Header ────────────────────────────────────────────────────────────────
  if (fs.existsSync(LOGO_PATH)) {
    const logoWidth = 90;
    const centerX = (doc.page.width - logoWidth) / 2;
    doc.image(LOGO_PATH, centerX, doc.y, { width: logoWidth });
    doc.moveDown(0.5);
    doc.y += 90; // logo height ≈ width for the RWB seal
  }

  doc
    .font(FONT_BOLD)
    .fontSize(14)
    .fillColor(RWB_BLUE)
    .text("REPUBLIC OF RWANDA", { align: "center" })
    .moveDown(0.2)
    .fontSize(12)
    .text("RWANDA WATER RESOURCES BOARD", { align: "center" })
    .moveDown(0.6);

  const title =
    reportType === "concession"
      ? "WATER CONCESSION PERMIT APPLICATION ASSESSMENT REPORT"
      : "WATER ABSTRACTION PERMIT APPLICATION ASSESSMENT REPORT";
  doc.fontSize(13).fillColor(TEXT_COLOR).text(title, { align: "center" });
  doc.moveDown(0.4);

  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED_COLOR);
  doc.text(`Application: ${opts.applicationNumber}`, { align: "center" });
  if (hasText(opts.projectTitle)) {
    doc.text(`Project: ${opts.projectTitle.trim()}`, { align: "center" });
  }
  if (hasText(opts.assessmentNumber)) {
    doc.text(`Assessment: ${opts.assessmentNumber.trim()}`, { align: "center" });
  }
  doc.moveDown(1);

  // ── Layout helpers ────────────────────────────────────────────────────────
  let sectionIndex = 0;
  const sectionTitle = (label: string) => {
    sectionIndex += 1;
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
    }
    doc.moveDown(0.6);
    doc
      .font(FONT_BOLD)
      .fontSize(11.5)
      .fillColor(RWB_BLUE)
      .text(`${sectionIndex}. ${label}`);
    const y = doc.y + 2;
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(RWB_BLUE)
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .stroke()
      .restore();
    doc.moveDown(0.5);
  };

  const field = (label: string, value: string | null | undefined) => {
    if (!hasText(value)) return;
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .fillColor(TEXT_COLOR)
      .text(`${label}: `, { continued: true })
      .font(FONT_REGULAR)
      .text(value.trim());
    doc.moveDown(0.15);
  };

  const paragraphField = (label: string, value: string | null | undefined) => {
    if (!hasText(value)) return;
    doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT_COLOR).text(`${label}:`);
    doc.moveDown(0.1);
    doc.font(FONT_REGULAR).fontSize(10).text(value.trim());
    doc.moveDown(0.35);
  };

  const bullet = (text: string) => {
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(TEXT_COLOR)
      .text(`•  ${text}`, { indent: 8 });
    doc.moveDown(0.1);
  };

  // ── 1. Permit Applicant Identification ────────────────────────────────────
  sectionTitle("Permit Applicant Identification");
  field("Name of the applicant", data.applicantName);
  field("ID / TIN", data.applicantIdTin);
  field("Residence", data.residence);
  field("Type of activity", data.typeOfActivity);
  field("Representative", data.representative);
  field("Telephone", data.contactTel);
  field("Email", data.contactEmail);

  // ── 2. Required Documents ─────────────────────────────────────────────────
  if (Array.isArray(data.requiredDocuments) && data.requiredDocuments.length > 0) {
    sectionTitle("Required Documents");
    for (const requiredDoc of data.requiredDocuments) {
      if (!requiredDoc || !hasText(requiredDoc.label)) continue;
      bullet(`${requiredDoc.label} — ${requiredDoc.provided ? "Provided" : "Not provided"}`);
    }
    if (Array.isArray(data.annexDocuments) && data.annexDocuments.length > 0) {
      doc.moveDown(0.2);
      doc.font(FONT_BOLD).fontSize(10).text("Annex documents:");
      doc.moveDown(0.1);
      for (const annex of data.annexDocuments) {
        if (annex && hasText(annex.name)) bullet(annex.name);
      }
    }
  }

  // ── 3. Water Source ───────────────────────────────────────────────────────
  sectionTitle("Water Source");
  field("Name of the water source", data.sourceName);
  field("Location", data.sourceLocation);
  field("Latitude", data.sourceLatitude);
  field("Longitude", data.sourceLongitude);
  field("Catchment (level 1)", data.catchmentLevel1);
  field("Catchment (level 2)", data.catchmentLevel2);
  field(
    "Flow of the water source",
    withUnit(data.sourceFlowValue ?? data.sourceFlowM3Day, data.sourceFlowUnit ?? "m3/day")
  );
  field("Flow of the water source (L/s)", data.sourceFlowLps);
  if (Array.isArray(data.sourcePolygonPoints) && data.sourcePolygonPoints.length > 0) {
    doc.moveDown(0.2);
    doc.font(FONT_BOLD).fontSize(10).text("Polygon points:");
    doc.moveDown(0.1);
    data.sourcePolygonPoints.forEach((point, idx) => {
      if (!point) return;
      bullet(`P${idx + 1}: ${point.latitude}, ${point.longitude}`);
    });
  }

  if (reportType === "abstraction") {
    // ── 4. Amount of water to be abstracted ─────────────────────────────────
    const abstraction: Array<[string, string | null]> = [
      ["Quantity", withUnit(data.flowRateM3Day, data.flowRateM3DayUnit ?? "m3/year")],
      ["Flow rate", withUnit(data.flowRateLps, data.flowRateUnit ?? "m3/day")],
      ["Intended abstraction method", hasText(data.abstractionMethod) ? data.abstractionMethod : null],
      [
        "Return flow",
        data.returnFlow === "yes" ? "Yes" : data.returnFlow === "no" ? "No" : null,
      ],
    ];
    if (abstraction.some(([, value]) => hasText(value))) {
      sectionTitle("Amount of water to be abstracted");
      for (const [label, value] of abstraction) field(label, value);
    }

    // ── 5. Water balance ────────────────────────────────────────────────────
    const hasBalance =
      hasText(data.waterBalanceDescription) ||
      hasText(data.availableWaterQ) ||
      hasText(data.waterDemandD) ||
      hasText(data.existingDemandED) ||
      hasText(data.remainingWater) ||
      hasText(data.waterStorage) ||
      hasText(data.waterUseConflict);
    if (hasBalance) {
      sectionTitle("Water Balance");
      paragraphField("Description of the water balance", data.waterBalanceDescription);
      field("Available water (Q)", withUnit(data.availableWaterQ, data.availableWaterQUnit ?? "m3/day"));
      field("Water demand (D)", withUnit(data.waterDemandD, data.waterDemandDUnit ?? "m3/day"));
      field("Existing demand (ED)", withUnit(data.existingDemandED, data.existingDemandEDUnit ?? "m3/day"));
      field("Remaining water (Q-D-ED)", withUnit(data.remainingWater, data.remainingWaterUnit ?? "m3/day"));
      field("Water storage (m3)", data.waterStorage);
      paragraphField("Potential water use conflicts", data.waterUseConflict);
    }
  } else {
    // ── 4. Surface area to be covered (concession) ──────────────────────────
    const hasConcession =
      hasText(data.surfaceAreaHa) ||
      (Array.isArray(data.beacons) && data.beacons.length > 0) ||
      hasText(data.existingWaterUses);
    if (hasConcession) {
      sectionTitle("Surface area to be covered");
      field("Surface area", withUnit(data.surfaceAreaHa, data.surfaceAreaUnit ?? "ha"));
      if (Array.isArray(data.beacons) && data.beacons.length > 0) {
        doc.moveDown(0.2);
        doc.font(FONT_BOLD).fontSize(10).text("Beacon coordinates:");
        doc.moveDown(0.1);
        for (const beacon of data.beacons) {
          if (!beacon) continue;
          bullet(`${beacon.id}: ${beacon.latitude}, ${beacon.longitude}`);
        }
      }
      paragraphField("Existing water uses", data.existingWaterUses);
    }
  }

  // ── Planned wastewater management / pollution risk ────────────────────────
  const hasWastewater =
    hasText(data.wastewaterSystemType) ||
    hasText(data.wastewaterSystemDescription) ||
    hasText(data.pollutionDescription) ||
    hasText(data.pollutionImpactLevel);
  if (hasWastewater) {
    sectionTitle("Planned Wastewater Management System");
    field("System type", data.wastewaterSystemType);
    paragraphField("System description", data.wastewaterSystemDescription);
    paragraphField("Potential pollution description", data.pollutionDescription);
    field("Pollution impact level", data.pollutionImpactLevel);
  }

  // ── Assessment report completion ──────────────────────────────────────────
  const hasCompletion =
    hasText(data.conclusion) ||
    hasText(data.recommendations) ||
    hasText(data.reportDate) ||
    hasText(opts.inspectorName) ||
    hasText(opts.inspectionDate);
  if (hasCompletion) {
    sectionTitle("Assessment Report Completion");
    paragraphField("Conclusion", data.conclusion);
    paragraphField("Recommendations", data.recommendations);
    field("Report date", data.reportDate);
    field("Assessor", opts.inspectorName);
    field("Inspection date", opts.inspectionDate);
    field("Submitted", opts.submittedAt);
  }

  // ── Assessor recommendation ───────────────────────────────────────────────
  if (hasText(opts.recommendation)) {
    sectionTitle("Assessor Recommendation");
    field(
      "Recommendation",
      opts.recommendation.trim().toLowerCase() === "yes"
        ? "Issuance of the permit is recommended"
        : "Issuance of the permit is NOT recommended"
    );
    paragraphField("Explanation", opts.explanationText);
  }

  // ── Footer note ───────────────────────────────────────────────────────────
  doc.moveDown(1.2);
  doc
    .font(FONT_ITALIC)
    .fontSize(8.5)
    .fillColor(MUTED_COLOR)
    .text(
      `System-generated snapshot of the assessment report saved in the Water Permit Application System. Generated on ${new Date().toISOString().slice(0, 10)}.`
    );

  doc.end();
  return done;
}
