/**
 * Server-side permit PDF renderer using PDFKit.
 * Produces crisp, high-quality PDFs with native PNG rendering and proper opacity.
 * Only runs in Node.js (API routes). Client-side code continues using jsPDF.
 */
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { selectPermitVariant } from "@/lib/permit-variant";

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSETS_DIR = path.join(process.cwd(), "public", "assets");
const LOGO_PATH = path.join(ASSETS_DIR, "rwanda_water_board_Logo.png");
// Cropped watermark asset to avoid transparent margins that cause blur/offset.
const WATERMARK_PATH = path.join(ASSETS_DIR, "rwanda_logo_watermark.png");

const PRODUCTION_URL = "https://waterpermit.rwb.rw";

const PT = 2.83465; // 1mm in points

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PermitApplication {
  id: string;
  application_number: string;
  project_title: string;
  status: string;
  application_type: string;
  water_source: string;
  water_purpose: string;
  estimated_usage_volume: number;
  usage_unit: string;
  intended_activities?: unknown;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village?: string;
  concession_area?: number;
  proposed_duration_years?: number;
  assessor_recommended_volume_m3?: number;
  max_daily_volume_m3?: number;
  max_yearly_volume_m3?: number;
  internal_notes?: string;
  water_taking_method?: string;
  applicant: {
    first_name?: string;
    last_name?: string;
    company_name?: string;
    email: string;
    phone?: string;
    account_type: string;
    id_number?: string;
    company_tin?: string;
    company_address?: string;
  };
}

