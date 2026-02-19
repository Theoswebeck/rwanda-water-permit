import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { isConcessionApplication, selectPermitVariant } from "@/lib/permit-variant";

// Rwanda Coat of Arms watermark path
const WATERMARK_IMAGE_PATH = "/assets/png-transparent-rulindo-district-coat-of-arms-organization-agriculture-government-others-leaf-logo-agriculture.png";

// =============================================
// Small formatting helpers
// =============================================
function numberToEnglishWords(n: number): string {
  // Supports 0-99; falls back to numeric string for anything else.
  if (!Number.isFinite(n)) return String(n);
  const num = Math.abs(Math.trunc(n));

  const small: Record<number, string> = {
    0: "Zero",
    1: "One",
    2: "Two",
    3: "Three",
    4: "Four",
    5: "Five",
    6: "Six",
    7: "Seven",
    8: "Eight",
    9: "Nine",
    10: "Ten",
    11: "Eleven",
    12: "Twelve",
    13: "Thirteen",
    14: "Fourteen",
    15: "Fifteen",
    16: "Sixteen",
    17: "Seventeen",
    18: "Eighteen",
    19: "Nineteen",
    20: "Twenty",
  };
  if (small[num]) return small[num];

  const tensMap: Record<number, string> = {
    2: "Twenty",
    3: "Thirty",
    4: "Forty",
    5: "Fifty",
    6: "Sixty",
    7: "Seventy",
    8: "Eighty",
    9: "Ninety",
  };
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  const tensWord = tensMap[tens];
  if (!tensWord) return String(n);
  if (ones === 0) return tensWord;
  return `${tensWord}-${small[ones]}`;
}

/**
 * Pre-load the watermark image and return a Promise that resolves to the data URL.
 * This is cached for performance.
 */
let cachedWatermarkDataUrl: string | null = null;

async function loadWatermarkImage(): Promise<string | null> {
  if (cachedWatermarkDataUrl) {
    return cachedWatermarkDataUrl;
  }

  try {
    const watermarkUrl = `${window.location.origin}${WATERMARK_IMAGE_PATH}`;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          cachedWatermarkDataUrl = dataUrl;
          resolve(dataUrl);
        } catch (e) {
          console.warn("⚠️ Could not convert watermark to data URL:", e);
          resolve(null);
        }
      };
      img.onerror = () => {
        console.warn("⚠️ Failed to load watermark image");
        resolve(null);
      };
      img.src = watermarkUrl;
    });
  } catch (error) {
    console.warn("⚠️ Error loading watermark image:", error);
    return null;
  }
}

/**
 * Draw a centered watermark on the current page of the PDF document.
 * The watermark is drawn with low opacity to appear behind content.
 */
