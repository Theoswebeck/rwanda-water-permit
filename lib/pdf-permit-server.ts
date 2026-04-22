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
import { addYearsSafe } from "./date-math";
import { getEffectiveInternalNotes } from "./document-overrides";

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
  /** When true, omits the QR code and replaces the footer with a DRAFT banner. */
  skipQr?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function resolveNotes(app: PermitApplication) {
  return getEffectiveInternalNotes(app.internal_notes);
}

function resolveApplicantName(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const fullNameFromNotes =
    typeof notes?.fullNameApplicant === "string" ? notes.fullNameApplicant.trim() : "";
  if (fullNameFromNotes) return fullNameFromNotes;
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  if ((app.application_type === "transfer" || notes?.isTransfer === true) && tfd) {
    const n = (tfd.transfereeName as string | undefined)?.trim();
    if (n) return n;
  }
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
  // Renewal form stores concession area under permitDetails
  if (typeof notes?.permitDetails?.concessionArea === "number") return notes.permitDetails.concessionArea;
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
  // Filter sentinel values stored when waterAbstractionDetails was empty.
  const meaningful = (v: unknown): string =>
    typeof v === "string" &&
    v.trim() !== "" &&
    !/^not[_ ]specified$/i.test(v.trim()) &&
    v.trim().toLowerCase() !== "n/a"
      ? v.trim()
      : "";
  const fromCol = meaningful(app.water_taking_method);
  if (fromCol) return fromCol;
  const notes = resolveNotes(app);
  const fromNotes = meaningful(notes?.waterAbstractionDetails?.[0]?.abstractionMethod);
  if (fromNotes) return fromNotes;
  const fromTransfer = meaningful(notes?.transferFormData?.abstractionMethod);
  return fromTransfer;
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
  // Only treat estimated_usage_volume as meaningful when > 0 — a value of 0 means
  // "not set" (e.g. transfer applications that store volume in transferFormData instead).
  const estVol = (typeof app.estimated_usage_volume === "number" && app.estimated_usage_volume > 0)
    ? app.estimated_usage_volume : null;
  const yearly = assessorVol ?? app.max_yearly_volume_m3 ?? estVol ?? null;
  const daily = app.max_daily_volume_m3 ?? (yearly != null ? yearly / 365 : null);
  return { yearly: typeof yearly === "number" && Number.isFinite(yearly) ? yearly : null, daily };
}