export interface PermitRenderOpts {
  application: PermitApplication;
  permitNumber: string;
  permitValidityYears?: number;
  issuedDate?: Date;
  expiryDate?: Date;
  isModified?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJson(s: unknown): Record<string, any> | null {
  if (typeof s !== "string" || !s.trim()) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDMY(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtNum(n: number, maxDec = 2): string {
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: isInt ? 0 : maxDec,
    minimumFractionDigits: 0,
  }).format(n);
}

const SMALL_EN: Record<number, string> = {
  0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
  6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
  11: "Eleven", 12: "Twelve", 13: "Thirteen", 14: "Fourteen", 15: "Fifteen",
  16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen", 20: "Twenty",
};
const TENS_EN: Record<number, string> = {
  2: "Twenty", 3: "Thirty", 4: "Forty", 5: "Fifty",
  6: "Sixty", 7: "Seventy", 8: "Eighty", 9: "Ninety",
};

function numWords(n: number): string {
  const num = Math.abs(Math.trunc(n));
  if (SMALL_EN[num]) return SMALL_EN[num];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  const tw = TENS_EN[tens];
  if (!tw) return String(n);
  return ones === 0 ? tw : `${tw}-${SMALL_EN[ones]}`;
}

function resolveNotes(app: PermitApplication) {
  return safeJson(app.internal_notes);
}

function resolveApplicantName(app: PermitApplication): string {
  return app.applicant?.account_type === "individual"
    ? `${app.applicant.first_name ?? ""} ${app.applicant.last_name ?? ""}`.trim() || "N/A"
    : app.applicant?.company_name || "N/A";
}

function resolveIdNumber(app: PermitApplication): string {
  const notes = resolveNotes(app);
  return (notes?.nationalIdNumber as string)?.trim()
    || app.applicant?.id_number?.trim()
    || "N/A";
}

function resolveWaterSourceName(app: PermitApplication): string {
  if ((app as any).water_body_name) return (app as any).water_body_name;
  const notes = resolveNotes(app);
  return (notes?.nameSourceWater as string)?.trim()
    || (app.water_source || "N/A").replaceAll("_", " ");
}

function resolveLakeName(app: PermitApplication): string {
  const name = resolveWaterSourceName(app);
  if (!name || name === "N/A") return "N/A";
  return /\blake\b/i.test(name) ? name : `${name} Lake`;
}

function resolveAdminLocation(app: PermitApplication) {
  const notes = resolveNotes(app);
  return {
    province: (notes?.waterSourceProvince as string)?.trim() || app.province || "N/A",
    district: (notes?.waterSourceDistrict as string)?.trim() || app.district || "N/A",
    sector: (notes?.waterSourceSector as string)?.trim() || app.sector || "N/A",
    cell: (notes?.waterSourceCell as string)?.trim() || app.cell || "N/A",
    village: (notes?.waterSourceVillage as string)?.trim() || app.village || "N/A",
  };
}

function fmtProvince(raw: string): string {
  if (!raw) return "N/A";
  return raw.toLowerCase() === "kigali" ? "CITY OF KIGALI" : `${raw} Province`;
}

function resolveArea(app: PermitApplication): number | null {
  const notes = resolveNotes(app);
  const assessorArea = notes?._assessorAdjustments?.recommendedVolumeM3;
  if (typeof assessorArea === "number" && Number.isFinite(assessorArea) && assessorArea > 0) return assessorArea;
  if (typeof app.concession_area === "number" && Number.isFinite(app.concession_area)) return app.concession_area;
  if (typeof notes?.concessionArea === "number") return notes.concessionArea;
  if (typeof notes?.fishLakeAreaHectares === "number") return notes.fishLakeAreaHectares;
  return null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  irrigation: "Irrigation", water_supply: "Water Supply",
  fish_farming_lakes: "Fish farming in lakes", fish_farming_ponds: "Fish farming in ponds",
  industry: "Industry", coffee_washing: "Coffee Washing",
  electricity_generation: "Electricity Generation (Hydropower)", mining: "Mining",
  construction_of_dam: "Construction of Dam",
  construction_of_infrastructures: "Construction or installation of infrastructure",
  navigation: "Navigation", recreation_activities: "Recreational Activities",
  gaz_extraction: "Gaz Extraction", livestock: "Livestock", other: "Other",
};

function resolveActivities(app: PermitApplication): string {
  let acts: string[] = [];
  if (Array.isArray(app.intended_activities)) acts = app.intended_activities.map(String).filter(Boolean);
  if (!acts.length) {
    const notes = resolveNotes(app);
    const fromNotes = notes?.intendedActivities;
    if (Array.isArray(fromNotes)) acts = fromNotes.map(String).filter(Boolean);
    if (!acts.length && typeof notes?.transferFormData?.waterPurpose === "string") {
      const tp = notes.transferFormData.waterPurpose.trim();
      if (tp) acts = [tp];
    }
  }
  if (acts.length) return acts.map((a) => ACTIVITY_LABELS[a] || a).join(", ");
  const purpose = app.water_purpose?.trim();
  if (purpose) return ACTIVITY_LABELS[purpose] || purpose.replaceAll("_", " ");
  return app.application_type?.trim().replaceAll("_", " ") || "N/A";
}

function resolveLatLng(app: PermitApplication): { lat: string; lng: string } {
  const notes = resolveNotes(app);
  const latVal = notes?.waterSourceLatitude;
  const lngVal = notes?.waterSourceLongitude;
  const lat = typeof latVal === "number" ? latVal : typeof latVal === "string" ? parseFloat(latVal) : NaN;
  const lng = typeof lngVal === "number" ? lngVal : typeof lngVal === "string" ? parseFloat(lngVal) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
  return { lat: "N/A", lng: "N/A" };
}

function resolveAbstractionMethodRaw(app: PermitApplication): string {
  const fromCol = typeof app.water_taking_method === "string" ? app.water_taking_method.trim() : "";
  if (fromCol) return fromCol;
  const notes = resolveNotes(app);
  const fromNotes = notes?.waterAbstractionDetails?.[0]?.abstractionMethod;
  if (typeof fromNotes === "string" && fromNotes.trim()) return fromNotes.trim();
  const fromTransfer = notes?.transferFormData?.abstractionMethod;
  return typeof fromTransfer === "string" ? fromTransfer.trim() : "";
}

function resolveSystemType(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const normalized = raw.toLowerCase();
  if (!normalized) return "GRAVITY SYSTEM";
  if (normalized.includes("pump")) return "PUMPING SYSTEM";
  if (normalized.includes("grav")) return "GRAVITY SYSTEM";
  if (normalized.includes("diversion") || normalized === "diversion_channel") return "DIVERSION CHANNEL";
  if (normalized.includes("dam") || normalized.includes("reservoir")) return "DAM/RESERVOIR";
  if (normalized.includes("borehole")) return "BOREHOLE";
  if (normalized.includes("spring")) return "SPRING CAPTURE";
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) return "HAND DUG WELL";
  return raw.replace(/[_-]/g, " ").toUpperCase() || "GRAVITY SYSTEM";
}

function resolveEnglishSystemLabel(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const normalized = raw.toLowerCase();
  if (!normalized) return "GRAVITY system";
  if (normalized.includes("pump")) return "PUMPING system";
  if (normalized.includes("grav")) return "GRAVITY system";
  if (normalized.includes("diversion") || normalized === "diversion_channel") return "Diversion Channel";
  if (normalized.includes("dam") || normalized.includes("reservoir")) return "Dam/Reservoir";
  if (normalized.includes("borehole")) return "Borehole";
  if (normalized.includes("spring")) return "Spring Capture";
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) return "Hand Dug Well";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GRAVITY system";
}