async function drawCenteredWatermark(doc: jsPDF): Promise<void> {
  const watermarkDataUrl = await loadWatermarkImage();
  if (!watermarkDataUrl) {
    return; // Silently skip if watermark can't be loaded
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Watermark size - make it substantial and visible
  // Using 100mm width for better visibility on A4 pages
  const watermarkWidth = 100;
  const watermarkHeight = 100; // Coat of arms is roughly square

  // Center the watermark
  const x = (pageWidth - watermarkWidth) / 2;
  const y = (pageHeight - watermarkHeight) / 2;

  // Save current graphics state
  const gState = new (doc as any).GState({ opacity: 0.18 }); // Subtle but visible watermark effect
  doc.setGState(gState);

  // Add the watermark image
  try {
    doc.addImage(watermarkDataUrl, "PNG", x, y, watermarkWidth, watermarkHeight);
  } catch (error) {
    console.warn("⚠️ Could not add watermark to PDF:", error);
  }

  // Reset graphics state to full opacity
  const normalState = new (doc as any).GState({ opacity: 1 });
  doc.setGState(normalState);
}

/**
 * Add watermark to all pages of a PDF document.
 * Call this AFTER all content has been added and before outputting the blob.
 */
async function addWatermarkToAllPages(doc: jsPDF): Promise<void> {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    await drawCenteredWatermark(doc);
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

type Permit = {
  id: string;
  title: string;
  issueDate: string;
  expiryDate: string;
  status: "active" | "expired" | "expiring-soon";
  type: string;
  location: string;
  permitNumber: string;
  waterSource: string;
  purpose: string;
  waterAllowance: string;
  issuingAuthority: string;
  applicationDetails?: {
    applicantName: string;
    applicantType: string;
    contactEmail: string;
    contactPhone: string;
    landOwnership: string;
    environmentalAssessment: string;
  };
  conditions: string[];
  inspections: Array<{
    date: string;
    status: string;
    notes: string;
  }>;
};

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
const PRODUCTION_URL = "https://rwanda-water-permit-production.up.railway.app";

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
  return normalizeActivities(notes.intendedActivities);
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
    electricity_generation: "Electricity Generation",
    mining: "Mining",
    construction_of_dam: "Construction of Dam",
    construction_of_infrastructures: "Construction of Infrastructures",
    navigation: "Navigation",
    recreation_activities: "Recreation Activities",
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
  const derived = derivePermitTitleNumber(application);
  // If we can derive from application number, it already includes `/RWB/YYYY`.
  if (derived) return derived;
  // Otherwise fall back to the existing permit number + `/RWB/<year>` as used previously.
  return `${permitNumber} /RWB/${headerYear}`;
}

// NOTE: variant selection is shared with the UI via `lib/permit-variant.ts`.

function resolveApplicantName(application: Application): string {
  return application.applicant?.account_type === "individual"
    ? `${application.applicant.first_name ?? ""} ${application.applicant.last_name ?? ""}`.trim() || "N/A"
    : application.applicant?.company_name || "N/A";
}

function resolveApplicantIdNumber(application: Application): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nationalIdNumber === "string" ? notes.nationalIdNumber.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = typeof application.applicant?.id_number === "string" ? application.applicant.id_number.trim() : "";
  if (fromUser) return fromUser;
  return "N/A";
}

