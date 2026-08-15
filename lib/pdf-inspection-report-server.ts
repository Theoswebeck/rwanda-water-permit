/**
 * Server-side Inspection Report PDF renderer using PDFKit.
 *
 * The inspection report has only ever existed as a live form
 * (`components/inspection/inspection-form-layout.tsx`) rendered on the four
 * pipeline pages — there was no way to take an approved inspection off the
 * system. RWB inspectors need a printable/archivable copy, so this module
 * renders a saved `public.inspections` row using the SAME numbered sections
 * and labels as the form ("1. Permit Holder Identification", "3. Findings
 * (permitted vs actual)", …) so a reader can match paper to screen.
 *
 * Two inputs, mirroring how the form itself is fed:
 *   - `form`  — the inspection's own columns (what the inspector typed),
 *   - `locked` — the permit-derived context, resolved by the same
 *     `prepareInspectionData` used by the editor pages.
 * Inspector-provided `locked_field_overrides` win over `locked`, exactly as
 * `EditableLockedField` behaves on screen.
 *
 * Node-only (API routes). Follows the font/logo conventions of
 * `lib/pdf-permit-server.ts` and `lib/pdf-assessment-report-server.ts`.
 */
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";

// ─── Assets / fonts (same conventions as lib/pdf-assessment-report-server.ts) ─

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
const RULE_COLOR = "#d5dde5";

export type InspectionReportTemplate = "authorization" | "concession";

export type InspectionBoundaryRow = {
  beacon?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type EmploymentRow = { male?: number | null; female?: number | null; total?: number | null };

/** Subset of `public.inspections` the report renders (see payload-columns.data.json). */
export interface InspectionReportForm {
  activity_type?: string | null;
  activity_starting_date?: string | null;
  project_latitude?: number | string | null;
  project_longitude?: number | string | null;

  wastewater_system_type?: string | null;
  wastewater_system_effectiveness?: string | null;

  fees_payment_amount?: number | string | null;
  fees_payment_details?: string | null;

  reports_submission_date?: string | null;
  reports_reference_number?: string | null;
  reports_proof?: string | null;

  water_use_conflicts?: string | null;
  catchment_protection_initiatives?: string | null;
  general_conclusion?: string | null;
  recommendations?: string | null;
  recommendation_details?: string | null;

  allowed_quantity?: number | string | null;
  allowed_unit?: string | null;
  authorized_abstraction_method?: string | null;
  actual_quantity?: number | string | null;
  actual_unit?: string | null;
  actual_abstraction_method?: string | null;
  measurement_device_type?: string | null;

  authorized_surface_area_ha?: number | string | null;
  actual_surface_area_ha?: number | string | null;
  authorized_concession_boundaries?: InspectionBoundaryRow[] | null;
  actual_concession_boundaries?: InspectionBoundaryRow[] | null;

  catchment_level1?: string | null;
  catchment_level2?: string | null;

  manual_inspection_subject?: string | null;
  manual_inspection_reason?: string | null;
  manual_contact_name?: string | null;
  manual_contact_phone?: string | null;
  manual_site_notes?: string | null;

  employment_gender_breakdown?: Record<string, EmploymentRow | undefined> | null;
  ohs_gender_sensitive?: Record<string, { value?: boolean | null; remarks?: string | null } | undefined> | null;

  inspection_documents?: Array<Record<string, unknown>> | null;
  locked_field_overrides?: Record<string, string> | null;
}

/** Permit-derived context, as produced by `prepareInspectionData`. */
export interface InspectionReportLocked {
  permitHolderName?: string | null;
  permitHolderId?: string | null;
  residence?: string | null;
  permitNumber?: string | null;
  issuanceDate?: string | null;
  expirationDate?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  waterSourceType?: string | null;
  waterSourceName?: string | null;
  waterPurpose?: string | null;
  waterSourceLocation?: string | null;
  waterSourceLatitude?: string | null;
  waterSourceLongitude?: string | null;
  catchmentLevel1?: string | null;
  catchmentLevel2?: string | null;
  concessionAreaHa?: number | null;
  concessionBoundaries?: InspectionBoundaryRow[] | null;
  activityType?: string | null;
  activityStartingDate?: string | null;
}

export interface InspectionReportRenderOpts {
  template: InspectionReportTemplate;
  /** No permit linked — the "No Permit Inspection" variant of the form. */
  manualInspection?: boolean;
  form: InspectionReportForm;
  locked?: InspectionReportLocked | null;
  /** Header metadata. */
  inspectionNumber?: string | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
  workflowStatus?: string | null;
  approvedAt?: string | null;
}

// ─── Value helpers ───────────────────────────────────────────────────────────

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Renders numbers, numeric strings and dates to a trimmed display string. */
function toDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (!s || s.toUpperCase() === "N/A") return null;
  return s;
}