function resolveVolumes(app: PermitApplication): { yearly: number | null; daily: number | null } {
  const notes = resolveNotes(app);
  const assessorVol = notes?._assessorAdjustments?.recommendedVolumeM3 ?? app.assessor_recommended_volume_m3 ?? null;
  const yearly = assessorVol ?? app.max_yearly_volume_m3 ?? app.estimated_usage_volume ?? null;
  const daily = app.max_daily_volume_m3 ?? (yearly != null ? yearly / 365 : null);
  return { yearly: typeof yearly === "number" && Number.isFinite(yearly) ? yearly : null, daily };
}

function resolvePermitDuration(app: PermitApplication, fallback = 5): number {
  const notes = resolveNotes(app);
  const adj = notes?._assessorAdjustments?.permitLengthYears;
  if (typeof adj === "number" && adj >= 1 && adj <= 15) return adj;
  if (typeof app.proposed_duration_years === "number" && app.proposed_duration_years >= 1) return app.proposed_duration_years;
  return fallback;
}

function computeYearsBetween(a: Date, b: Date): number {
  let years = b.getFullYear() - a.getFullYear();
  const anniv = new Date(a.getFullYear() + years, a.getMonth(), a.getDate());
  if (b.getTime() < anniv.getTime()) years -= 1;
  return years > 0 ? years : 1;
}

function resolvePermitTitleNumber(permitNumber: string, headerYear: number): string {
  const n = permitNumber.trim();
  if (!n) return `N/A/RWB/${headerYear}`;
  if (/\/rwb\/\d{4}$/i.test(n)) return n;
  return `${n}/RWB/${headerYear}`;
}

function resolveOrgAddress(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const parts = [
    (notes?.officeSector as string)?.trim() ? `${notes.officeSector} Sector` : null,
    (notes?.officeDistrict as string)?.trim() ? `${notes.officeDistrict} District` : null,
    (notes?.officeProvince as string)?.trim()
      ? (notes.officeProvince as string).toLowerCase() === "kigali"
        ? "City OF Kigali"
        : `${notes.officeProvince} Province`
      : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return app.applicant?.company_address?.trim() || "N/A";
}

function resolveOrgRep(app: PermitApplication): { name: string; title: string } {
  const notes = resolveNotes(app);
  const name = (notes?.nameRepresentative as string)?.trim()
    || `${app.applicant?.first_name ?? ""} ${app.applicant?.last_name ?? ""}`.trim()
    || "N/A";
  const title = (notes?.representativeTitle as string)?.trim()
    || (notes?.representativePosition as string)?.trim()
    || "Representative";
  return { name, title };
}

function resolveFlowRate(app: PermitApplication): string {
  const v = resolveVolumes(app);
  if (v.yearly != null) return `${fmtNum(v.yearly)} M3/year`;
  if (v.daily != null) return `${fmtNum(v.daily)} M3/day`;
  return "N/A";
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

function drawWatermark(doc: PDFKit.PDFDocument): void {
  if (!fs.existsSync(WATERMARK_PATH)) return;
  const pw = 595.28;
  const ph = 841.89;
  const wmSize = 140 * PT;
  const x = (pw - wmSize) / 2 - 4 * PT;
  const y = (ph - wmSize) / 2 - 18 * PT;
  doc.save();
  doc.opacity(0.50);
  doc.image(WATERMARK_PATH, x, y, { width: wmSize, height: wmSize });
  doc.restore();
}

function drawLogo(doc: PDFKit.PDFDocument): number {
  const pw = 595.28;
  // Slightly taller/narrower box to avoid horizontal stretching.
  const logoW = 52 * PT;
  const logoH = 36 * PT;
  const logoX = (pw - logoW) / 2;
  const logoY = 8 * PT;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, logoX, logoY, { width: logoW, height: logoH });
  } else {
    doc.font("Times-Bold").fontSize(13)
      .text("Rwanda Water Resources Board", 0, 23 * PT, { align: "center", width: pw });
  }
  return logoY + logoH + 10 * PT;
}

function drawTitle(doc: PDFKit.PDFDocument, title: string, yPos: number): number {
  const pw = 595.28;
  doc.font("Times-Bold").fontSize(12);
  const titleW = doc.widthOfString(title);
  const titleX = (pw - titleW) / 2;
  doc.text(title, titleX, yPos);
  doc.moveTo(titleX, yPos + 14).lineTo(titleX + titleW, yPos + 14).lineWidth(0.5).stroke("#000");
  return yPos + 22;
}

