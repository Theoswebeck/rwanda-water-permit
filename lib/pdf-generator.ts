import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { qrToSvgString } from "@/lib/qr/qr-svg";
import { isConcessionApplication, selectPermitVariant } from "@/lib/permit-variant";

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

const PERMIT_VERIFY_BASE_URL = window.location.origin;

function buildPermitVerificationUrl(permitNumber: string): string {
  return `${PERMIT_VERIFY_BASE_URL}/permit/view/${encodeURIComponent(permitNumber)}`;
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

function resolveVolumes(application: Application): { yearly: number | null; daily: number | null } {
  const notes = getInternalNotes(application);

  const yearlyCandidate =
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
  // Client-only: jsPDF generation runs in the browser. Keep this helper here to avoid server-side usage.
  const svg = qrToSvgString(text, {
    scale: 6,
    border: 4,
    ariaLabel: "Permit verification QR",
    darkColor: "#0f172a",
    lightColor: "#ffffff",
  });

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    const dataUrl: string = await new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = px;
          canvas.height = px;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, px, px);
          ctx.drawImage(img, 0, 0, px, px);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Failed to load QR SVG image"));
      img.src = url;
    });
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const footerY = pageHeight - 50 - footerBottomPadding; // ~246 on A4
  const footerH = 36;
  const footerW = pageWidth - marginX * 2;

  const qrBox = 34;
  const qrPadding = 2.5;
  const qrX = marginX + footerW - qrBox;
  const qrY = footerY + (footerH - qrBox) / 2;
  const qrSize = qrBox - qrPadding * 2;

  // Background container
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(251, 253, 255);
  doc.roundedRect(marginX, footerY, footerW, footerH, 2, 2, "FD");

  // Left text block (kept narrow to avoid crowding QR)
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text("Verify this permit", marginX + 8, footerY + 12);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  const desc = "Scan the QR code to view this permit in the system.";
  const descLines = doc.splitTextToSize(desc, footerW - qrBox - 18);
  doc.text(descLines, marginX + 8, footerY + 18);

  // QR "card"
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 2, 2, "FD");

  return qrPngDataUrl(verifyUrl, 512).then((png) => {
    doc.addImage(png, "PNG", qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);
  });
}

async function renderAbstractionIndividualPermitPdfBlob(opts: {
  application: Application;
  permitNumber: string;
  permitValidityYears: number;
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears } = opts;
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
  const dailyStr = vols.daily != null ? `${formatNumber(vols.daily, { maxDecimals: 2 })} m³/day` : "N/A m³/day";

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,";
  const para2 =
    `“${applicantName}”, with ID Number: ${applicantId}, is authorized to abstract water from ${waterSourceName} ` +
    `located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village ` +
    `at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, ` +
    `by a ${systemType} with a flow rate of ${yearlyStr} OR ${dailyStr}. ` +
    `Water abstracted will be used for ${activitiesText}.`;
  const para3 =
    `This water use permit is valid for a period of ${permitValidityYears} (Five) years from ${formatDateDMY(issueDate)} to ${formatDateDMY(expiryDate)}.`;
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
  y += 18;

  try {
    const signatureUrl = `${window.location.origin}/assets/signatures/director-general.svg`; // Assuming the signature is in assets/signatures
    doc.addImage(signatureUrl, "SVG", leftX + 5, y, 50, 20); // Adjust position and size as needed
  } catch (error) {
    console.error('Error loading signature image:', error);
  }

  y += 18; // Adjust Y to account for the image height

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  // QR footer on last page only
  await drawPermitQrFooter({ doc, permitNumber });

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
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears } = opts;
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
  const dailyStr = vols.daily != null ? `${formatNumber(vols.daily, { maxDecimals: 2 })} m³/day` : "N/A m³/day";

  const validityWord = "Five";
  const validityNumber = permitValidityYears;

  const para1 =
    "Pursuant to Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda,";

  const para2 =
    `“${orgName}”, with its registered office address as follows: ${officeAddress}; ` +
    `represented by ${rep.name}, is authorized to abstract water from ${waterSourceName} ` +
    `located in ${loc.province} Province, ${loc.district} District, ${loc.sector} Sector, ${loc.cell} Cell, ${loc.village} Village ` +
    `at Latitude: ${lat}${lat !== "N/A" ? "°" : ""}, Longitude: ${lng}${lng !== "N/A" ? "°" : ""}, ` +
    `by a ${systemType} with a flow rate of ${yearlyStr} OR ${dailyStr}. ` +
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
  y += 18;

  try {
    const signatureUrl = `${window.location.origin}/assets/signatures/director-general.svg`; // Assuming the signature is in assets/signatures
    doc.addImage(signatureUrl, "SVG", leftX + 5, y, 50, 20); // Adjust position and size as needed
  } catch (error) {
    console.error('Error loading signature image:', error);
  }

  y += 18; // Adjust Y to account for the image height

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

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
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears } = opts;
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

  const validityWord = "Five";
  const validityNumber = permitValidityYears;

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
  y += 22;

  try {
    const signatureUrl = `${window.location.origin}/assets/signatures/director-general.svg`; // Assuming the signature is in assets/signatures
    doc.addImage(signatureUrl, "SVG", leftX + 5, y, 50, 20); // Adjust position and size as needed
  } catch (error) {
    console.error('Error loading signature image:', error);
  }

  y += 18; // Adjust Y to account for the image height

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

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
}): Promise<Blob> {
  const { application, permitNumber, permitValidityYears } = opts;
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

  const validityWord = "Five";
  const validityNumber = permitValidityYears;

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
  y += 22;

  try {
    const signatureUrl = `${window.location.origin}/assets/signatures/director-general.svg`; // Assuming the signature is in assets/signatures
    doc.addImage(signatureUrl, "SVG", leftX + 5, y, 50, 20); // Adjust position and size as needed
  } catch (error) {
    console.error('Error loading signature image:', error);
  }

  y += 18; // Adjust Y to account for the image height

  doc.setFont("times", "bold");
  doc.text("Dr. Emmanuel RUKUNDO", leftX, y);
  y += 6;
  doc.setFont("times", "normal");
  doc.text("Director General", leftX, y);

  const rightX = 190;
  doc.text(`Done at Kigali, On ${formatDateDMY(issueDate)}`, rightX, y, { align: "right" });

  await drawPermitQrFooter({ doc, permitNumber });

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
 */
export const generateDigitalWaterPermitBlob = async (
  application: Application,
  permitNumber: string,
  conditions: string[] = [],
  permitValidityYears: number = 5
): Promise<Blob> => {
  const variant = selectPermitVariant(application);
  if (variant === "abstraction_individual") {
    return renderAbstractionIndividualPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears,
    });
  }
  if (variant === "abstraction_organization") {
    return renderAbstractionOrganizationPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears,
    });
  }
  if (variant === "concession_individual") {
    return renderConcessionIndividualPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears,
    });
  }
  if (variant === "concession_organization") {
    return renderConcessionOrganizationPermitPdfBlob({
      application,
      permitNumber,
      permitValidityYears,
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
  
  // Open the PDF in a new tab
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
}; 