function resolvePermitDuration(app: PermitApplication, fallback = 5): number {
  const notes = resolveNotes(app);

  // Priority 1: Assessor explicit override — always highest.
  const adj = notes?._assessorAdjustments?.permitLengthYears;
  if (typeof adj === "number" && adj >= 1 && adj <= 15) return adj;

  const appType = String((app as any).application_type ?? "").toLowerCase();
  const isTransferLike =
    appType === "transfer" || appType === "renewal" || appType === "modification" ||
    notes?.isTransfer === true || notes?.isRenewal === true || notes?.isModification === true;

  if (isTransferLike) {
    // Priority 2: Original permit dates stored in transferFormData.
    // Dates may be ISO (YYYY-MM-DD) or US MM/DD/YYYY from the date picker.
    const parseTfDate = (s: unknown): Date | null => {
      if (typeof s !== "string" || !s.trim()) return null;
      const t = s.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      const mm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mm) {
        const d = new Date(`${mm[3]}-${mm[1].padStart(2,"0")}-${mm[2].padStart(2,"0")}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    };
    const expiry = parseTfDate(notes?.transferFormData?.expirationDate);
    const issue  = parseTfDate(notes?.transferFormData?.effectiveDate);
    if (expiry) {
      const isRenewal = appType === "renewal" || notes?.isRenewal === true;
      if (isRenewal && issue) {
        // Renewal: inherit the original permit's total duration (expiry − issue).
        const totalYears = Math.round(
          (expiry.getTime() - issue.getTime()) / (365.25 * 24 * 3600 * 1000),
        );
        if (totalYears >= 1 && totalYears <= 15) return totalYears;
      } else if (!isRenewal) {
        // Transfer / modification: remaining validity.
        const remaining = Math.ceil(
          (expiry.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000),
        );
        if (remaining >= 1 && remaining <= 15) return remaining;
      }
    }
    // For DB-permit renewals/modifications, the route fetches original permit
    // dates and passes the computed years via permitValidityYears.
    return fallback;
  }

  // New applications: use the applicant's requested duration, then fallback.
  if (typeof app.proposed_duration_years === "number" && app.proposed_duration_years >= 1) return app.proposed_duration_years;
  return fallback;
}

function resolvePermitTitleNumber(permitNumber: string, headerYear: number): string {
  const n = permitNumber.trim();
  if (!n) return `N/A/RWB/${headerYear}`;
  // If the number already contains a slash it is fully formed (e.g. "000025/RWB/2026"
  // or a legacy ministry number like "0025/MINIRENA/IWRM/2015") — return as-is.
  if (n.includes('/')) return n;
  return `${n}/RWB/${headerYear}`;
}

function resolveOrgAddress(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;

  // For transfer applications use the transferee's office address from the form.
  if (isTransfer && tfd) {
    const sector   = (tfd.transfereeAddressSector   as string | undefined)?.trim() ?? "";
    const district = (tfd.transfereeAddressDistrict as string | undefined)?.trim() ?? "";
    const province = (tfd.transfereeAddressProvince as string | undefined)?.trim() ?? "";
    const parts = [
      sector   ? `${sector} Sector`   : null,
      district ? `${district} District` : null,
      province ? (province.toLowerCase() === "kigali" ? "City OF Kigali" : `${province} Province`) : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }

  const parts = [
    (notes?.officeSector as string)?.trim() ? `${notes!.officeSector} Sector` : null,
    (notes?.officeDistrict as string)?.trim() ? `${notes!.officeDistrict} District` : null,
    (notes?.officeProvince as string)?.trim()
      ? (notes!.officeProvince as string).toLowerCase() === "kigali"
        ? "City OF Kigali"
        : `${notes!.officeProvince} Province`
      : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return app.applicant?.company_address?.trim() || "N/A";
}

function resolveOrgRep(app: PermitApplication): { name: string; title: string } {
  const notes = resolveNotes(app);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;

  // For transfer applications use the transferee's representative from the form.
  if (isTransfer && tfd) {
    const repName  = (tfd.transfereeRepresentativeName  as string | undefined)?.trim() ?? "";
    const repTitle = ((tfd.transfereeRepresentativePosition as string | undefined)?.trim()
                  || (tfd.transfereeTitlePosition as string | undefined)?.trim()) ?? "";
    if (repName) return { name: repName, title: repTitle || "Representative" };
  }

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
  // Fallback: transferFormData for permit-registry transfers (preserves original unit).
  const notes = resolveNotes(app);
  const tfData = notes?.transferFormData;
  if (tfData) {
    const tfVal = tfData.waterAllowance != null ? parseFloat(String(tfData.waterAllowance)) : NaN;
    const tfUnit = String(tfData.allowanceUnit ?? "").trim();
    if (Number.isFinite(tfVal) && tfVal > 0) return `${fmtNum(tfVal)} ${tfUnit || "M3/year"}`;
  }
  return "N/A";
}

// ── Kinyarwanda helpers (ported from lib/pdf-generator.ts, used by
//    the abstraction_organization second page) ──────────────────────────

function formatProvinceOrCityOfKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : `${provinceRaw} Province`;
}

function formatIntaraOrUmujyiWaKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "Umujyi wa Kigali" : `Intara ya ${provinceRaw}`;
}

function getActivityLabelKinyarwanda(activity: string): string {
  const activityLabels: Record<string, string> = {
    irrigation: "kuhira",
    domestic: "gukoresha mu rugo",
    industrial: "inganda",
    livestock: "ubworozi",
    fish_farming_ponds: "ubworozi bw'amafi",
    fish_farming_lakes: "ubworozi bw'amafi",
    aquaculture: "ubworozi bw'amafi",
    electricity_generation: "kubyaza amashanyarazi amazi",
    hydropower_source: "kubyaza amashanyarazi amazi",
    mining: "ubucukuzi bw'amabuye y'agaciro",
    recreation_activities: "imyidagaduro",
    water_supply: "gutanga amazi",
    municipal_supply: "gutanga amazi",
    other: "ibindi",
  };
  return activityLabels[activity] || activity.replace(/[_-]/g, " ");
}

function resolveActivitiesKinyarwanda(app: PermitApplication): string {
  const raw = app.intended_activities;
  let acts: string[] = [];
  if (Array.isArray(raw)) {
    acts = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) acts = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      acts = [raw.trim()];
    }
  }
  if (!acts.length) {
    const purpose = typeof app.water_purpose === "string" ? app.water_purpose.trim() : "";
    if (purpose) return getActivityLabelKinyarwanda(purpose);
    return "N/A";
  }
  return acts.map(getActivityLabelKinyarwanda).join(", ");
}

function resolveKinyarwandaSystemType(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const n = raw.toLowerCase();
  if (!n) return "GUKORESHA";
  if (n.includes("pump")) return "GUPOMPA";
  if (n.includes("grav")) return "GUKORESHA";
  if (n.includes("diversion") || n === "diversion_channel") return "gukoresha umuyoboro w'amazi";
  if (n.includes("dam") || n.includes("reservoir")) return "gukoresha ikidendezi";
  if (n.includes("borehole")) return "gukoresha iriba ryatobowe";
  if (n.includes("spring")) return "gufata amazi y'isoko";
  if (n.includes("hand") || (n.includes("dug") && n.includes("well"))) return "gukoresha iriba ryacukuwe";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GUKORESHA";
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
  const titleH = doc.heightOfString(title, { width: maxW, align: "center" });
  doc.text(title, marginX, yPos, { width: maxW, align: "center" });
  const lineY = yPos + titleH + 4;
  doc.moveTo(marginX, lineY).lineTo(marginX + maxW, lineY).lineWidth(0.5).stroke("#000");
  return lineY + 8;
}

async function drawQrFooter(doc: PDFKit.PDFDocument, permitNumber: string): Promise<void> {
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
    "Scan to verify. This digital permit is only valid if the information on it matches the water use permit registry.",
    textX, textY, { width: textW, align: "left" },
  );
  doc.restore();
}

/** Slim "DRAFT — NOT YET ISSUED" strip pinned just above the page-number footer. */
function drawPreviewBanner(doc: PDFKit.PDFDocument): void {
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
  doc.text("DRAFT — NOT YET ISSUED", marginX, bannerY + 4.5 * PT, { width: bannerW, align: "center" });
  doc.restore();
}

/** Single centered closing line that replaces the legacy signature/name/role block. */
function drawClosingLine(doc: PDFKit.PDFDocument, yPos: number): number {
  const pw = pageWidth(doc);
  const marginX = 24 * PT;
  const maxW = pw - marginX * 2;
  doc.font(FONT_BOLD).fontSize(11).fillColor("#000000");
  doc.text("Director General of RWB / Umuyobozi Mukuru wa RWB", marginX, yPos, {
    width: maxW,
    align: "center",
  });
  return yPos + 16;
}

/** Draws a faint diagonal "DRAFT" across the page — currently unused (kept for future re-use). */
function drawDraftOverlay(doc: PDFKit.PDFDocument): void {
  const pw = pageWidth(doc);
  const ph = pageHeight(doc);
  doc.save();
  doc.translate(pw / 2, ph / 2);
  doc.rotate(-45);
  doc.font(FONT_BOLD).fontSize(72).fillColor("#dc2626").opacity(0.06);
  doc.text("DRAFT", -150, -40, { width: 300, align: "center" });
  doc.restore();
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

  const doc = createDoc();

  await drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = pageWidth(doc) - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font(FONT_BOLD).fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const name = resolveApplicantName(app);
  const idNum = resolveIdNumber(app);
  const acts = resolveActivities(app);
  const area = resolveArea(app);
  const areaStr = area != null ? `${fmtNum(area)} Hectare` : "N/A Hectare";
  const lake = resolveLakeName(app);
  const loc = resolveAdminLocation(app);
  const prov = fmtProvince(loc.province);

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
    `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to carry out ${acts} on the surface area of ${areaStr} (Concession area) in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov} as shown on the attached map. This permit applies for activities conducted solely within the water body.`,
    `This water use permit is valid from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 30) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }

  y += 8;
  drawClosingLine(doc, y);

  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }

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

  const doc = createDoc();
  await drawWatermark(doc);
  drawLogo(doc);
  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = pageWidth(doc) - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font(FONT_BOLD).fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const name = resolveApplicantName(app);
  const idNum = resolveIdNumber(app);
  const wsName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const sysType = resolveSystemType(app);
  const vols = resolveVolumes(app);
  const yearlyStr = vols.yearly != null ? `${fmtNum(vols.yearly)} m³/year` : "N/A m³/year";
  const acts = resolveActivities(app);

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,`,
    `\u201C${name}\u201D, with ID Number: ${idNum}, is authorized to abstract water from ${wsName} located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysType} with a flow rate of ${yearlyStr}. Water abstracted will be used for ${acts}.`,
    `This water use permit is valid from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 30) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 8;
  drawClosingLine(doc, y);

  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }
  return docToBuffer(doc);
}