function resolveOrganizationOfficeAddress(application: Application): string {
  const notes = getInternalNotes(application);
  const sector =
    typeof notes?.officeSector === "string" && notes.officeSector.trim()
      ? notes.officeSector.trim()
      : application.sector || "";
  const district =
    typeof notes?.officeDistrict === "string" && notes.officeDistrict.trim()
      ? notes.officeDistrict.trim()
      : application.district || "";
  const provinceRaw =
    typeof notes?.officeProvince === "string" && notes.officeProvince.trim()
      ? notes.officeProvince.trim()
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

function resolveOrganizationRepresentative(application: Application): { name: string } {
  const notes = getInternalNotes(application);
  const name = typeof notes?.nameRepresentative === "string" ? notes.nameRepresentative.trim() : "";
  return { name: name || "N/A" };
}

function resolveConcessionAreaHectares(application: Application): number | null {
  if (typeof application.concession_area === "number" && Number.isFinite(application.concession_area)) {
    return application.concession_area;
  }
  const notes = getInternalNotes(application);
  if (typeof notes?.concessionArea === "number" && Number.isFinite(notes.concessionArea)) return notes.concessionArea;
  if (typeof notes?.fishLakeAreaHectares === "number" && Number.isFinite(notes.fishLakeAreaHectares)) {
    return notes.fishLakeAreaHectares;
  }
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
  const latVal = notes?.waterSourceLatitude;
  const lngVal = notes?.waterSourceLongitude;
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

  // Fallback: if polygons exist in notes, use the first point of the first polygon.
  const polys = Array.isArray(notes?.waterSourcePolygons) ? (notes?.waterSourcePolygons as any[]) : null;
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

function resolveSystemType(application: Application): "GRAVITY SYSTEM" | "PUMPING SYSTEM" {
  const candidate =
    (typeof application.water_taking_method === "string" ? application.water_taking_method : "") ||
    (() => {
      const notes = getInternalNotes(application);
      const m = notes?.waterAbstractionDetails?.[0]?.abstractionMethod;
      return typeof m === "string" ? m : "";
    })();
  const normalized = candidate.toLowerCase();
  if (normalized.includes("pump")) return "PUMPING SYSTEM";
  return "GRAVITY SYSTEM";
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
  
  // Priority 3: Fallback to passed value or default
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
  const yearlyCandidate =
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

  const dailyCandidate =
    (typeof application.max_daily_volume_m3 === "number" && Number.isFinite(application.max_daily_volume_m3)
      ? application.max_daily_volume_m3
      : null) ??
    (typeof notes?.waterSupplyDailyAbstraction === "number" && Number.isFinite(notes.waterSupplyDailyAbstraction)
      ? notes.waterSupplyDailyAbstraction
      : null) ??
    (yearlyCandidate != null ? yearlyCandidate / 365 : null);

  return { yearly: yearlyCandidate, daily: dailyCandidate };
}

async function qrPngDataUrl(text: string, px: number): Promise<string> {
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
  return qrPngDataUrl(url, 1024).then((png) => {
    doc.addImage(png, "PNG", qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);

    // Subtle caption
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("times", "italic");
    doc.text("Scan to visit the Rwanda Water Permit Portal", pageWidth / 2, qrY + qrBox + 6, {
      align: "center",
      maxWidth: footerW - 20,
    });
    doc.setFont("times", "normal");
  });
}

async function renderAbstractionIndividualPermitPdfBlob(opts: {
  application: Application;
  permitNumber: string;
  permitValidityYears: number;
  isModified?: boolean;
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears, isModified } = opts;
  const doc = new jsPDF();

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  // Logo + minimal header styling (keep resilient: fallback to text if logo fails)
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, "PNG", 90, 10, 30, 30);
  } catch {
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text("Rwanda Water Resources Board", 105, 22, { align: "center" });
  }

  const headerYear = issueDate.getFullYear();
  const titlePermitNo = resolvePermitTitleLine(application, permitNumber, headerYear);
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(
    `WATER USE PERMIT N° ${titlePermitNo} (for Individual Applicant )`,
    105,
    48,
    { align: "center" }
  );

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = 62;
  const leftX = 20;
  const maxWidth = 170;

  const applicantName = resolveApplicantName(application);
  const applicantId = resolveApplicantIdNumber(application);
  const waterSourceName = resolveWaterSourceName(application);
  const loc = resolveWaterSourceAdminLocation(application);
  const { lat, lng } = resolveLatLng(application);
  const systemType = resolveSystemType(application);
  const activitiesText = formatActivitiesForPermit(application);
  const vols = resolveVolumes(application);
  const yearlyStr = vols.yearly != null ? `${formatNumber(vols.yearly)} m³/year` : "N/A m³/year";

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,";
  const para2 =
    `"${applicantName}", with ID Number: ${applicantId}, is authorized to abstract water from ${waterSourceName} ` +
    `located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village ` +
    `at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, ` +
    `by a ${systemType} with a flow rate of ${yearlyStr}. ` +
    `Water abstracted will be used for ${activitiesText}.`;
  const validityNumber = permitValidityYears;
  const validityWord = numberToEnglishWords(validityNumber);
  const para3 =
    `This water use permit is valid for a period of ${validityNumber} (${validityWord}) years from ${formatDateDMY(issueDate)} to ${formatDateDMY(expiryDate)}.`;
  const para4 =
    "In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.";

  const paragraphs = [para1, para2, para3, para4];
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, maxWidth);
    doc.text(lines, leftX, y);
    y += lines.length * 6 + 6;
  }

  // Signature section (keep above QR footer area)
  const footerCutoffY = 232;
  if (y > footerCutoffY) {
    doc.addPage();
    y = 30;
  }

  doc.text("Signature: …………………..", leftX, y);
  y += 12;

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  // QR footer on last page only
  await drawPermitQrFooter({ doc, permitNumber });

  // Add watermark to all pages BEFORE adding footer text (so watermark is behind everything)
  await addWatermarkToAllPages(doc);

  // Stamp "MODIFIED PERMIT" badge on page 1 when applicable
  if (isModified) drawModifiedBadge(doc);

  // Minimal page footer metadata (keep consistent with existing PDFs)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: "right" });
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: "center" });
  }

  return doc.output("blob");
}