function withUnit(value: unknown, unit?: string | null): string | null {
  const v = toDisplay(value);
  if (!v) return null;
  return hasText(unit) ? `${v} ${unit.trim()}` : v;
}

function yesNo(value: unknown): string | null {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (hasText(value)) {
    const v = value.trim().toLowerCase();
    if (v === "yes" || v === "true") return "Yes";
    if (v === "no" || v === "false") return "No";
    return value.trim();
  }
  return null;
}

function boundaryRows(value: unknown): InspectionBoundaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r) => r && (toDisplay(r.beacon) || toDisplay(r.latitude) || toDisplay(r.longitude)),
  ) as InspectionBoundaryRow[];
}

function documentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((d) => {
      if (!d || typeof d !== "object") return null;
      const rec = d as Record<string, unknown>;
      const name =
        toDisplay(rec.name) ||
        (hasText(rec.fileName) ? path.basename(rec.fileName) : null) ||
        (hasText(rec.url) ? path.basename(rec.url) : null);
      return name;
    })
    .filter((n): n is string => !!n);
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
    doc.registerFont("SegoeUI-Italic", fs.existsSync(SEGOE_ITALIC) ? SEGOE_ITALIC : SEGOE_REGULAR);
  }
  return doc;
}

/**
 * Renders a saved inspection to a PDF buffer. Empty sections are skipped so a
 * sparsely filled inspection still produces a clean document, but the numbered
 * headings keep the form's numbering (a missing "7." means nothing was recorded
 * for the annual report, not that the section moved).
 */
