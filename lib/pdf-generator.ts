import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { splitContractSectionsByLanguage } from "@/lib/contract-terms";

const WATERMARK_IMAGE_PATH = "/assets/rwanda_logo.png";
const PERMIT_HEADER_LOGO_PATH = "/assets/rwanda_water_board_Logo.png";
const PERMIT_FONT_FAMILY = "times";

/**
 * Pre-load the watermark image and return a Promise that resolves to the data URL.
 * This is cached for performance.
 */
let cachedWatermarkDataUrl: string | null = null;
let cachedPermitHeaderLogoDataUrl: string | null = null;
const qrDataUrlCache = new Map<string, string>();

async function fetchImageAsDataUrl(imagePath: string): Promise<string | null> {
  // Server-side (Node.js): read directly from the filesystem
  if (typeof window === "undefined") {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const filePath = path.join(process.cwd(), "public", imagePath);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(imagePath).replace(".", "").toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  // Browser: fetch from origin
  try {
    const url = `${window.location.origin}${imagePath}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadPermitHeaderLogo(): Promise<string | null> {
  if (cachedPermitHeaderLogoDataUrl) return cachedPermitHeaderLogoDataUrl;
  const dataUrl = await fetchImageAsDataUrl(PERMIT_HEADER_LOGO_PATH);
  if (dataUrl) cachedPermitHeaderLogoDataUrl = dataUrl;
  return dataUrl;
}

async function drawPermitPageHeader(doc: jsPDF, title: string): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const logoDataUrl = await loadPermitHeaderLogo();

  if (logoDataUrl) {
    const logoW = 72;
    const logoH = 30;
    doc.addImage(logoDataUrl, "PNG", centerX - logoW / 2, 8, logoW, logoH, undefined, "NONE");
  } else {
    doc.setFont(PERMIT_FONT_FAMILY, "bold");
    doc.setFontSize(13);
    doc.text("Rwanda Water Resources Board", centerX, 23, { align: "center" });
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont(PERMIT_FONT_FAMILY, "bold");
  doc.setFontSize(12);
  doc.text(title, centerX, 49, { align: "center" });

  const titleWidth = doc.getTextWidth(title);
  doc.setLineWidth(0.25);
  doc.line(centerX - titleWidth / 2, 50.5, centerX + titleWidth / 2, 50.5);

  doc.setFont(PERMIT_FONT_FAMILY, "normal");
  doc.setFontSize(11);
}

async function loadWatermarkImage(): Promise<string | null> {
  if (cachedWatermarkDataUrl) return cachedWatermarkDataUrl;
  const dataUrl = await fetchImageAsDataUrl(WATERMARK_IMAGE_PATH);
  if (dataUrl) cachedWatermarkDataUrl = dataUrl;
  return dataUrl;
}

/**
 * Draw the watermark on the CURRENT page using a pre-loaded data URL.
 * Must be called BEFORE any text/content so it renders behind everything.
 */
function stampWatermark(doc: jsPDF, dataUrl: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const wmW = 155;
  const wmH = 155;
  const x = (pageWidth - wmW) / 2;
  const y = (pageHeight - wmH) / 2 + 12;

  try {
    doc.saveGraphicsState();
    doc.setGState(doc.GState({ opacity: 0.12 }));
    doc.addImage(dataUrl, "PNG", x, y, wmW, wmH, undefined, "NONE");
    doc.restoreGraphicsState();
  } catch {
    try {
      doc.addImage(dataUrl, "PNG", x, y, wmW, wmH, undefined, "NONE");
    } catch (err) {
      console.warn("Could not add watermark to PDF:", err);
    }
  }
}

/**
 * Draw a "MODIFIED PERMIT" badge in the top-right corner of page 1.
 * This is called only when the permit has been modified at least once.
 * The badge is clearly visible but does not obstruct the main content.
 */
function drawModifiedBadge(doc: jsPDF): void {
  // Always draw on page 1
  doc.setPage(1);

  const pageWidth = doc.internal.pageSize.getWidth();

  // Badge dimensions & position – top-right
  const badgeW = 52;
  const badgeH = 10;
  const badgeX = pageWidth - badgeW - 8; // 8mm from the right edge
  const badgeY = 4;

  // Rounded rectangle background – dark orange/amber
  doc.setFillColor(180, 83, 9); // amber-700
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, "F");

  // Badge text — plain text (no emoji) for PDF font compatibility
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("MODIFIED PERMIT", badgeX + badgeW / 2, badgeY + badgeH / 2 + 1, {
    align: "center",
  });

  // Reset text color back to black
  doc.setTextColor(0, 0, 0);
}

type Application = {
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
  location_description?: string;
  project_description?: string;
  project_value?: number;
  water_taking_method?: string;
  water_measuring_method?: string;
  storage_facilities?: string;
  return_flow_description?: string;
  environmental_assessment?: string;
  mitigation_actions?: string;
  internal_notes?: string;
  max_daily_volume_m3?: number;
  max_yearly_volume_m3?: number;
  concession_area?: number;
  // Assessor recommended fields - take precedence over requested values
  proposed_duration_years?: number;
  assessor_recommended_volume_m3?: number;
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
};

// Production URL for QR codes - ALWAYS use production URL since QR codes are printed
// and scanned externally by phones that cannot access localhost
const PRODUCTION_URL = "https://waterpermit.rwb.rw";

/**
 * Build the permit verification URL for QR codes.
 * IMPORTANT: Always uses production URL because QR codes on printed permits
 * will be scanned by phones that cannot access localhost or internal servers.
 */
function buildPermitVerificationUrl(permitNumber: string): string {
  // Clean the permit number - remove extra whitespace
  const cleanPermitNumber = permitNumber.trim();
  // Always use production URL for QR codes - they'll be printed and scanned externally
  return `${PRODUCTION_URL}/permit/view/${encodeURIComponent(cleanPermitNumber)}`;
}

/**
 * Build the hosted Terms & Conditions (Contract) URL for QR codes printed on the contract.
 * IMPORTANT: Always uses production URL because QR codes on printed contracts
 * will be scanned by phones that cannot access localhost or internal servers.
 */
function buildContractTermsHostedUrl(contractNumber: string): string {
  const raw = (contractNumber ?? "").trim();
  // Contract PDFs currently pass contractNumber as permit_number without the "WP-" prefix.
  // We normalize to a permit number so the hosted route can look up the right application context.
  const permitNumber = raw.toUpperCase().startsWith("WP-") ? raw : `WP-${raw}`;
  return `${PRODUCTION_URL}/contract/terms/${encodeURIComponent(permitNumber)}`;
}

type PermitVariant =
  | "abstraction_individual"
  | "abstraction_organization"
  | "concession_individual"
  | "concession_organization"
  | "fallback_generic";

function safeJsonParseObject(s: unknown): Record<string, any> | null {
  if (typeof s !== "string" || !s.trim()) return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}

function getInternalNotes(application: Application): Record<string, any> | null {
  return safeJsonParseObject(application.internal_notes);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateDMY(d: Date): string {
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatNumber(n: number, opts?: { maxDecimals?: number }): string {
  const maxDecimals = opts?.maxDecimals ?? 2;
  const isInt = Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: isInt ? 0 : maxDecimals,
    minimumFractionDigits: 0,
  }).format(n);
}

function normalizeActivities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  // Supabase JSONB can arrive already parsed as array; but sometimes it may be a JSON string.
  if (typeof raw === "string") {
    const parsed = safeJsonParseObject(raw);
    if (parsed) return [];
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return [];
}

function getIntendedActivities(application: Application): string[] {
  const direct = normalizeActivities(application.intended_activities);
  if (direct.length) return direct;
  const notes = getInternalNotes(application);
  if (!notes) return [];
  const fromNotes = normalizeActivities(notes.intendedActivities);
  if (fromNotes.length) return fromNotes;
  if (typeof notes.transferFormData?.waterPurpose === "string") {
    const tp = notes.transferFormData.waterPurpose.trim();
    if (tp) return [tp];
  }
  return [];
}

// NOTE: concession detection is shared with the UI via `lib/permit-variant.ts`.

function getActivityLabel(activity: string): string {
  const activityLabels: Record<string, string> = {
    irrigation: "Irrigation",
    water_supply: "Water Supply",
    fish_farming_lakes: "Fish farming in lakes",
    fish_farming_ponds: "Fish farming in ponds",
    industry: "Industry",
    coffee_washing: "Coffee Washing",
    electricity_generation: "Electricity Generation (Hydropower)",
    mining: "Mining",
    construction_of_dam: "Construction of Dam",
    construction_of_infrastructures: "Construction or installation of infrastructure",
    navigation: "Navigation",
    port_construction: "Port Construction",
    recreation_activities: "Recreational Activities",
    gaz_extraction: "Gas Extraction",
    livestock: "Livestock",
    other: "Other",
  };
  return activityLabels[activity] || activity;
}

function formatActivitiesForPermit(application: Application): string {
  const acts = getIntendedActivities(application);
  if (!acts.length) {
    // Fallback for legacy records or environments where intended_activities isn't populated.
    const purpose = typeof application.water_purpose === "string" ? application.water_purpose.trim() : "";
    if (purpose) return getActivityLabel(purpose) || purpose.replaceAll("_", " ");
    const appType = typeof application.application_type === "string" ? application.application_type.trim() : "";
    if (appType) return appType.replaceAll("_", " ");
    return "N/A";
  }
  return acts.map(getActivityLabel).join(", ");
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
    port_construction: "byo kubaka icyambu",
    gaz_extraction: "byo gucukura gaze",
    water_supply: "gutanga amazi",
    municipal_supply: "gutanga amazi",
    other: "ibindi",
  };
  return activityLabels[activity] || getActivityLabel(activity);
}

function formatActivitiesForPermitKinyarwanda(application: Application): string {
  const acts = getIntendedActivities(application);
  if (!acts.length) {
    const purpose = typeof application.water_purpose === "string" ? application.water_purpose.trim() : "";
    if (purpose) return getActivityLabelKinyarwanda(purpose);
    const appType = typeof application.application_type === "string" ? application.application_type.trim() : "";
    if (appType) return getActivityLabelKinyarwanda(appType);
    return "N/A";
  }
  return acts.map(getActivityLabelKinyarwanda).join(", ");
}

function derivePermitTitleNumber(application: Application): string | null {
  const raw = typeof application.application_number === "string" ? application.application_number.trim() : "";
  if (!raw) return null;
  // Expected: RWB-2025-000025 => 000025/RWB/2025
  const m = raw.match(/^RWB-(\d{4})-(\d{1,})$/i);
  if (!m) return null;
  const year = m[1];
  const seq = m[2].padStart(6, "0");
  return `${seq}/RWB/${year}`;
}

function resolvePermitTitleNumber(application: Application, fallbackPermitNumber: string): string {
  return derivePermitTitleNumber(application) || fallbackPermitNumber;
}

function resolvePermitTitleLine(application: Application, permitNumber: string, headerYear: number): string {
  // IMPORTANT:
  // For permit PDFs, the canonical source of truth is the permit's own number from `permits.permit_number`.
  // We must NOT derive/override it from `application.application_number` (modifications/renewals can diverge).
  const normalized = typeof permitNumber === "string" ? permitNumber.trim() : "";
  if (!normalized) return `N/A/RWB/${headerYear}`;
  // If the number already contains a slash it is fully formed (e.g. "000025/RWB/2026"
  // or a legacy ministry number like "0025/MINIRENA/IWRM/2015") — return as-is.
  if (normalized.includes("/")) return normalized;
  // Legacy fallback: bare sequence — append /RWB/<year>.
  return `${normalized}/RWB/${headerYear}`;
}

function parseDateOnlyToLocal(dateLike: unknown): Date | null {
  if (dateLike instanceof Date && Number.isFinite(dateLike.getTime())) return dateLike;
  if (typeof dateLike !== "string") return null;
  const s = dateLike.trim();
  if (!s) return null;
  // Prefer parsing DATE columns from Postgres/Supabase (YYYY-MM-DD) as local dates to avoid TZ shifts.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) return new Date(y, mo - 1, d);
  }
  const parsed = new Date(s);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}


// NOTE: variant selection is shared with the UI via `lib/permit-variant.ts`.

function resolveApplicantName(application: Application): string {
  const notes = getInternalNotes(application);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  if ((application.application_type === "transfer" || notes?.isTransfer === true) && tfd) {
    const n = (tfd.transfereeName as string | undefined)?.trim();
    if (n) return n;
  }
  return application.applicant?.account_type === "individual"
    ? `${application.applicant.first_name ?? ""} ${application.applicant.last_name ?? ""}`.trim() || "N/A"
    : application.applicant?.company_name || "N/A";
}

function resolveOrganizationNameForPermit(application: Application): string {
  const notes = getInternalNotes(application);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = application.application_type === "transfer" || notes?.isTransfer === true;
  if (isTransfer && tfd) {
    const n = (tfd.transfereeName as string | undefined)?.trim();
    if (n) return n;
  }
  const fromNotes = typeof notes?.fullNameApplicant === "string" ? notes.fullNameApplicant.trim() : "";
  if (fromNotes) return fromNotes;
  const fromApplicant = typeof application.applicant?.company_name === "string" ? application.applicant.company_name.trim() : "";
  if (fromApplicant) return fromApplicant;
  return resolveApplicantName(application);
}

function resolveApplicantIdNumber(application: Application): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nationalIdNumber === "string" ? notes.nationalIdNumber.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = typeof application.applicant?.id_number === "string" ? application.applicant.id_number.trim() : "";
  if (fromUser) return fromUser;
  return "N/A";
}

function resolveWaterSourceLocationAddress(application: Application): string {
  const notes = getInternalNotes(application);
  const sector =
    typeof notes?.waterSourceSector === "string" && notes.waterSourceSector.trim()
      ? notes.waterSourceSector.trim()
      : application.sector || "";
  const district =
    typeof notes?.waterSourceDistrict === "string" && notes.waterSourceDistrict.trim()
      ? notes.waterSourceDistrict.trim()
      : application.district || "";
  const provinceRaw =
    typeof notes?.waterSourceProvince === "string" && notes.waterSourceProvince.trim()
      ? notes.waterSourceProvince.trim()
      : application.province || "";

  const provinceLabel =
    provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : `${provinceRaw} Province`;

  const parts = [
    sector ? `${sector} Sector` : null,
    district ? `${district} District` : null,
    provinceRaw ? provinceLabel : null,
  ].filter(Boolean) as string[];

  return parts.length ? parts.join(", ") : "N/A";
}

function resolveOrganizationRegisteredOfficeAddress(application: Application): string {
  const notes = getInternalNotes(application);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = application.application_type === "transfer" || notes?.isTransfer === true;

  // For transfers, use the transferee's office address captured in the form.
  if (isTransfer && tfd) {
    const sector   = (tfd.transfereeAddressSector   as string | undefined)?.trim() ?? "";
    const district = (tfd.transfereeAddressDistrict as string | undefined)?.trim() ?? "";
    const province = (tfd.transfereeAddressProvince as string | undefined)?.trim() ?? "";
    const parts = [
      sector   ? `${sector} Sector`   : null,
      district ? `${district} District` : null,
      province ? (province.toLowerCase() === "kigali" ? "City OF Kigali" : `${province} Province`) : null,
    ].filter(Boolean) as string[];
    if (parts.length) return parts.join(", ");
  }

  const sector = typeof notes?.officeSector === "string" ? notes.officeSector.trim() : "";
  const district = typeof notes?.officeDistrict === "string" ? notes.officeDistrict.trim() : "";
  const provinceRaw = typeof notes?.officeProvince === "string" ? notes.officeProvince.trim() : "";
  const provinceLabel =
    provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : provinceRaw ? `${provinceRaw} Province` : "";
  const parts = [
    sector ? `${sector} Sector` : null,
    district ? `${district} District` : null,
    provinceLabel || null,
  ].filter(Boolean) as string[];

  if (parts.length) return parts.join(", ");

  const fromApplicant =
    typeof application.applicant?.company_address === "string" ? application.applicant.company_address.trim() : "";
  return fromApplicant || "N/A";
}

function resolveOrganizationRepresentative(application: Application): { name: string; title: string } {
  const notes = getInternalNotes(application);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = application.application_type === "transfer" || notes?.isTransfer === true;

  // For transfers, use the transferee's representative captured in the form.
  if (isTransfer && tfd) {
    const repName  = (tfd.transfereeRepresentativeName  as string | undefined)?.trim() ?? "";
    const repTitle = ((tfd.transfereeRepresentativePosition as string | undefined)?.trim()
                  || (tfd.transfereeTitlePosition as string | undefined)?.trim()) ?? "";
    if (repName) return { name: repName, title: repTitle || "Representative" };
  }

  const name = typeof notes?.nameRepresentative === "string" ? notes.nameRepresentative.trim() : "";
  const fallbackName =
    `${application.applicant?.first_name ?? ""} ${application.applicant?.last_name ?? ""}`.trim() || "N/A";
  const title =
    typeof notes?.representativeTitle === "string"
      ? notes.representativeTitle.trim()
      : typeof notes?.representativePosition === "string"
        ? notes.representativePosition.trim()
        : "";
  return { name: name || fallbackName, title: title || "Representative" };
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function resolveConcessionAreaHectares(application: Application): number | null {
  const notes = getInternalNotes(application);
  const assessorArea = parsePositiveNumber(notes?._assessorAdjustments?.recommendedVolumeM3);
  if (assessorArea != null) return assessorArea;
  const dbConcessionArea = parsePositiveNumber(application.concession_area);
  if (dbConcessionArea != null) return dbConcessionArea;
  const notesConcessionArea = parsePositiveNumber(notes?.concessionArea);
  if (notesConcessionArea != null) return notesConcessionArea;
  const fishLakeArea = parsePositiveNumber(notes?.fishLakeAreaHectares);
  if (fishLakeArea != null) return fishLakeArea;
  // Renewal form stores concession area under permitDetails
  const pdArea = parsePositiveNumber(notes?.permitDetails?.concessionArea);
  if (pdArea != null) return pdArea;
  return null;
}

function resolveLakeNameForPermit(application: Application): string {
  const name = resolveWaterSourceName(application);
  if (!name || name === "N/A") return "N/A";
  return /\blake\b/i.test(name) ? name : `${name} Lake`;
}

function formatProvinceOrKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "CITY OF KIGALI" : `${provinceRaw} Province`;
}

function formatProvinceOrCityOfKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : `${provinceRaw} Province`;
}

function formatIntaraOrUmujyiWaKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "Umujyi wa Kigali" : `Intara ya ${provinceRaw}`;
}

function resolveWaterSourceName(application: Application): string {
  if (typeof (application as any).water_body_name === "string" && (application as any).water_body_name.trim()) {
    return (application as any).water_body_name.trim();
  }
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nameSourceWater === "string" ? notes.nameSourceWater.trim() : "";
  if (fromNotes) return fromNotes;
  // Final fallback: use water_source enum-ish value
  return (application.water_source || "N/A").replaceAll("_", " ").toUpperCase();
}

function resolveWaterSourceAdminLocation(application: Application): {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
} {
  const notes = getInternalNotes(application);
  const province = typeof notes?.waterSourceProvince === "string" && notes.waterSourceProvince.trim()
    ? notes.waterSourceProvince.trim()
    : application.province || "N/A";
  const district = typeof notes?.waterSourceDistrict === "string" && notes.waterSourceDistrict.trim()
    ? notes.waterSourceDistrict.trim()
    : application.district || "N/A";
  const sector = typeof notes?.waterSourceSector === "string" && notes.waterSourceSector.trim()
    ? notes.waterSourceSector.trim()
    : application.sector || "N/A";
  const cell = typeof notes?.waterSourceCell === "string" && notes.waterSourceCell.trim()
    ? notes.waterSourceCell.trim()
    : application.cell || "N/A";
  const village = typeof notes?.waterSourceVillage === "string" && notes.waterSourceVillage.trim()
    ? notes.waterSourceVillage.trim()
    : application.village || "N/A";
  return { province, district, sector, cell, village };
}

function resolveLatLng(application: Application): { lat: string; lng: string } {
  const notes = getInternalNotes(application);
  const tryPair = (latVal: unknown, lngVal: unknown): { lat: string; lng: string } | null => {
    const latNum =
      typeof latVal === "number"
        ? latVal
        : typeof latVal === "string" && latVal.trim()
          ? Number.parseFloat(latVal.trim())
          : NaN;
    const lngNum =
      typeof lngVal === "number"
        ? lngVal
        : typeof lngVal === "string" && lngVal.trim()
          ? Number.parseFloat(lngVal.trim())
          : NaN;
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: latNum.toFixed(6), lng: lngNum.toFixed(6) };
    }
    return null;
  };

  const assessorAdjustments = notes?._assessorAdjustments;
  const adjustedPair = tryPair(
    assessorAdjustments?.waterSourceLatitude,
    assessorAdjustments?.waterSourceLongitude,
  );
  if (adjustedPair) return adjustedPair;

  const notesPair = tryPair(notes?.waterSourceLatitude, notes?.waterSourceLongitude);
  if (notesPair) return notesPair;

  // Fallback: if polygons exist in notes, use the first point of the first polygon.
  const adjustedPolys = Array.isArray(assessorAdjustments?.waterSourcePolygonPoints)
    ? [[...(assessorAdjustments?.waterSourcePolygonPoints as any[])]]
    : null;
  const polys = adjustedPolys ?? (Array.isArray(notes?.waterSourcePolygons) ? (notes?.waterSourcePolygons as any[]) : null);
  const first = polys?.[0]?.[0];
  if (first) {
    const lat = typeof first.latitude === "string" ? Number.parseFloat(first.latitude) : Number(first.latitude);
    const lng = typeof first.longitude === "string" ? Number.parseFloat(first.longitude) : Number(first.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
    }
  }

  // Fallback: if coordinates stored as GeoJSON Point: [lng, lat]
  const coords = (application as any)?.coordinates;
  if (coords && typeof coords === "object" && coords.type === "Point" && Array.isArray(coords.coordinates)) {
    const [lng, lat] = coords.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: Number(lat).toFixed(6), lng: Number(lng).toFixed(6) };
    }
  }

  // If we stored a polygon/multipolygon, use the first coordinate as a representative point.
  // GeoJSON order is [lng, lat].
  if (coords && typeof coords === "object" && coords.type === "Polygon" && Array.isArray(coords.coordinates)) {
    const first = coords.coordinates?.[0]?.[0];
    if (Array.isArray(first) && first.length >= 2) {
      const [lng, lat] = first;
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        return { lat: latN.toFixed(6), lng: lngN.toFixed(6) };
      }
    }
  }
  if (coords && typeof coords === "object" && coords.type === "MultiPolygon" && Array.isArray(coords.coordinates)) {
    const first = coords.coordinates?.[0]?.[0]?.[0];
    if (Array.isArray(first) && first.length >= 2) {
      const [lng, lat] = first;
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        return { lat: latN.toFixed(6), lng: lngN.toFixed(6) };
      }
    }
  }

  return { lat: "N/A", lng: "N/A" };
}

function resolveAbstractionMethodRaw(application: Application): string {
  // Filter sentinel values stored when waterAbstractionDetails was empty.
  const meaningful = (v: unknown): string =>
    typeof v === "string" &&
    v.trim() !== "" &&
    !/^not[_ ]specified$/i.test(v.trim()) &&
    v.trim().toLowerCase() !== "n/a"
      ? v.trim()
      : "";
  const fromCol = meaningful(application.water_taking_method);
  if (fromCol) return fromCol;
  const notes = getInternalNotes(application);
  const fromNotes = meaningful(notes?.waterAbstractionDetails?.[0]?.abstractionMethod);
  if (fromNotes) return fromNotes;
  const fromTransfer = meaningful(notes?.transferFormData?.abstractionMethod);
  return fromTransfer;
}

function resolveSystemType(application: Application): string {
  const raw = resolveAbstractionMethodRaw(application);
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

function resolveEnglishSystemTypeLabel(application: Application): string {
  const raw = resolveAbstractionMethodRaw(application);
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

function resolveKinyarwandaSystemTypeLabel(application: Application): string {
  const raw = resolveAbstractionMethodRaw(application);
  const normalized = raw.toLowerCase();
  if (!normalized) return "GUKORESHA";
  if (normalized.includes("pump")) return "GUPOMPA";
  if (normalized.includes("grav")) return "GUKORESHA";
  if (normalized.includes("diversion") || normalized === "diversion_channel") return "gukoresha umuyoboro w'amazi";
  if (normalized.includes("dam") || normalized.includes("reservoir")) return "gukoresha ikidendezi";
  if (normalized.includes("borehole")) return "gukoresha iriba ryatobowe";
  if (normalized.includes("spring")) return "gufata amazi y'isoko";
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) return "gukoresha iriba ryacukuwe";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GUKORESHA";
}

/**
 * Resolve permit duration, prioritizing assessor recommended value over applicant's request.
 * Returns the number of years for the permit validity.
 */
function resolvePermitDurationYears(application: Application, fallbackYears: number = 5): number {
  const notes = getInternalNotes(application);

  // Priority 1: Assessor recommended duration (from assessment adjustments)
  const assessorAdjustments = notes?._assessorAdjustments;
  if (typeof assessorAdjustments?.permitLengthYears === "number" &&
      Number.isFinite(assessorAdjustments.permitLengthYears) &&
      assessorAdjustments.permitLengthYears >= 1 &&
      assessorAdjustments.permitLengthYears <= 15) {
    return assessorAdjustments.permitLengthYears;
  }

  // Priority 2: proposed_duration_years from the application record (may have been updated by assessor)
  if (typeof application.proposed_duration_years === "number" &&
      Number.isFinite(application.proposed_duration_years) &&
      application.proposed_duration_years >= 1 &&
      application.proposed_duration_years <= 15) {
    return application.proposed_duration_years;
  }

  // Priority 3 (renewals only): compute from original permit dates stored in internal_notes.
  // PermitRenewalForm saves the original permit's issued/expiry dates in permitDetails;
  // when proposed_duration_years isn't set (e.g. older submissions), derive it here.
  const isRenewal =
    (application as any).is_renewal === true ||
    (application as any).application_type?.toLowerCase() === "renewal" ||
    notes?.isRenewal === true;
  if (isRenewal) {
    const parseD = (s: unknown): Date | null => {
      if (typeof s !== "string" || !s.trim()) return null;
      const t = s.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    };
    const origIssue  = parseD(notes?.permitDetails?.issuedDate);
    const origExpiry = parseD(notes?.permitDetails?.expiryDate);
    if (origIssue && origExpiry && origExpiry > origIssue) {
      const years = Math.round(
        (origExpiry.getTime() - origIssue.getTime()) / (365.25 * 24 * 3600 * 1000),
      );
      if (years >= 1 && years <= 15) return years;
    }
  }

  // Priority 4: Fallback to passed value or default
  return fallbackYears;
}

function resolveVolumes(application: Application): { yearly: number | null; daily: number | null } {
  const notes = getInternalNotes(application);

  // Priority 1: Assessor recommended volume (from assessment adjustments)
  const assessorAdjustments = notes?._assessorAdjustments;
  const assessorVolume =
    (typeof assessorAdjustments?.recommendedVolumeM3 === "number" && Number.isFinite(assessorAdjustments.recommendedVolumeM3)
      ? assessorAdjustments.recommendedVolumeM3
      : null) ??
    (typeof application.assessor_recommended_volume_m3 === "number" && Number.isFinite(application.assessor_recommended_volume_m3)
      ? application.assessor_recommended_volume_m3
      : null);

  // Priority 2: Fall back to applicant's requested values if no assessor recommendation
  let yearlyCandidate: number | null =
    assessorVolume ??
    (typeof application.max_yearly_volume_m3 === "number" && Number.isFinite(application.max_yearly_volume_m3)
      ? application.max_yearly_volume_m3
      : null) ??
    (typeof application.estimated_usage_volume === "number" && Number.isFinite(application.estimated_usage_volume)
      ? application.estimated_usage_volume
      : null) ??
    (typeof notes?.waterAbstractionDetails?.[0]?.maxAverageYearly === "number" &&
    Number.isFinite(notes.waterAbstractionDetails[0].maxAverageYearly)
      ? notes.waterAbstractionDetails[0].maxAverageYearly
      : null);

  // Priority 3: Transfer form data fallback (manual permit transfers store allowance in internal_notes)
  if (yearlyCandidate == null) {
    const tfData = notes?.transferFormData;
    const tfVal = tfData?.waterAllowance ? parseFloat(String(tfData.waterAllowance)) : NaN;
    const tfUnit = String(tfData?.allowanceUnit || '').toLowerCase();
    if (Number.isFinite(tfVal) && tfVal > 0) {
      yearlyCandidate = tfUnit.includes('day') ? tfVal * 365 : tfVal;
    }
  }

  const dailyCandidate: number | null =
    (typeof application.max_daily_volume_m3 === "number" && Number.isFinite(application.max_daily_volume_m3)
      ? application.max_daily_volume_m3
      : null) ??
    (typeof notes?.waterSupplyDailyAbstraction === "number" && Number.isFinite(notes.waterSupplyDailyAbstraction)
      ? notes.waterSupplyDailyAbstraction
      : null) ??
    (() => {
      const tfData = notes?.transferFormData;
      const tfVal = tfData?.waterAllowance ? parseFloat(String(tfData.waterAllowance)) : NaN;
      const tfUnit = String(tfData?.allowanceUnit || '').toLowerCase();
      if (Number.isFinite(tfVal) && tfVal > 0 && tfUnit.includes('day')) return tfVal;
      return yearlyCandidate != null ? yearlyCandidate / 365 : null;
    })();

  return { yearly: yearlyCandidate, daily: dailyCandidate };
}

function resolveFlowRateLabel(application: Application): string {
  const vols = resolveVolumes(application);
  if (vols.yearly != null) return `${formatNumber(vols.yearly)} M3/year`;
  if (vols.daily != null) return `${formatNumber(vols.daily)} M3/day`;
  return "N/A";
}

function drawWrappedParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts?: { lineHeight?: number; paragraphSpacing?: number; pageBottomY?: number; newPageY?: number; watermark?: string | null }
): number {
  const lineHeight = opts?.lineHeight ?? 6;
  const paragraphSpacing = opts?.paragraphSpacing ?? 6;
  const pageBottomY = opts?.pageBottomY ?? 250;
  const newPageY = opts?.newPageY ?? 30;
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const blockHeight = lines.length * lineHeight;

  if (y + blockHeight > pageBottomY) {
    doc.addPage();
    if (opts?.watermark) stampWatermark(doc, opts.watermark);
    y = newPageY;
  }

  doc.text(lines, x, y);
  return y + blockHeight + paragraphSpacing;
}

async function qrPngDataUrl(text: string, px: number): Promise<string> {
  const cacheKey = `${text}|${px}`;
  const cached = qrDataUrlCache.get(cacheKey);
  if (cached) return cached;

  // Using qrcode package for reliable QR code generation
  // HIGH error correction level (H) allows up to 30% damage and still be readable
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H', // HIGH - best for printed materials
    width: px,
    margin: 2, // Quiet zone around the QR code
    color: {
      dark: '#000000', // Pure black for maximum contrast
      light: '#ffffff', // Pure white background
    },
  });
  qrDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}

function drawPermitQrFooter(opts: {
  doc: jsPDF;
  permitNumber: string;
}): Promise<void> {
  const { doc, permitNumber } = opts;
  const verifyUrl = buildPermitVerificationUrl(permitNumber);

  // Layout constants (jsPDF default is A4 in mm)
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;

  // Keep clear of existing footer text at y=285 and y=295
  const footerBottomPadding = 14;
  const footerY = pageHeight - 60 - footerBottomPadding; // Adjusted to accommodate disclaimer
  const footerH = 46; // Increased height to accommodate disclaimer
  const footerW = pageWidth - marginX * 2;

  const qrBox = 34;
  const qrPadding = 2.5;
  const qrX = marginX + (footerW - qrBox) / 2;
  const qrY = footerY + 2;
  const qrSize = qrBox - qrPadding * 2;

  // Background container
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(251, 253, 255);
  doc.roundedRect(marginX, footerY, footerW, footerH, 2, 2, "FD");

  // QR "card"
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 2, 2, "FD");

  return qrPngDataUrl(verifyUrl, 512).then((png) => {
    doc.addImage(png, "PNG", qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);
    
    // Add disclaimer text below QR code
    const disclaimerText = "This digital permit is only valid if the information on it is the same as the information as the water use permit registry.";
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("times", "italic");
    const disclaimerY = qrY + qrBox + 4;
    doc.text(disclaimerText, pageWidth / 2, disclaimerY, { align: "center", maxWidth: footerW - 20 });
    doc.setFont("times", "normal");
  });
}

function drawPortalQrFooter(opts: {
  doc: jsPDF;
  url: string;
}): Promise<void> {
  const { doc, url } = opts;

  // Layout constants (jsPDF default is A4 in mm)
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;

  // Keep clear of existing footer text at y=290
  const footerBottomPadding = 14;
  const footerY = pageHeight - 60 - footerBottomPadding;
  const footerH = 52; // a bit taller to allow a larger QR + caption
  const footerW = pageWidth - marginX * 2;

  // Bigger QR improves scan reliability (especially when printed or photographed)
  const qrBox = 40;
  const qrPadding = 2.5;
  const qrX = marginX + (footerW - qrBox) / 2;
  const qrY = footerY + 2;
  const qrSize = qrBox - qrPadding * 2;

  // Background container
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(251, 253, 255);
  doc.roundedRect(marginX, footerY, footerW, footerH, 2, 2, "FD");

  // QR "card"
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 2, 2, "FD");

  // Higher source pixel size keeps edges crisp after jsPDF scaling.
  return qrPngDataUrl(url, 640).then((png) => {
    doc.addImage(png, "PNG", qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);

    // Subtle caption
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("times", "italic");
    doc.text("Scan to view the hosted Terms & Conditions", pageWidth / 2, qrY + qrBox + 6, {
      align: "center",
      maxWidth: footerW - 20,
    });
    doc.setFont("times", "normal");
  });
}


// Field Report Assessment Types
export interface FieldReportAssessment {
  // Technical Feasibility
  technicalFeasibility: boolean | null;
  technicalComments: string;
  siteAccessibility: boolean | null;
  infrastructureAdequacy: boolean | null;
  
  // Environmental Assessment
  environmentalImpactLevel: "low" | "medium" | "high" | null;
  environmentalComments: string;
  mitigationRequired: boolean | null;
  
  // Water Source Assessment
  sourceReliability: boolean | null;
  sourceCapacityAdequate: boolean | null;
  sourceQualityAcceptable: boolean | null;
  waterRightsClear: boolean | null;
  
  // Overall Assessment
  overallRecommendation: "approve" | "reject" | "require_revision" | null;
  conditionsRequired: string;
  overallComments: string;
  
  // Field Visit
  fieldVisitRequired: boolean;
  fieldVisitCompleted: boolean;
  fieldVisitDate: string;
}

export interface FieldReportApplicationData {
  applicationNumber: string;
  projectTitle: string;
  applicantName: string;
  applicantType: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  waterSource: string;
  waterPurpose: string;
}

/**
 * Generate a Field Assessment Report PDF
 */
export const generateFieldReportPdf = async (
  assessment: FieldReportAssessment,
  applicationData: FieldReportApplicationData,
  inspectorName?: string
): Promise<void> => {
  const doc = new jsPDF();
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatBoolean = (value: boolean | null): string => {
    if (value === null) return 'Not Assessed';
    return value ? '✓ Yes' : '✗ No';
  };

  const formatImpactLevel = (level: string | null): string => {
    if (!level) return 'Not Assessed';
    const labels: Record<string, string> = {
      low: '🟢 Low Impact',
      medium: '🟡 Medium Impact',
      high: '🔴 High Impact'
    };
    return labels[level] || level;
  };

  const formatRecommendation = (rec: string | null): string => {
    if (!rec) return 'Not Provided';
    const labels: Record<string, string> = {
      approve: '✅ Approved for Final Review',
      reject: '❌ Rejected',
      require_revision: '📝 Revision Required'
    };
    return labels[rec] || rec;
  };

  // Add logo
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, 'PNG', 85, 10, 40, 40);
  } catch (error) {
    console.error('Error loading logo:', error);
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 105, 25, { align: 'center' });
  }

  // Header
  doc.setFontSize(18);
  doc.setTextColor(0, 75, 135);
  doc.text('FIELD ASSESSMENT REPORT', 105, 58, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Application: ${applicationData.applicationNumber}`, 105, 68, { align: 'center' });

  // Blue separator line
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 73, 180, 2, 1, 1, 'F');

  // Generation date
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 15, 82);
  if (inspectorName) {
    doc.text(`Inspector: ${inspectorName}`, 195, 82, { align: 'right' });
  }

  let currentY = 92;

  // SECTION 1: APPLICATION DETAILS
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('1. APPLICATION DETAILS', 15, currentY);
  currentY += 5;

  const appDetails = [
    ['Application Number', applicationData.applicationNumber],
    ['Project Title', applicationData.projectTitle],
    ['Applicant Name', applicationData.applicantName],
    ['Applicant Type', applicationData.applicantType === 'individual' ? 'Individual' : 'Organization'],
    ['Location', `${applicationData.village || ''}, ${applicationData.cell}, ${applicationData.sector}, ${applicationData.district}, ${applicationData.province}`.replace(/^, /, '')],
    ['Water Source', (applicationData.waterSource || '').replace(/_/g, ' ').toUpperCase()],
    ['Water Purpose', (applicationData.waterPurpose || '').replace(/_/g, ' ').toUpperCase()]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: appDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // SECTION 2: TECHNICAL FEASIBILITY
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('2. TECHNICAL FEASIBILITY ASSESSMENT', 15, currentY);
  currentY += 5;

  const technicalDetails = [
    ['Technical Feasibility', formatBoolean(assessment.technicalFeasibility)],
    ['Site Accessibility', formatBoolean(assessment.siteAccessibility)],
    ['Infrastructure Adequacy', formatBoolean(assessment.infrastructureAdequacy)],
    ['Technical Comments', assessment.technicalComments || 'No comments provided']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Assessment Item', 'Result']],
    body: technicalDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // Check if we need a new page
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // SECTION 3: ENVIRONMENTAL ASSESSMENT
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('3. ENVIRONMENTAL IMPACT ASSESSMENT', 15, currentY);
  currentY += 5;

  const envDetails = [
    ['Environmental Impact Level', formatImpactLevel(assessment.environmentalImpactLevel)],
    ['Mitigation Required', formatBoolean(assessment.mitigationRequired)],
    ['Environmental Comments', assessment.environmentalComments || 'No comments provided']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Assessment Item', 'Result']],
    body: envDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [34, 139, 34],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 252, 245],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // SECTION 4: WATER SOURCE ASSESSMENT
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('4. WATER SOURCE ASSESSMENT', 15, currentY);
  currentY += 5;

  const waterDetails = [
    ['Source Reliability', formatBoolean(assessment.sourceReliability)],
    ['Capacity Adequate', formatBoolean(assessment.sourceCapacityAdequate)],
    ['Quality Acceptable', formatBoolean(assessment.sourceQualityAcceptable)],
    ['Water Rights Clear', formatBoolean(assessment.waterRightsClear)]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Assessment Item', 'Result']],
    body: waterDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 144, 255],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 248, 255],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // Check if we need a new page
  if (currentY > 200) {
    doc.addPage();
    currentY = 20;
  }

  // SECTION 5: FIELD VISIT
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('5. FIELD VISIT INFORMATION', 15, currentY);
  currentY += 5;

  const visitDetails = [
    ['Field Visit Required', assessment.fieldVisitRequired ? 'Yes' : 'No'],
    ['Field Visit Completed', assessment.fieldVisitCompleted ? 'Yes' : 'No'],
    ['Visit Date', formatDate(assessment.fieldVisitDate)]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Item', 'Status']],
    body: visitDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [128, 128, 128],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // SECTION 6: OVERALL RECOMMENDATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('6. OVERALL RECOMMENDATION', 15, currentY);
  currentY += 5;

  const recDetails = [
    ['Recommendation', formatRecommendation(assessment.overallRecommendation)],
    ['Conditions Required', assessment.conditionsRequired || 'None specified'],
    ['Overall Comments', assessment.overallComments || 'No comments provided']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Item', 'Details']],
    body: recDetails,
    theme: 'grid',
    headStyles: {
      fillColor: assessment.overallRecommendation === 'approve' ? [34, 139, 34] : 
                 assessment.overallRecommendation === 'reject' ? [220, 20, 60] : [255, 165, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [255, 250, 240],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 20;

  // Check if we need a new page for signature
  if (currentY > 240) {
    doc.addPage();
    currentY = 30;
  }

  // SIGNATURE SECTION
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Inspector Signature: _______________________________', 15, currentY);
  currentY += 12;
  doc.text(`Name: ${inspectorName || '_______________________________'}`, 15, currentY);
  currentY += 12;
  doc.text(`Date: ${formatDate(new Date().toISOString())}`, 15, currentY);

  // Footer with document ID
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    doc.text(`Page ${i} of ${pageCount}`, 195, 290, { align: 'right' });
    doc.text(`Document ID: FR-${applicationData.applicationNumber}`, 105, 290, { align: 'center' });
    doc.text('Rwanda Water Resources Board - Field Assessment Report', 15, 290);
  }

  // Download the PDF
  doc.save(`Field-Report-${applicationData.applicationNumber}.pdf`);
};

/**
 * Generate Terms and Conditions (Contract) PDF as a Blob.
 * This creates a downloadable PDF of the contract terms for the water permit.
 */
export const generateTermsConditionsPdfBlob = async (opts: {
  applicationNumber: string;
  projectTitle: string;
  applicantName: string;
  contractNumber: string;
  termsHeading: string;
  termsSections: Array<{ title: string; paragraphs: string[] }>;
  importantNotice?: { title: string; body: string } | null;
}): Promise<Blob> => {
  const {
    applicationNumber,
    projectTitle,
    applicantName,
    contractNumber,
    termsHeading,
    termsSections,
    importantNotice
  } = opts;

  const doc = new jsPDF();
  const wmContract = await loadWatermarkImage();
  if (wmContract) stampWatermark(doc, wmContract);
  const issueDate = new Date();
  const signatureDate = formatDateDMY(issueDate);

  const isSignatureSectionTitle = (title: string): boolean => {
    const t = (title || "").trim().toLowerCase();
    if (!t) return false;
    // English
    if (t === "signatures" || t.includes("signature")) return true;
    // Kinyarwanda
    if (t === "imikono" || t.includes("imikono")) return true;
    return false;
  };

  const normalizeSignatureDateLine = (paragraph: string): string => {
    const p = paragraph.trim();
    if (!p) return paragraph;

    // English signature date placeholder
    if (/^Date:\s*[.·•…_–-]+$/i.test(p) || (/^Date:\s*/i.test(p) && /[.·•…_]{6,}/.test(p))) {
      return `Date: ${signatureDate}`;
    }

    // Kinyarwanda signature date placeholder (in case Kinyarwanda sections are rendered later)
    if (/^Itariki:\s*[.·•…_–-]+$/i.test(p) || (/^Itariki:\s*/i.test(p) && /[.·•…_]{6,}/.test(p))) {
      return `Itariki: ${signatureDate}`;
    }

    return paragraph;
  };

  // Add logo
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, 'PNG', 85, 10, 40, 40);
  } catch {
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 105, 25, { align: 'center' });
  }

  // Header
  doc.setFontSize(16);
  doc.setTextColor(0, 75, 135);
  doc.text('REPUBLIC OF RWANDA', 105, 55, { align: 'center' });
  doc.setFontSize(12);
  doc.text('RWANDA WATER RESOURCES BOARD', 105, 62, { align: 'center' });

  // Blue separator line
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 68, 180, 2, 1, 1, 'F');

  // Main title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.text(termsHeading.toUpperCase(), 105, 80, { align: 'center' });

  // Resolve contract display number — avoid duplicating /RWB/<year> suffix
  // when contractNumber already contains it (e.g. "000004/RWB/2026").
  const contractDisplayNumber = (() => {
    const cn = (contractNumber ?? "").trim();
    if (!cn || cn === "N/A") return `N/A/RWB/${issueDate.getFullYear()}`;
    if (/\/RWB\/\d{4}$/i.test(cn)) return cn;
    return `${cn}/RWB/${issueDate.getFullYear()}`;
  })();

  doc.setFontSize(11);
  doc.setFont("times", "normal");
  doc.text(`Contract No: ${contractDisplayNumber}`, 105, 88, { align: 'center' });

  // Application reference info
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  // Intentionally omit application number from Terms & Conditions contract header
  doc.text(`Project: ${projectTitle}`, 15, 96);
  doc.text(`Applicant: ${applicantName}`, 15, 102);
  doc.text(`Date: ${formatDateDMY(issueDate)}`, 195, 96, { align: 'right' });

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(15, 106, 195, 106);

  let currentY = 114;
  const leftX = 15;
  const maxWidth = 175;
  const lineHeight = 5;
  const sectionSpacing = 8;

  const { englishSections, kinyarwandaSections } = splitContractSectionsByLanguage(termsSections);
  const sectionGroups = [
    {
      key: "en",
      label: "English Version",
      sections: englishSections.filter((section) => !isSignatureSectionTitle(section.title)),
    },
    {
      key: "rw",
      label: "Kinyarwanda Version",
      sections: kinyarwandaSections.filter((section) => !isSignatureSectionTitle(section.title)),
    },
  ].filter((group) => group.sections.length > 0);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Render each language group separately to keep English and Kinyarwanda distinct.
  for (const [groupIndex, group] of sectionGroups.entries()) {
    if (groupIndex > 0) {
      doc.addPage();
      if (wmContract) stampWatermark(doc, wmContract);
      currentY = 20;
    }

    if (sectionGroups.length > 1) {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text(group.label, leftX, currentY);
      currentY += 8;
      doc.setFontSize(10);
    }

    for (const section of group.sections) {
      if (currentY > 260) {
        doc.addPage();
        if (wmContract) stampWatermark(doc, wmContract);
        currentY = 20;
      }

      doc.setFont("times", "bold");
      const titleLines = doc.splitTextToSize(section.title, maxWidth);
      doc.text(titleLines, leftX, currentY);
      currentY += titleLines.length * lineHeight + 2;

      doc.setFont("times", "normal");
      for (const paragraph of section.paragraphs) {
        if (!paragraph.trim()) {
          currentY += lineHeight / 2;
          continue;
        }

        if (currentY > 270) {
          doc.addPage();
          if (wmContract) stampWatermark(doc, wmContract);
          currentY = 20;
        }

        const renderedParagraph = normalizeSignatureDateLine(paragraph);
        const lines = doc.splitTextToSize(renderedParagraph, maxWidth);
        doc.text(lines, leftX, currentY);
        currentY += lines.length * lineHeight + 2;
      }

      currentY += sectionSpacing;
    }
  }

  if (importantNotice) {
    if (currentY > 240) {
      doc.addPage();
      if (wmContract) stampWatermark(doc, wmContract);
      currentY = 20;
    }

    doc.setFillColor(255, 248, 230);
    doc.setDrawColor(255, 165, 0);
    const noticeHeight = 25;
    doc.roundedRect(15, currentY, 180, noticeHeight, 3, 3, 'FD');

    doc.setFont("times", "bold");
    doc.setTextColor(180, 100, 0);
    doc.text(importantNotice.title, 20, currentY + 8);

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 70, 0);
    const noticeLines = doc.splitTextToSize(importantNotice.body, 170);
    doc.text(noticeLines, 20, currentY + 15);

    currentY += noticeHeight + 10;
  }

  // Ensure QR footer has space on the last page (avoid overlapping contract text)
  {
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerBottomPadding = 14;
    const footerY = pageHeight - 60 - footerBottomPadding;
    const safeContentBottomY = footerY - 6;
    if (currentY > safeContentBottomY) {
      doc.addPage();
      if (wmContract) stampWatermark(doc, wmContract);
      currentY = 20;
    }
  }

  // QR footer on the last page only (portal root URL as requested)
  await drawPortalQrFooter({
    doc,
    url: buildContractTermsHostedUrl(contractNumber),
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 290, { align: 'right' });
    doc.text(`Contract: ${contractDisplayNumber}`, 105, 290, { align: 'center' });
    doc.text('Rwanda Water Resources Board - Terms and Conditions', 15, 290);
  }

  return doc.output('blob');
};