async function renderAbstractionOrganizationPermitPdfBlob(opts: {
  application: Application;
  permitNumber: string;
  permitValidityYears: number;
  isModified?: boolean;
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears, isModified } = opts;
  const doc = new jsPDF();

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  // Logo + minimal header styling (keep resilient: fallback to text if logo fails)
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, "PNG", 90, 10, 30, 30);
  } catch {
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text("Rwanda Water Resources Board", 105, 22, { align: "center" });
  }

  const headerYear = issueDate.getFullYear();
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(`WATER USE PERMIT N° ${resolvePermitTitleLine(application, permitNumber, headerYear)}`, 105, 48, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = 62;
  const leftX = 20;
  const maxWidth = 170;

  const orgName = resolveApplicantName(application);
  const officeAddress = resolveOrganizationOfficeAddress(application);
  const rep = resolveOrganizationRepresentative(application);
  const waterSourceName = resolveWaterSourceName(application);
  const loc = resolveWaterSourceAdminLocation(application);
  const { lat, lng } = resolveLatLng(application);
  const systemType = resolveSystemType(application); // GRAVITY/PUMPING
  const activitiesText = formatActivitiesForPermit(application);
  const vols = resolveVolumes(application);
  const yearlyStr = vols.yearly != null ? `${formatNumber(vols.yearly)} m³/year` : "N/A m³/year";

  const validityNumber = permitValidityYears;
  const validityWord = numberToEnglishWords(validityNumber);

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,";

  const para2 =
    `"${orgName}", with its registered office address as follows: ${officeAddress}; ` +
    `represented by ${rep.name}, is authorized to abstract water from ${waterSourceName} ` +
    `located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village ` +
    `at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, ` +
    `by a ${systemType} with a flow rate of ${yearlyStr}. ` +
    `Water abstracted will be used for ${activitiesText}.`;

  const para3 =
    `This water use permit is valid for a period of ${validityWord} (${validityNumber}) years from ${formatDateDMY(issueDate)} to ${formatDateDMY(expiryDate)}.`;

  const para4 =
    "In addition to the conditions specified in the Law mentioned above, this Authorization is subject to the terms and conditions as defined in attached contract.";

  const paragraphs = [para1, para2, para3, para4];
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, maxWidth);
    doc.text(lines, leftX, y);
    y += lines.length * 6 + 6;
  }

  // Signature section (keep above QR footer area)
  const footerCutoffY = 232;
  if (y > footerCutoffY) {
    doc.addPage();
    y = 30;
  }

  doc.text("Signature: …………………..", leftX, y);
  y += 12;

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);

  // Stamp "MODIFIED PERMIT" badge on page 1 when applicable
  if (isModified) drawModifiedBadge(doc);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: "right" });
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: "center" });
  }

  return doc.output("blob");
}

async function renderConcessionIndividualPermitPdfBlob(opts: {
  application: Application;
  permitNumber: string;
  permitValidityYears: number;
  isModified?: boolean;
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears, isModified } = opts;
  const doc = new jsPDF();

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  // Logo + minimal header styling (keep resilient: fallback to text if logo fails)
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, "PNG", 90, 10, 30, 30);
  } catch {
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text("Rwanda Water Resources Board", 105, 22, { align: "center" });
  }

  const headerYear = issueDate.getFullYear();
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(`WATER USE PERMIT N° ${resolvePermitTitleLine(application, permitNumber, headerYear)}`, 105, 48, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = 62;
  const leftX = 20;
  const maxWidth = 170;

  const applicantName = resolveApplicantName(application);
  const applicantId = resolveApplicantIdNumber(application);
  const activitiesText = formatActivitiesForPermit(application);
  const areaHa = resolveConcessionAreaHectares(application);
  const areaStr = areaHa != null ? `${formatNumber(areaHa)} Hectare` : "N/A Hectare";
  const lakeName = resolveLakeNameForPermit(application);
  const loc = resolveWaterSourceAdminLocation(application);
  const provinceStr = formatProvinceOrKigali(loc.province);

  const validityNumber = permitValidityYears;
  const validityWord = numberToEnglishWords(validityNumber);

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,";

  const para2 =
    `“${applicantName}”, with ID Number: ${applicantId}, is authorized to carry out ${activitiesText} ` +
    `on the surface area of ${areaStr} (Concession area) in ${lakeName}, on its part located in ` +
    `${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${provinceStr} ` +
    `as shown on the attached map. This permit applies for activities conducted solely within the water body.`;

  const para3 =
    `This water use permit is valid for a period of ${validityWord} (${validityNumber}) years from ${formatDateDMY(issueDate)} to ${formatDateDMY(expiryDate)}.`;

  const para4 =
    "In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.";

  const paragraphs = [para1, para2, para3, para4];
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, maxWidth);
    doc.text(lines, leftX, y);
    y += lines.length * 6 + 6;
  }

  // Signature section (keep above QR footer area)
  const footerCutoffY = 232;
  if (y > footerCutoffY) {
    doc.addPage();
    y = 30;
  }

  doc.text("Signature/Umukono: …………………..", leftX, y);
  y += 12;

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);

  // Stamp "MODIFIED PERMIT" badge on page 1 when applicable
  if (isModified) drawModifiedBadge(doc);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: "right" });
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: "center" });
  }

  return doc.output("blob");
}