async function drawQrFooter(doc: PDFKit.PDFDocument, permitNumber: string): Promise<void> {
  const pw = 595.28;
  const ph = 841.89;
  const verifyUrl = `${PRODUCTION_URL}/permit/view/${encodeURIComponent(permitNumber.trim())}`;

  const marginX = 15 * PT;
  const footerW = pw - marginX * 2;
  const footerH = 46 * PT;
  const footerY = ph - 74 * PT;

  const qrBox = 34 * PT;
  const qrPad = 2.5 * PT;
  const qrX = marginX + (footerW - qrBox) / 2;
  const qrY = footerY + 2 * PT;

  doc.save();
  doc.roundedRect(marginX, footerY, footerW, footerH, 4).lineWidth(0.5).fillAndStroke("#fbfdff", "#e2e8f0");
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 4).fillAndStroke("#ffffff", "#e2e8f0");
  doc.restore();

  const qrPng = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  doc.image(qrPng, qrX + qrPad, qrY + qrPad, { width: qrBox - qrPad * 2, height: qrBox - qrPad * 2 });

  doc.save();
  doc.font("Times-Italic").fontSize(8).fillColor("#646464");
  const disclaimerY = qrY + qrBox + 3 * PT;
  doc.text(
    "This digital permit is only valid if the information on it is the same as the information as the water use permit registry.",
    marginX + 10 * PT, disclaimerY, { width: footerW - 20 * PT, align: "center" },
  );
  doc.restore();
}

function drawPageFooter(doc: PDFKit.PDFDocument, permitNumber: string, page: number, total: number): void {
  const pw = 595.28;
  const y = 841.89 - 12 * PT;
  doc.save().font("Times-Roman").fontSize(8).fillColor("#646464");
  doc.text(`Document ID: ${permitNumber}`, 0, y, { width: pw, align: "center" });
  doc.text(`Page ${page} of ${total}`, pw - 60 * PT, y, { width: 50 * PT, align: "right" });
  doc.restore();
}

// ─── Variant renderers ──────────────────────────────────────────────────────