export async function generateInspectionReportPdfBuffer(
  opts: InspectionReportRenderOpts,
): Promise<Buffer> {
  const { form, template, manualInspection = false } = opts;
  const locked = opts.locked || {};
  const overrides = form.locked_field_overrides || {};
  const doc = createDoc();

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  /** Override-first resolution — mirrors `EditableLockedField` on screen. */
  const pick = (overrideKey: string, lockedValue: unknown): string | null =>
    toDisplay(overrides[overrideKey]) ?? toDisplay(lockedValue);

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

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

  const title = manualInspection
    ? "NO-PERMIT WATER USE INSPECTION REPORT"
    : template === "concession"
      ? "WATER CONCESSION PERMIT INSPECTION REPORT"
      : "WATER ABSTRACTION PERMIT INSPECTION REPORT";
  doc.fontSize(13).fillColor(TEXT_COLOR).text(title, { align: "center" });
  doc.moveDown(0.4);

  const permitNumber = manualInspection
    ? pick("permitNumber", null)
    : pick("permitNumber", locked.permitNumber);

  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED_COLOR);
  doc.text(`Permit: ${permitNumber || "No permit"}`, { align: "center" });
  if (hasText(opts.inspectionNumber)) {
    doc.text(`Inspection: ${opts.inspectionNumber.trim()}`, { align: "center" });
  }
  const headerBits = [
    hasText(opts.inspectionDate) ? `Inspection date: ${opts.inspectionDate.trim()}` : null,
    hasText(opts.inspectorName) ? `Inspector: ${opts.inspectorName.trim()}` : null,
  ].filter(Boolean);
  if (headerBits.length) doc.text(headerBits.join("  ·  "), { align: "center" });
  if (hasText(opts.workflowStatus)) {
    doc.text(
      `Status: ${opts.workflowStatus.trim().replace(/_/g, " ").toUpperCase()}${
        hasText(opts.approvedAt) ? ` on ${opts.approvedAt.trim()}` : ""
      }`,
      { align: "center" },
    );
  }
  doc.moveDown(1);

  // ── Layout helpers ────────────────────────────────────────────────────────
  const ensureSpace = (needed: number) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - needed) doc.addPage();
  };

  /** Section headings keep the form's own numbering, hence the explicit label. */
  const sectionTitle = (label: string) => {
    ensureSpace(60);
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(11.5).fillColor(RWB_BLUE).text(label);
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

  const subTitle = (label: string) => {
    ensureSpace(40);
    doc.moveDown(0.3);
    doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT_COLOR).text(label);
    doc.moveDown(0.2);
  };

  const field = (label: string, value: string | null | undefined) => {
    if (!hasText(value)) return;
    ensureSpace(30);
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
    ensureSpace(50);
    doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT_COLOR).text(`${label}:`);
    doc.moveDown(0.1);
    doc.font(FONT_REGULAR).fontSize(10).text(value.trim());
    doc.moveDown(0.35);
  };

  const bullet = (text: string) => {
    ensureSpace(24);
    doc.font(FONT_REGULAR).fontSize(10).fillColor(TEXT_COLOR).text(`•  ${text}`, { indent: 8 });
    doc.moveDown(0.1);
  };

  /**
   * Simple fixed-column table. Used for the permitted-vs-actual comparison,
   * the employment breakdown and the boundary beacon lists — the three places
   * where the on-screen form is a grid and prose would lose the alignment.
   */
  const table = (headers: string[], rows: Array<Array<string | null | undefined>>, weights?: number[]) => {
    if (!rows.length) return;
    const cols = headers.length;
    const w = weights && weights.length === cols ? weights : new Array(cols).fill(1);
    const totalWeight = w.reduce((a, b) => a + b, 0);
    const widths = w.map((x) => (x / totalWeight) * contentWidth);
    const xs: number[] = [];
    let acc = doc.page.margins.left;
    for (const width of widths) {
      xs.push(acc);
      acc += width;
    }
    const PAD = 4;

    const rowHeightOf = (cells: Array<string | null | undefined>, bold: boolean): number => {
      const font = bold ? FONT_BOLD : FONT_REGULAR;
      doc.font(font).fontSize(9);
      const heights = cells.map((c, i) =>
        doc.heightOfString(c ? String(c) : "—", { width: widths[i] - PAD * 2 }),
      );
      return Math.max(...heights) + PAD * 2;
    };

    const drawRow = (cells: Array<string | null | undefined>, bold: boolean) => {
      const font = bold ? FONT_BOLD : FONT_REGULAR;
      const rowHeight = rowHeightOf(cells, bold);
      const top = doc.y;
      cells.forEach((c, i) => {
        doc
          .font(font)
          .fontSize(9)
          .fillColor(TEXT_COLOR)
          .text(c ? String(c) : "—", xs[i] + PAD, top + PAD, { width: widths[i] - PAD * 2 });
      });
      const bottom = top + rowHeight;
      doc
        .save()
        .lineWidth(0.5)
        .strokeColor(RULE_COLOR)
        .moveTo(doc.page.margins.left, bottom)
        .lineTo(doc.page.width - doc.page.margins.right, bottom)
        .stroke()
        .restore();
      doc.y = bottom;
      doc.x = doc.page.margins.left;
    };

    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    // A table that breaks across pages repeats its header, otherwise the
    // orphaned rows on the next page have no column labels.
    if (doc.y + rowHeightOf(headers, true) + rowHeightOf(rows[0], false) > bottomLimit()) {
      doc.addPage();
    }
    drawRow(headers, true);
    for (const row of rows) {
      if (doc.y + rowHeightOf(row, false) > bottomLimit()) {
        doc.addPage();
        drawRow(headers, true);
      }
      drawRow(row, false);
    }
    doc.moveDown(0.4);
  };

  /**
   * Renders a section only when at least one of its fields has a value — an
   * empty heading with nothing under it reads as missing data rather than as
   * "not applicable to this inspection".
   */
  const fieldSection = (title: string, entries: Array<[string, string | null | undefined]>) => {
    if (!entries.some(([, v]) => hasText(v))) return;
    sectionTitle(title);
    for (const [label, value] of entries) field(label, value);
  };

  // ── No Permit Inspection Details ──────────────────────────────────────────
  if (manualInspection) {
    sectionTitle("No Permit Inspection Details");
    field("Subject / Operator / Site name", toDisplay(form.manual_inspection_subject));
    field("Contact name", toDisplay(form.manual_contact_name));
    field("Contact phone", toDisplay(form.manual_contact_phone));
    paragraphField("Reason for inspection", toDisplay(form.manual_inspection_reason));
    paragraphField("Site notes", toDisplay(form.manual_site_notes));
  }

  // ── 1. Permit Holder Identification / 2. Permit Particulars ───────────────
  if (!manualInspection) {
    fieldSection("1. Permit Holder Identification", [
      ["Name", pick("permitHolderName", locked.permitHolderName)],
      ["ID/TIN", pick("permitHolderId", locked.permitHolderId)],
      ["Residence", pick("residence", locked.residence)],
    ]);
    fieldSection("2. Permit Particulars", [
      ["Number", permitNumber],
      ["Issuance date", pick("issuanceDate", locked.issuanceDate)],
      ["Expiration date", pick("expirationDate", locked.expirationDate)],
    ]);
  }

  // ── 2.1 Project Location ──────────────────────────────────────────────────
  fieldSection(manualInspection ? "1. Project Location" : "2.1 Project Location", [
    ["Province / City of Kigali", pick("permitLocationProvince", locked.province)],
    ["District", pick("permitLocationDistrict", locked.district)],
    ["Sector", pick("permitLocationSector", locked.sector)],
    ["Cell", pick("permitLocationCell", locked.cell)],
    ["Village", pick("permitLocationVillage", locked.village)],
    ["Project Latitude", toDisplay(form.project_latitude)],
    ["Project Longitude", toDisplay(form.project_longitude)],
  ]);

  // ── 2.2 Water Source & Purpose ────────────────────────────────────────────
  fieldSection(manualInspection ? "2. Water Source & Purpose" : "2.2 Water Source & Purpose", [
    ["Water Source Type", pick("waterSourceType", locked.waterSourceType)],
    ["Water Source Name", pick("waterSourceName", locked.waterSourceName)],
    ["Water Use / Purpose", pick("waterPurpose", locked.waterPurpose)],
    ["Location", pick("waterSourceLocation", locked.waterSourceLocation)],
    ["Water Source Latitude", pick("waterSourceLatitude", locked.waterSourceLatitude)],
    ["Water Source Longitude", pick("waterSourceLongitude", locked.waterSourceLongitude)],
    [
      "Catchment (level 1)",
      toDisplay(overrides.catchmentLevel1) ??
        toDisplay(form.catchment_level1) ??
        toDisplay(locked.catchmentLevel1),
    ],
    [
      "Catchment (level 2)",
      toDisplay(overrides.catchmentLevel2) ??
        toDisplay(form.catchment_level2) ??
        toDisplay(locked.catchmentLevel2),
    ],
  ]);

  // ── 2.3 Concession Area ───────────────────────────────────────────────────
  const permittedArea =
    toDisplay(overrides.concessionAreaHa) ??
    toDisplay(locked.concessionAreaHa) ??
    toDisplay(form.authorized_surface_area_ha);
  if (template === "concession") {
    const authBoundaries = boundaryRows(locked.concessionBoundaries).length
      ? boundaryRows(locked.concessionBoundaries)
      : boundaryRows(form.authorized_concession_boundaries);
    fieldSection(manualInspection ? "3. Concession Area" : "2.3 Concession Area", [
      ["Concession Area (Ha)", permittedArea],
      [
        "Boundary Points",
        authBoundaries.length
          ? `${authBoundaries.length} points defined`
          : pick("concessionBoundaryPoints", null),
      ],
    ]);
  }

  // ── 3. Findings (permitted vs actual) ─────────────────────────────────────
  const findingRows: Array<Array<string | null>> =
    template === "authorization"
      ? [
          [
            "Activity",
            pick("waterPurpose", locked.waterPurpose),
            toDisplay(overrides.actualActivity),
          ],
          [
            "Abstraction quantity",
            withUnit(
              toDisplay(form.allowed_quantity) ?? toDisplay(overrides.allowedQuantity),
              form.allowed_unit,
            ),
            withUnit(toDisplay(form.actual_quantity), form.actual_unit),
          ],
          [
            "Abstraction method",
            toDisplay(form.authorized_abstraction_method) ??
              toDisplay(overrides.authorizedAbstractionMethod),
            toDisplay(form.actual_abstraction_method),
          ],
        ]
      : [
          [
            "Activity",
            pick("waterPurpose", locked.waterPurpose),
            toDisplay(overrides.actualActivity),
          ],
          [
            "Concession area",
            withUnit(permittedArea, overrides.permittedConcessionAreaUnit || "ha"),
            withUnit(toDisplay(form.actual_surface_area_ha), overrides.actualConcessionAreaUnit || "ha"),
          ],
        ];
  const hasFindings =
    findingRows.some((r) => r.slice(1).some(Boolean)) ||
    hasText(form.measurement_device_type) ||
    boundaryRows(form.actual_concession_boundaries).length > 0;

  if (hasFindings) sectionTitle("3. Findings (permitted vs actual)");
  if (hasFindings && template === "authorization") {
    table(["Item", "Permitted", "Actual (observed on site)"], findingRows, [1.1, 1.45, 1.45]);
    field("Type of water measurement device in place", toDisplay(form.measurement_device_type));
  } else if (hasFindings) {
    table(["Item", "Permitted", "Actual (observed on site)"], findingRows, [1.1, 1.45, 1.45]);

    const authBoundaries = boundaryRows(locked.concessionBoundaries).length
      ? boundaryRows(locked.concessionBoundaries)
      : boundaryRows(form.authorized_concession_boundaries);
    if (authBoundaries.length) {
      subTitle("Authorized concession boundaries");
      table(
        ["Beacon", "Latitude", "Longitude"],
        authBoundaries.map((r) => [toDisplay(r.beacon), toDisplay(r.latitude), toDisplay(r.longitude)]),
      );
    }
    const actualBoundaries = boundaryRows(form.actual_concession_boundaries);
    if (actualBoundaries.length) {
      subTitle("Actual concession boundaries");
      table(
        ["Beacon", "Latitude", "Longitude"],
        actualBoundaries.map((r) => [toDisplay(r.beacon), toDisplay(r.latitude), toDisplay(r.longitude)]),
      );
    }
  }

  // ── 5. Social and Gender-Disaggregated Information ────────────────────────
  const employment = form.employment_gender_breakdown || {};
  const EMPLOYMENT_ROWS: Array<[string, string]> = [
    ["skilledPermanentWorkers", "Skilled Permanent Workers"],
    ["unskilledPermanentWorkers", "Unskilled Permanent Workers"],
    ["skilledTemporaryWorkers", "Skilled Temporary Workers"],
    ["unskilledTemporaryWorkers", "Unskilled Temporary Workers"],
    ["totalWorkers", "Total Workers"],
  ];
  const employmentRows = EMPLOYMENT_ROWS.map(([key, label]) => {
    const row = employment[key] || {};
    return [label, toDisplay(row.male), toDisplay(row.female), toDisplay(row.total)];
  });
  const ohs = form.ohs_gender_sensitive || {};
  const OHS_ROWS: Array<[string, string]> = [
    ["genderInclusiveSafetyMeasures", "Gender-inclusive safety measures are in place"],
    ["separateSanitationFacilities", "Separate Sanitation Facilities"],
    ["genderResponsiveGrievanceMechanism", "Gender-responsive Grievance Mechanism"],
  ];
  const ohsRows = OHS_ROWS.map(([key, label]) => {
    const item = ohs[key] || {};
    return [label, yesNo(item.value), toDisplay(item.remarks)];
  });
  const hasEmployment = employmentRows.some((r) => r.slice(1).some(Boolean));
  const hasOhs = ohsRows.some((r) => r.slice(1).some(Boolean));
  if (hasEmployment || hasOhs) {
    sectionTitle("5. Social and Gender-Disaggregated Information");
    if (hasEmployment) {
      subTitle("5.1 Employment Related to Water Use Activity");
      table(["Category", "Male", "Female", "Total"], employmentRows, [2, 1, 1, 1]);
    }
    if (hasOhs) {
      subTitle("5.2 Occupational Health and Safety (Gender-Sensitive)");
      table(["Item", "Yes/No", "Remarks"], ohsRows, [2, 0.7, 2]);
    }
  }

  // ── 6. Pending Fees ───────────────────────────────────────────────────────
  if (toDisplay(form.fees_payment_amount) || hasText(form.fees_payment_details)) {
    sectionTitle("6. Pending Fees");
    field("Amount", toDisplay(form.fees_payment_amount));
    paragraphField("Details and relevance of pending fees", toDisplay(form.fees_payment_details));
  }

  // ── 7. Water User Annual Report ───────────────────────────────────────────
  if (
    toDisplay(form.reports_submission_date) ||
    hasText(form.reports_reference_number) ||
    hasText(form.reports_proof)
  ) {
    sectionTitle("7. Water User Annual Report");
    field("Recent Submission Date", toDisplay(form.reports_submission_date));
    field("Reference number", toDisplay(form.reports_reference_number));
    field("Report Submitted", yesNo(form.reports_proof));
  }

  // ── 8. Wastewater Management System ───────────────────────────────────────
  if (hasText(form.wastewater_system_type) || hasText(form.wastewater_system_effectiveness)) {
    sectionTitle("8. Wastewater Management System");
    field("Type of the system", toDisplay(form.wastewater_system_type));
    field("Effectiveness of the system", toDisplay(form.wastewater_system_effectiveness));
  }

  // ── 9. Water use conflicts ────────────────────────────────────────────────
  if (hasText(form.water_use_conflicts)) {
    sectionTitle("9. Water use conflicts");
    doc.font(FONT_REGULAR).fontSize(10).fillColor(TEXT_COLOR).text(form.water_use_conflicts.trim());
    doc.moveDown(0.3);
  }

  // ── 10. Catchment protection initiatives ──────────────────────────────────
  if (hasText(form.catchment_protection_initiatives)) {
    sectionTitle("10. Catchment protection initiatives");
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(TEXT_COLOR)
      .text(form.catchment_protection_initiatives.trim());
    doc.moveDown(0.3);
  }

  // ── 11. Conclusion and recommendations ────────────────────────────────────
  if (
    hasText(form.general_conclusion) ||
    hasText(form.recommendations) ||
    hasText(form.recommendation_details)
  ) {
    sectionTitle("11. Conclusion and recommendations");
    paragraphField("General conclusion", toDisplay(form.general_conclusion));
    field("Recommendations from Assessor", toDisplay(form.recommendations));
    paragraphField("Details", toDisplay(form.recommendation_details));
  }

  // ── 12. Attached documents ────────────────────────────────────────────────
  const docNames = documentNames(form.inspection_documents);
  if (docNames.length) {
    sectionTitle("12. Attached documents");
    doc
      .font(FONT_ITALIC)
      .fontSize(8.5)
      .fillColor(MUTED_COLOR)
      .text("Listed for reference — the files themselves are available in the system.");
    doc.moveDown(0.2);
    for (const name of docNames) bullet(name);
  }

  // ── Footer note ───────────────────────────────────────────────────────────
  doc.moveDown(1.2);
  ensureSpace(40);
  doc
    .font(FONT_ITALIC)
    .fontSize(8.5)
    .fillColor(MUTED_COLOR)
    .text(
      `System-generated snapshot of the inspection saved in the Water Permit Application System. Generated on ${new Date().toISOString().slice(0, 10)}.`,
    );

  doc.end();
  return done;
}