async function renderConcessionOrganizationPermitPdfBlob(opts: {
  application: Application;
  permitNumber: string;
  permitValidityYears: number;
  isModified?: boolean;
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears, isModified } = opts;
  const doc = new jsPDF();

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  // Logo + minimal header styling (keep resilient: fallback to text if logo fails)
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    doc.addImage(rwbLogoUrl, "PNG", 90, 10, 30, 30);
  } catch {
  doc.setFontSize(12);
  doc.setTextColor(0, 75, 135);
    doc.text("Rwanda Water Resources Board", 105, 22, { align: "center" });
  }

  const headerYear = issueDate.getFullYear();
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(`WATER USE PERMIT N° ${resolvePermitTitleLine(application, permitNumber, headerYear)}`, 105, 48, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = 62;
  const leftX = 20;
  const maxWidth = 170;

  const orgName = resolveApplicantName(application);
  const officeAddress = resolveOrganizationOfficeAddress(application);
  const rep = resolveOrganizationRepresentative(application);
  const activitiesText = formatActivitiesForPermit(application);
  const areaHa = resolveConcessionAreaHectares(application);
  const areaStr = areaHa != null ? `${formatNumber(areaHa)} hectares` : "N/A hectares";
  const lakeName = resolveLakeNameForPermit(application);
  const loc = resolveWaterSourceAdminLocation(application);
  const provinceStr = formatProvinceOrKigali(loc.province);

  const validityNumber = permitValidityYears;
  const validityWord = numberToEnglishWords(validityNumber);

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda,";

  // Note: User preference earlier was to show representative name (no position).
  const para2 =
    `“${orgName}”, with its registered office address as follows: ${officeAddress}; represented by ${rep.name}; ` +
    `is authorized to carry out ${activitiesText} on the surface area of ${areaStr} in ${lakeName}, ` +
    `on its part located in ${loc.village} Village, ${loc.cell} Cell, ${loc.sector} Sector, ${loc.district} District, ${provinceStr}, ` +
    `as shown on the attached map. This permit applies to activities conducted solely within the water body.`;

  const para3 =
    `This water use permit is valid for a period of ${validityWord} (${validityNumber}) years from ${formatDateDMY(issueDate)} to ${formatDateDMY(expiryDate)}.`;

  const para4 =
    "In addition to the conditions specified in the Law mentioned above, this water use permit is subject to the terms and conditions as defined in the attached contract.";

  const paragraphs = [para1, para2, para3, para4];
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, maxWidth);
    doc.text(lines, leftX, y);
    y += lines.length * 6 + 6;
  }

  // Signature section (keep above QR footer area)
  const footerCutoffY = 232;
  if (y > footerCutoffY) {
    doc.addPage();
    y = 30;
  }

  doc.text("Signature: …………………..", leftX, y);
  y += 12;

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);

  // Stamp "MODIFIED PERMIT" badge on page 1 when applicable
  if (isModified) drawModifiedBadge(doc);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: "right" });
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: "center" });
  }

  return doc.output("blob");
}

export const generateDigitalWaterPermit = async (
  application: Application,
  permitNumber: string,
  conditions: string[] = [],
  permitValidityYears: number = 5
): Promise<void> => {
  const pdfBlob = await generateDigitalWaterPermitBlob(application, permitNumber, conditions, permitValidityYears);
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};