async function renderConcessionIndividual(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate = opts.expiryDate ?? (() => {
    const d = new Date(issueDate);
    d.setFullYear(d.getFullYear() + resolvePermitDuration(app, opts.permitValidityYears));
    return d;
  })();

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });

  drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = 595.28 - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = 170 * PT;
  const fontSize = 11;
  const lineGap = 2;
  const paraGap = 12;

  const name = resolveApplicantName(app);
  const idNum = resolveIdNumber(app);
  const acts = resolveActivities(app);
  const area = resolveArea(app);
  const areaStr = area != null ? `${fmtNum(area)} Hectare` : "N/A Hectare";
  const lake = resolveLakeName(app);
  const loc = resolveAdminLocation(app);
  const prov = fmtProvince(loc.province);
  const validYears = computeYearsBetween(issueDate, expiryDate);
  const validWord = numWords(validYears);

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
    `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to carry out ${acts} on the surface area of ${areaStr} (Concession area) in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov} as shown on the attached map. This permit applies for activities conducted solely within the water body.`,
    `This water use permit is valid for a period of ${validWord} (${validYears}) years from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  ];

  y += 8;
  doc.font("Times-Roman").fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > 700) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > 640) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }

  y += 4;
  doc.font("Times-Roman").fontSize(fontSize);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, y);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, 0, y, { width: 595.28 - leftX, align: "right" });

  await drawQrFooter(doc, permitNumber);

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
  const expiryDate = opts.expiryDate ?? (() => {
    const d = new Date(issueDate);
    d.setFullYear(d.getFullYear() + resolvePermitDuration(app, opts.permitValidityYears));
    return d;
  })();

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = 595.28 - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = 170 * PT;
  const fontSize = 11;
  const lineGap = 2;
  const paraGap = 12;

  const name = resolveApplicantName(app);
  const idNum = resolveIdNumber(app);
  const wsName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const sysType = resolveSystemType(app);
  const vols = resolveVolumes(app);
  const yearlyStr = vols.yearly != null ? `${fmtNum(vols.yearly)} m³/year` : "N/A m³/year";
  const acts = resolveActivities(app);
  const validYears = computeYearsBetween(issueDate, expiryDate);
  const validWord = numWords(validYears);

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,`,
    `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to abstract water from ${wsName} located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysType} with a flow rate of ${yearlyStr}. Water abstracted will be used for ${acts}.`,
    `This water use permit is valid for a period of ${validYears} (${validWord}) years from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  ];

  y += 8;
  doc.font("Times-Roman").fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > 700) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > 640) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
  y += 4;
  doc.font("Times-Roman").fontSize(fontSize);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, y);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, 0, y, { width: 595.28 - leftX, align: "right" });

  await drawQrFooter(doc, permitNumber);
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) { doc.switchToPage(i); drawPageFooter(doc, permitNumber, i + 1, total); }
  return docToBuffer(doc);
}

async function renderAbstractionOrganization(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate = opts.expiryDate ?? (() => {
    const d = new Date(issueDate);
    d.setFullYear(d.getFullYear() + resolvePermitDuration(app, opts.permitValidityYears));
    return d;
  })();

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = 595.28 - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = 170 * PT;
  const fontSize = 11;
  const lineGap = 2;
  const paraGap = 12;

  const orgName = app.applicant?.company_name?.trim() || resolveApplicantName(app);
  const officeAddr = resolveOrgAddress(app);
  const rep = resolveOrgRep(app);
  const wsName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const sysLabel = resolveEnglishSystemLabel(app);
  const flowRate = resolveFlowRate(app);
  const acts = resolveActivities(app);
  const validYears = computeYearsBetween(issueDate, expiryDate);
  const validWord = numWords(validYears);
  const provLabel = loc.province.toLowerCase() === "kigali" ? "City OF Kigali" : `${loc.province} Province`;

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,`,
    `\u201C${orgName}\u201D, with its registered office address as follows: ${officeAddr}; represented by ${rep.name} \u201C${rep.title}\u201D, is authorized to abstract water from ${wsName} located in ${provLabel}, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysLabel} with a flow rate of ${flowRate}. Water abstracted will be used for ${acts}.`,
    `This water use permit is valid for a period of ${validWord} (${validYears}) years from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  ];

  y += 8;
  doc.font("Times-Roman").fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > 700) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > 640) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
  y += 4;
  doc.font("Times-Roman").fontSize(fontSize);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, y);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, 0, y, { width: 595.28 - leftX, align: "right" });

  await drawQrFooter(doc, permitNumber);
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) { doc.switchToPage(i); drawPageFooter(doc, permitNumber, i + 1, total); }
  return docToBuffer(doc);
}

async function renderConcessionOrganization(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate = opts.expiryDate ?? (() => {
    const d = new Date(issueDate);
    d.setFullYear(d.getFullYear() + resolvePermitDuration(app, opts.permitValidityYears));
    return d;
  })();

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = 595.28 - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = 170 * PT;
  const fontSize = 11;
  const lineGap = 2;
  const paraGap = 12;

  const orgName = resolveApplicantName(app);
  const rep = resolveOrgRep(app);
  const acts = resolveActivities(app);
  const area = resolveArea(app);
  const areaStr = area != null ? `${fmtNum(area)} hectares` : "N/A hectares";
  const lake = resolveLakeName(app);
  const loc = resolveAdminLocation(app);
  const prov = fmtProvince(loc.province);
  const validYears = computeYearsBetween(issueDate, expiryDate);
  const validWord = numWords(validYears);

  const notes = resolveNotes(app);
  const wsLocParts = [
    (notes?.waterSourceSector as string)?.trim() ? `${notes.waterSourceSector} Sector` : null,
    (notes?.waterSourceDistrict as string)?.trim() ? `${notes.waterSourceDistrict} District` : null,
    (notes?.waterSourceProvince as string)?.trim()
      ? (notes.waterSourceProvince as string).toLowerCase() === "kigali" ? "City OF Kigali" : `${notes.waterSourceProvince} Province`
      : null,
  ].filter(Boolean).join(", ") || "N/A";

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
    `\u201C${orgName}\u201D, with its water source location as follows: ${wsLocParts}; represented by ${rep.name}; is authorized to carry out ${acts} on the surface area of ${areaStr} in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov}, as shown on the attached map. This permit applies to activities conducted solely within the water body.`,
    `This water use permit is valid for a period of ${validWord} (${validYears}) years from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  ];

  y += 8;
  doc.font("Times-Roman").fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > 700) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > 640) { doc.addPage(); drawWatermark(doc); y = 30 * PT; }
  y += 4;
  doc.font("Times-Roman").fontSize(fontSize);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, y);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, 0, y, { width: 595.28 - leftX, align: "right" });

  await drawQrFooter(doc, permitNumber);
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) { doc.switchToPage(i); drawPageFooter(doc, permitNumber, i + 1, total); }
  return docToBuffer(doc);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generatePermitPdfBuffer(opts: PermitRenderOpts): Promise<Buffer> {
  const variant = selectPermitVariant(opts.application as any);
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