async function drawKinyarwandaOrgAbstractionPage(
  doc: PDFKit.PDFDocument,
  opts: PermitRenderOpts,
  permitTitleLine: string,
  issueDate: Date,
  expiryDate: Date,
  addNewPage = true,
): Promise<void> {
  const { application: app } = opts;

  if (addNewPage) doc.addPage();
  await drawWatermark(doc);
  const logoY = drawLogo(doc);
  drawTitle(doc, `URUHUSHYA RWO GUKORESHA AMAZI N° ${permitTitleLine}`, logoY);

  const notes = resolveNotes(app) || {};
  const orgName = resolveApplicantName(app);
  const rep = resolveOrgRep(app);
  const officeSector =
    typeof notes.officeSector === "string" && notes.officeSector.trim()
      ? notes.officeSector.trim()
      : "N/A";
  const officeDistrict =
    typeof notes.officeDistrict === "string" && notes.officeDistrict.trim()
      ? notes.officeDistrict.trim()
      : "N/A";
  const officeProvinceRaw =
    typeof notes.officeProvince === "string" ? notes.officeProvince.trim() : "";

  const waterSourceName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const systemTypeRw = resolveKinyarwandaSystemType(app);
  const activitiesRw = resolveActivitiesKinyarwanda(app);
  const flowRate = resolveFlowRate(app);

  const paraRw2 =
    "Hashingiwe ku Itegeko N° 49/2018 ryo ku wa 13/08/2018 rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,";

  const paraRw3 =
    `"${orgName}" ifite ibiro biherereye mu Murenge wa ${officeSector}, Akarere ka ${officeDistrict}, ${formatIntaraOrUmujyiWaKigali(officeProvinceRaw)}; ` +
    `ihagarariwe na ${rep.name} "${rep.title}", yemerewe ${systemTypeRw} amazi angana na ${flowRate}, ` +
    `ava ku ${waterSourceName} iherereye mu ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
    `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, ` +
    `Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}. Aya mazi yemerewe gukoreshwa mu ${activitiesRw}.`;

  const paraRw4 =
    `Uru ruhushya rufite agaciro kuva ${fmtDMY(issueDate)} kugeza ${fmtDMY(expiryDate)}.`;

  const paraRw5 =
    "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.";

  doc.font(FONT_REGULAR).fontSize(11).fillColor("#000");
  const leftX = 50;
  const maxWidth = doc.page.width - leftX * 2;

  let y = logoY + 30;
  for (const p of [paraRw2, paraRw3, paraRw4, paraRw5]) {
    doc.text(p, leftX, y, { width: maxWidth, align: "left" });
    y = doc.y + 8;
  }

  // Signature line — left side: title; right side: "Bikorewe i Kigali, kuwa …"
  const sigY = Math.max(y + 24, doc.page.height - 140);
  doc.text("Umuyobozi Mukuru wa RWB", leftX, sigY);
  doc.text(`Bikorewe i Kigali, kuwa ${fmtDMY(issueDate)}`, leftX, sigY, {
    width: maxWidth,
    align: "right",
  });
}

async function renderAbstractionOrganization(opts: PermitRenderOpts): Promise<Buffer> {
  const { application: app, permitNumber, isModified } = opts;
  const issueDate = opts.issuedDate ?? new Date();
  const expiryDate =
    opts.expiryDate ??
    addYearsSafe(new Date(issueDate), resolvePermitDuration(app, opts.permitValidityYears));

  const doc = createDoc();
  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  await drawWatermark(doc);
  const logoBottomY = drawLogo(doc);
  const title = `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° ${titleNum}`;
  let y = drawTitle(doc, title, logoBottomY);

  if (isModified) {
    doc.save();
    const bx = pageWidth(doc) - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font(FONT_BOLD).fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 1.8;
  const paraGap = 6;

  const orgName = resolveApplicantName(app);
  const officeAddr = resolveOrgAddress(app);
  const rep = resolveOrgRep(app);
  const wsName = resolveWaterSourceName(app);
  const loc = resolveAdminLocation(app);
  const { lat, lng } = resolveLatLng(app);
  const sysLabel = resolveEnglishSystemLabel(app);
  const flowRate = resolveFlowRate(app);
  const acts = resolveActivities(app);
  const actsRw = resolveActivitiesKinyarwanda(app);
  const provLabel = loc.province.toLowerCase() === "kigali" ? "City OF Kigali" : `${loc.province} Province`;
  const notes = resolveNotes(app) || {};
  const officeSector =
    typeof notes.officeSector === "string" && notes.officeSector.trim()
      ? notes.officeSector.trim()
      : "N/A";
  const officeDistrict =
    typeof notes.officeDistrict === "string" && notes.officeDistrict.trim()
      ? notes.officeDistrict.trim()
      : "N/A";
  const officeProvinceRaw =
    typeof notes.officeProvince === "string" ? notes.officeProvince.trim() : "";
  const systemTypeRw = resolveKinyarwandaSystemType(app);

  const englishParagraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,`,
    `\u201C${orgName}\u201D, represented by ${rep.name} \u201C${rep.title}\u201D, is authorized to abstract water from ${wsName} located in ${provLabel}, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, by a ${sysLabel} with flow rate ${flowRate}. Water will be used for ${acts}.`,
    `This water use permit is valid from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.`,
  ];
  const rwParagraphs = [
    "Hashingiwe ku Itegeko N° 49/2018 ryo ku wa 13/08/2018 rigena imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda,",
    `"${orgName}" ihagarariwe na ${rep.name} "${rep.title}", yemerewe ${systemTypeRw} amazi angana na ${flowRate}, ` +
      `ava ku ${wsName} iherereye mu ${formatIntaraOrUmujyiWaKigali(loc.province)}, Akarere ka ${loc.district}, ` +
      `Umurenge wa ${loc.sector}, Akagari ka ${loc.cell}, Umudugudu wa ${loc.village} kuri Latitide (Latitude): ${lat}${lat !== "N/A" ? "°" : ""}, ` +
      `Lonjitide (Longitude): ${lng}${lng !== "N/A" ? "°" : ""}. Aya mazi yemerewe gukoreshwa mu ${actsRw}.`,
    `Uru ruhushya rufite agaciro kuva ${fmtDMY(issueDate)} kugeza ${fmtDMY(expiryDate)}.`,
    "Uretse ibiteganywa n'Itegeko ryavuzwe haruguru, uru ruhushya kandi rugengwa n'ibikubiye mu masezerano ari ku mugereka.",
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

  if (y > contentBottomY(doc, opts.skipQr) - 24) {
    doc.addPage();
    await drawWatermark(doc);
    y = 30 * PT;
  }
  y += 6;
  drawClosingLine(doc, y);

  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }
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

  const doc = createDoc();
  await drawWatermark(doc);
  drawLogo(doc);

  const headerYear = issueDate.getFullYear();
  const titleNum = resolvePermitTitleNumber(permitNumber, headerYear);
  let y = drawTitle(doc, `WATER USE PERMIT N° ${titleNum}`, 49 * PT);

  if (isModified) {
    doc.save();
    const bx = pageWidth(doc) - 60 * PT;
    doc.roundedRect(bx, 4 * PT, 52 * PT, 10 * PT, 4).fill("#b45309");
    doc.font(FONT_BOLD).fontSize(8).fillColor("#ffffff")
      .text("MODIFIED PERMIT", bx, 6.5 * PT, { width: 52 * PT, align: "center" });
    doc.restore();
  }

  const leftX = 20 * PT;
  const maxW = pageWidth(doc) - leftX * 2;
  const fontSize = 11;
  const lineGap = 2.0;
  const paraGap = 7;

  const orgName = resolveApplicantName(app);
  const rep = resolveOrgRep(app);
  const acts = resolveActivities(app);
  const area = resolveArea(app);
  const areaStr = area != null ? `${fmtNum(area)} hectares` : "N/A hectares";
  const lake = resolveLakeName(app);
  const loc = resolveAdminLocation(app);
  const prov = fmtProvince(loc.province);

  const notes = resolveNotes(app);
  const waterSourceSector =
    typeof notes?.waterSourceSector === "string" ? notes.waterSourceSector.trim() : "";
  const waterSourceDistrict =
    typeof notes?.waterSourceDistrict === "string" ? notes.waterSourceDistrict.trim() : "";
  const waterSourceProvince =
    typeof notes?.waterSourceProvince === "string" ? notes.waterSourceProvince.trim() : "";
  const wsLocParts = [
    waterSourceSector ? `${waterSourceSector} Sector` : null,
    waterSourceDistrict ? `${waterSourceDistrict} District` : null,
    waterSourceProvince
      ? waterSourceProvince.toLowerCase() === "kigali"
        ? "City OF Kigali"
        : `${waterSourceProvince} Province`
      : null,
  ].filter(Boolean).join(", ") || "N/A";

  const paragraphs = [
    `Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,`,
    `\u201C${orgName}\u201D, with its water source location as follows: ${wsLocParts}; represented by ${rep.name}; is authorized to carry out ${acts} on the surface area of ${areaStr} in ${lake}, on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${prov}, as shown on the attached map. This permit applies to activities conducted solely within the water body.`,
    `This water use permit is valid from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`,
    `In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.`,
  ];

  y += 8;
  doc.font(FONT_REGULAR).fontSize(fontSize).fillColor("#000000");
  for (const p of paragraphs) {
    const h = doc.heightOfString(p, { width: maxW, lineGap });
    if (y + h > contentBottomY(doc, opts.skipQr)) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
    doc.text(p, leftX, y, { width: maxW, lineGap });
    y += h + paraGap;
  }

  if (y > contentBottomY(doc, opts.skipQr) - 30) { doc.addPage(); await drawWatermark(doc); y = 30 * PT; }
  y += 8;
  drawClosingLine(doc, y);

  if (opts.skipQr) { drawPreviewBanner(doc); } else { await drawQrFooter(doc, permitNumber); }
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    drawPageFooter(doc, permitNumber, i + 1, total);
  }
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