/**
 * Generate a digital water permit PDF as a Blob (does NOT open a new tab).
 * This is used when we need to persist the exact PDF to Supabase Storage.
 * 
 * Note: The permit duration is resolved from assessor recommendations stored in the
 * application record, falling back to the passed permitValidityYears if not available.
 */
export const generateDigitalWaterPermitBlob = async (
  application: Application,
  permitNumber: string,
  conditions: string[] = [],
  permitValidityYears: number = 5,
  /** When true a visible "MODIFIED PERMIT" badge is stamped on the PDF. */
  isModified: boolean = false
): Promise<Blob> => {
  // Use assessor recommended duration if available, otherwise fall back to passed value
  const resolvedValidityYears = resolvePermitDurationYears(application, permitValidityYears);
  
  const variant = selectPermitVariant(application);
  if (variant === "abstraction_individual") {
    return renderAbstractionIndividualPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears: resolvedValidityYears,
      isModified,
    });
  }
  if (variant === "abstraction_organization") {
    return renderAbstractionOrganizationPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears: resolvedValidityYears,
      isModified,
    });
  }
  if (variant === "concession_individual") {
    return renderConcessionIndividualPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears: resolvedValidityYears,
      isModified,
    });
  }
  if (variant === "concession_organization") {
    return renderConcessionOrganizationPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears: resolvedValidityYears,
      isModified,
    });
  }

  const doc = new jsPDF();

  // Helper function to format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const applicantName = application.applicant.account_type === 'individual' 
    ? `${application.applicant.first_name} ${application.applicant.last_name}`
    : application.applicant.company_name || 'Unknown';

  const issueDate = new Date();
  const expiryDate = new Date();
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  try {
    // Add official logos with proper sizing
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    const moeLogoUrl = `${window.location.origin}/assets/ministry_of_env_logo.png`;
    
    // Left logo - Rwanda Water Resources Board (circular logo)
    doc.addImage(rwbLogoUrl, 'PNG', 15, 10, 35, 35);
    
    // Right logo - Ministry of Environment (also circular)
    doc.addImage(moeLogoUrl, 'PNG', 150, 10, 35, 35);
  } catch (error) {
    console.error('Error loading logos:', error);
    // Fallback to text headers
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 15, 25);
    doc.text('Ministry of Environment', 195, 25, { align: 'right' });
  }

  // Official header
  doc.setFontSize(16);
  doc.setTextColor(0, 75, 135);
  doc.text('REPUBLIC OF RWANDA', 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text('RWANDA WATER RESOURCES BOARD', 105, 28, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Ministry of Environment', 105, 35, { align: 'center' });

  // Blue separator line
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 50, 180, 2, 1, 1, 'F');

  // Main title
  doc.setFontSize(20);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER PERMIT CERTIFICATE', 105, 65, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(`Permit No: ${permitNumber}`, 105, 75, { align: 'center' });

  // Permit validity dates
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Issue Date: ${formatDate(issueDate.toISOString())}`, 15, 85);
  doc.text(`Expiry Date: ${formatDate(expiryDate.toISOString())}`, 195, 85, { align: 'right' });

  // Divider
  doc.setDrawColor(0, 100, 150);
  doc.setLineWidth(0.5);
  doc.line(15, 90, 195, 90);

  let currentY = 100;

  // SECTION 1: PERMIT HOLDER INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PERMIT HOLDER INFORMATION', 15, currentY);
  currentY += 5;

  const holderInfo = [
    ['Name', applicantName],
    ['Type', application.applicant.account_type === 'individual' ? 'Individual' : 'Organization'],
    ['Email', application.applicant.email],
    ['Phone', application.applicant.phone || 'N/A'],
    ['Application Number', application.application_number]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: holderInfo,
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
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 2: PROJECT INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PROJECT INFORMATION', 15, currentY);
  currentY += 5;

  const projectInfo = [
    ['Project Title', application.project_title],
    ['Application Type', application.application_type.replace('_', ' ').toUpperCase()],
    ['Project Value', formatCurrency(application.project_value)],
    ['Description', application.project_description || 'N/A'],
    ['Location', `${application.village || ''} ${application.cell}, ${application.sector}, ${application.district}, ${application.province}`.trim()],
    ['Location Description', application.location_description || 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: projectInfo,
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
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Check if we need a new page
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  // SECTION 3: WATER USE AUTHORIZATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER USE AUTHORIZATION', 15, currentY);
  currentY += 5;

  const waterInfo = [
    ['Water Source', application.water_source.replace('_', ' ').toUpperCase()],
    ['Purpose', application.water_purpose.replace('_', ' ').toUpperCase()],
    ['Authorized Volume', `${application.estimated_usage_volume?.toLocaleString() || 'N/A'} ${application.usage_unit || ''}`],
    ['Maximum Yearly Volume', application.max_yearly_volume_m3 ? `${application.max_yearly_volume_m3.toLocaleString()} m³` : 'N/A'],
    ['Concession Area', application.concession_area ? `${application.concession_area} hectares` : 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Authorization Details', 'Specification']],
    body: waterInfo,
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
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 4: PERMIT CONDITIONS
  if (conditions && conditions.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(0, 75, 135);
    doc.text('PERMIT CONDITIONS', 15, currentY);
    currentY += 5;

    const conditionsBody = conditions.map((condition, index) => {
      return [`${index + 1}.`, condition];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Condition']],
      body: conditionsBody,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 140, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [255, 248, 240],
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 165 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Add new page for legal information if needed
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // LEGAL DISCLAIMER
  doc.setFontSize(12);
  doc.setTextColor(139, 0, 0);
  doc.text('LEGAL NOTICE AND CONDITIONS', 15, currentY);
  currentY += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const legalText = [
    "1. This permit is issued under the Water Law of Rwanda and is subject to all applicable regulations.",
    "2. The permit holder must comply with all conditions specified herein and maintain accurate records.",
    "3. Water extraction must not exceed authorized volumes and must be used only for specified purposes.",
    "4. The Rwanda Water Resources Board reserves the right to conduct periodic inspections.",
    "5. This permit is non-transferable without prior written approval from the Rwanda Water Resources Board.",
    "6. Violation of any condition may result in permit suspension or revocation."
  ];

  legalText.forEach((text, index) => {
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 15, currentY + (index * 12));
  });

  currentY += legalText.length * 12 + 20;

  // SIGNATURE SECTION
  doc.setFontSize(12);
  doc.setTextColor(0, 75, 135);
  doc.text('OFFICIAL AUTHORIZATION', 105, currentY, { align: 'center' });
  currentY += 15;

  // Authority signature box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.rect(30, currentY, 70, 40);
  doc.setFontSize(10);
  doc.text('Rwanda Water Resources Board', 65, currentY + 8, { align: 'center' });
  doc.text('Authorized Officer', 65, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 65, currentY + 35, { align: 'center' });

  // Permit holder acknowledgment box
  doc.rect(110, currentY, 70, 40);
  doc.text('Permit Holder', 145, currentY + 8, { align: 'center' });
  doc.text('Acknowledgment', 145, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 145, currentY + 35, { align: 'center' });

  // If signature blocks push too low, add a clean page for the QR footer
  if (currentY + 50 > 235) {
    doc.addPage();
  }

  // Add QR footer on the last page only
  await drawPermitQrFooter({ doc, permitNumber });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);

  // Footer with security features
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    // Security footer
    const securityText = "This is an official water permit certificate issued by the Rwanda Water Resources Board. " +
                        "Unauthorized modification is prohibited by law. Verify authenticity at rwb.gov.rw";
    // On the last page, keep the line a little narrower to avoid feeling cramped with the QR footer above.
    doc.text(securityText, 15, 285, { maxWidth: i === pageCount ? 165 : 180 });
    
    // Page numbers and metadata
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: 'right' });
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 15, 295);
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: 'center' });
  }

  // Stamp "MODIFIED PERMIT" badge on page 1 when applicable
  if (isModified) drawModifiedBadge(doc);

  return doc.output('blob');
};

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

  doc.setFontSize(11);
  doc.setFont("times", "normal");
  doc.text(`Contract No: ${contractNumber}/RWB/${issueDate.getFullYear()}`, 105, 88, { align: 'center' });

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

  // Filter out Kinyarwanda sections for the English version (display English only)
  const englishSections = termsSections.filter((section) => {
    const t = section.title.trim().toLowerCase();
    return !(
      t.includes('kinyarwanda') ||
      t.startsWith('amasezerano') ||
      t.startsWith('igice') ||
      t.startsWith('ingingo') ||
      t.startsWith('imikono') ||
      t.startsWith('ibisobanuro')
    );
  }).filter((section) => !isSignatureSectionTitle(section.title));

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Render each section
  for (const section of englishSections) {
    // Check if we need a new page
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }

    // Section title
    doc.setFont("times", "bold");
    const titleLines = doc.splitTextToSize(section.title, maxWidth);
    doc.text(titleLines, leftX, currentY);
    currentY += titleLines.length * lineHeight + 2;

    // Section paragraphs
    doc.setFont("times", "normal");
    for (const paragraph of section.paragraphs) {
      if (!paragraph.trim()) {
        currentY += lineHeight / 2;
        continue;
      }

      // Check if we need a new page
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
      }

      const renderedParagraph = normalizeSignatureDateLine(paragraph);
      const lines = doc.splitTextToSize(renderedParagraph, maxWidth);
      doc.text(lines, leftX, currentY);
      currentY += lines.length * lineHeight + 2;
    }

    currentY += sectionSpacing;
  }

  // Important Notice
  if (importantNotice) {
    if (currentY > 240) {
      doc.addPage();
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
      currentY = 20;
    }
  }

  // QR footer on the last page only (portal root URL as requested)
  await drawPortalQrFooter({
    doc,
    url: "https://rwanda-water-permit-production.up.railway.app/",
  });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, 195, 290, { align: 'right' });
    doc.text(`Contract: ${contractNumber}/RWB/${issueDate.getFullYear()}`, 105, 290, { align: 'center' });
    doc.text('Rwanda Water Resources Board - Terms and Conditions', 15, 290);
  }

  return doc.output('blob');
};

export const generatePermitPDF = async (permit: Permit): Promise<void> => {
  // Create a new PDF document
  const doc = new jsPDF();
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  
  // Add logos
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    const moeLogoUrl = `${window.location.origin}/assets/ministry_of_env_logo.png`;
    
    doc.addImage(rwbLogoUrl, 'PNG', 15, 10, 30, 30);
    doc.addImage(moeLogoUrl, 'PNG', 155, 10, 30, 30);
  } catch (error) {
    console.error('Error loading logos:', error);
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 15, 20);
    doc.text('Ministry of Environment', 195, 20, { align: 'right' });
  }
  
  // Add blue line separator
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 50, 180, 2, 1, 1, 'F');
  
  // Add title and permit number
  doc.setFontSize(18);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER PERMIT CERTIFICATE', 105, 65, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Permit Number: ${permit.permitNumber}`, 105, 75, { align: 'center' });
  
  // Add divider
  doc.setDrawColor(0, 100, 150);
  doc.setLineWidth(0.5);
  doc.line(15, 80, 195, 80);
  
  // Add permit information
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('PERMIT INFORMATION', 15, 90);
  
  // Permit details
  const permitDetails = [
    ['Title', permit.title],
    ['Type', permit.type],
    ['Status', permit.status.charAt(0).toUpperCase() + permit.status.slice(1).replace('-', ' ')],
    ['Issue Date', formatDate(permit.issueDate)],
    ['Expiry Date', formatDate(permit.expiryDate)],
    ['Water Source', permit.waterSource],
    ['Purpose', permit.purpose],
    ['Water Allowance', permit.waterAllowance],
    ['Location', permit.location],
    ['Issuing Authority', permit.issuingAuthority],
  ];
  
  autoTable(doc, {
    startY: 95,
    head: [['Property', 'Value']],
    body: permitDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 240, 240],
    },
  });

  // Add QR footer on the last page (ensure it doesn't collide with table end)
  const lastY = (doc as any).lastAutoTable?.finalY ?? 0;
  if (lastY > 235) {
    doc.addPage();
  }
  await drawPermitQrFooter({ doc, permitNumber: permit.permitNumber });

  // Add watermark to all pages
  await addWatermarkToAllPages(doc);
  
  // Open the PDF in a new tab
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
}; 