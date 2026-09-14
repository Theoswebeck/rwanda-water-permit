import type { Json } from "@/types/database";
import { polygonsToGeoJSON } from "@/lib/geoUtils";
import { getEffectiveInternalNotes } from "@/lib/document-overrides";
import { resolveOriginalPermitNumber } from "@/lib/permit/resolve-preview-permit-number";
import * as turf from "@turf/turf";

export type ContractPlaceholderContext = {
  applicationNumber: string;
  contractNumber: string;
  isIndividual: boolean;
  applicantName: string;
  applicantIdNumber: string;
  organizationName: string;
  representativeName: string;
  representativeTitle: string;
  officeProvinceLabel: string;
  officeDistrict: string;
  officeSector: string;
  officeCell: string;
  officeVillage: string;
  /** Pre-composed English office address, e.g. "X Sector, Y District, Z Province" with cell/village prepended when set. */
  officeAddressEnglish: string;
  /** Pre-composed Kinyarwanda office address, e.g. "Umurenge wa X, Akarere ka Y, Intara y' Z" with cell/village prepended when set. */
  officeAddressKinyarwanda: string;
  waterSourceName: string;
  provinceLabel: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  lat: string;
  lng: string;
  volumeLabel: string; // e.g. "12,000 m³/year" or "100 m³/day"
  isGroundwater: boolean; // true when methodOfWaterAbstraction === "groundwater"
  durationYearsLabel: string; // e.g. "5"
  concessionAreaLabel: string; // e.g. "12 Ha"
  activityLabel: string; // e.g. "Fish farming in lakes"
  activityLabelRw: string; // e.g. "Uburobyi byo mu biyaga"
  systemTypeEnglish: string; // e.g. "Gravity system" or "Pumping system"
  systemTypeKinyarwanda: string; // e.g. "gravity" or "gupompa"
};

export type ApplicationForContract = {
  application_type?: string | null;
  application_number?: string | null;
  project_title?: string | null;
  terms_status?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  coordinates?: Json | null;
  internal_notes?: unknown;

  water_body_name?: string | null;
  water_source?: string | null;

  max_daily_volume_m3?: number | null;
  max_yearly_volume_m3?: number | null;
  estimated_usage_volume?: number | null;
  usage_unit?: string | null;
  water_taking_method?: string | null;

  proposed_duration_years?: number | null;
  assessor_recommended_volume_m3?: number | null;
  concession_area?: number | null;
  flow_rate_m3_per_second?: number | null;

  applicant?: {
    account_type?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    id_number?: string | null;
  } | null;
};

function getInternalNotes(application: ApplicationForContract): Record<string, any> | null {
  const notes = getEffectiveInternalNotes(application.internal_notes);
  return notes && typeof notes === "object" ? notes : null;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function areaHaFromGeometry(geometry: unknown): number | null {
  if (!geometry || typeof geometry !== "object") return null;
  const raw = geometry as { type?: unknown };
  if (raw.type !== "Polygon" && raw.type !== "MultiPolygon") return null;
  try {
    const areaSqMeters = turf.area({
      type: "Feature",
      properties: {},
      geometry: raw as any,
    });
    if (!Number.isFinite(areaSqMeters) || areaSqMeters <= 0) return null;
    return areaSqMeters / 10000;
  } catch {
    return null;
  }
}

function provinceLabelForContract(provinceRaw: string): string {
  const p = provinceRaw.trim();
  if (!p) return "N/A";
  if (p.toLowerCase() === "kigali") return "City of Kigali";
  return p; // e.g. Northern/Southern/Eastern/Western
}

function resolveApplicantName(application: ApplicationForContract): string {
  const accType = application.applicant?.account_type ?? null;
  if (accType === "individual") {
    const first = (application.applicant?.first_name ?? "").trim();
    const last = (application.applicant?.last_name ?? "").trim();
    const full = `${first} ${last}`.trim();
    return full || "N/A";
  }
  return (application.applicant?.company_name ?? "").trim() || "N/A";
}

function resolveOrganizationName(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.fullNameApplicant === "string" ? notes.fullNameApplicant.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = (application.applicant?.company_name ?? "").trim();
  if (fromUser) return fromUser;
  // Fallback to individual name if present
  return resolveApplicantName(application);
}

function resolveRepresentativeName(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nameRepresentative === "string" ? notes.nameRepresentative.trim() : "";
  if (fromNotes) return fromNotes;
  // Fallback: sometimes the user record still has first/last for an org account.
  const first = (application.applicant?.first_name ?? "").trim();
  const last = (application.applicant?.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || "N/A";
}

function resolveRepresentativeTitle(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes =
    typeof notes?.representativeTitle === "string"
      ? notes.representativeTitle.trim()
      : typeof notes?.representativePosition === "string"
        ? notes.representativePosition.trim()
        : "";
  return fromNotes || "Representative";
}

function resolveApplicantIdNumber(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nationalIdNumber === "string" ? notes.nationalIdNumber.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = typeof application.applicant?.id_number === "string" ? application.applicant.id_number.trim() : "";
  if (fromUser) return fromUser;
  return "N/A";
}

function resolveWaterSourceName(application: ApplicationForContract): string {
  // Assessor override (notes.nameSourceWater) wins over the column.
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nameSourceWater === "string" ? notes.nameSourceWater.trim() : "";
  if (fromNotes) return fromNotes;
  const waterBody = (application.water_body_name ?? "").trim();
  if (waterBody) return waterBody;
  const ws = (application.water_source ?? "").trim();
  if (!ws) return "N/A";
  return ws.replaceAll("_", " ");
}

function resolveWaterSourceAdminLocation(application: ApplicationForContract): {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
} {
  const notes = getInternalNotes(application);
  const province =
    typeof notes?.waterSourceProvince === "string" && notes.waterSourceProvince.trim()
      ? notes.waterSourceProvince.trim()
      : (application.province ?? "").trim() || "N/A";
  const district =
    typeof notes?.waterSourceDistrict === "string" && notes.waterSourceDistrict.trim()
      ? notes.waterSourceDistrict.trim()
      : (application.district ?? "").trim() || "N/A";
  const sector =
    typeof notes?.waterSourceSector === "string" && notes.waterSourceSector.trim()
      ? notes.waterSourceSector.trim()
      : (application.sector ?? "").trim() || "N/A";
  const cell =
    typeof notes?.waterSourceCell === "string" && notes.waterSourceCell.trim()
      ? notes.waterSourceCell.trim()
      : (application.cell ?? "").trim() || "N/A";
  const village =
    typeof notes?.waterSourceVillage === "string" && notes.waterSourceVillage.trim()
      ? notes.waterSourceVillage.trim()
      : (application.village ?? "").trim() || "N/A";
  return { province, district, sector, cell, village };
}

function resolveOfficeAdminLocation(application: ApplicationForContract): {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
} {
  const notes = getInternalNotes(application);
  const province =
    typeof notes?.officeProvince === "string" && notes.officeProvince.trim()
      ? notes.officeProvince.trim()
      : (application.province ?? "").trim() || "N/A";
  const district =
    typeof notes?.officeDistrict === "string" && notes.officeDistrict.trim()
      ? notes.officeDistrict.trim()
      : (application.district ?? "").trim() || "N/A";
  const sector =
    typeof notes?.officeSector === "string" && notes.officeSector.trim()
      ? notes.officeSector.trim()
      : (application.sector ?? "").trim() || "N/A";
  const cell =
    typeof notes?.officeCell === "string" && notes.officeCell.trim()
      ? notes.officeCell.trim()
      : "N/A";
  const village =
    typeof notes?.officeVillage === "string" && notes.officeVillage.trim()
      ? notes.officeVillage.trim()
      : "N/A";

  return { province, district, sector, cell, village };
}

function resolveActivityLabel(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  // Assessor override (notes.intendedActivities) wins when non-empty.
  const fromNotes = Array.isArray(notes?.intendedActivities)
    ? (notes!.intendedActivities as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  let intended: string[] = fromNotes;
  if (!intended.length && Array.isArray((application as any).intended_activities)) {
    intended = ((application as any).intended_activities as unknown[]).map(String).filter(Boolean);
  }
  if (!intended.length && typeof notes?.transferFormData?.waterPurpose === "string") {
    const tp = notes.transferFormData.waterPurpose.trim();
    if (tp) intended = [tp];
  }
  const primary = intended?.[0] ?? "";
  const labels: Record<string, string> = {
    fish_farming_lakes: "Fish farming in lakes",
    fish_farming_ponds: "Fish farming in ponds",
    irrigation: "Irrigation",
    water_supply: "Water Supply",
    industry: "Industry",
    industrial: "Industrial Use",
    coffee_washing: "Coffee Washing",
    electricity_generation: "Electricity Generation (Hydropower)",
    electricity: "Electricity Generation (Hydropower)",
    mining: "Mining",
    construction_of_dam: "Construction of Dam",
    construction_of_infrastructures: "Construction or installation of infrastructure",
    construction: "Construction",
    navigation: "Navigation",
    port_construction: "Port Construction",
    recreation_activities: "Recreational Activities",
    recreation: "Recreational Activities",
    gaz_extraction: "Gas Extraction",
    livestock: "Livestock",
    domestic: "Domestic Use",
    aquaculture: "Aquaculture",
    municipal_supply: "Municipal Water Supply",
    other: "Other",
    other_concession: "Other Water Concession Activities",
  };
  return labels[primary] || humanizeActivityCode(primary);
}

function humanizeActivityCode(code: string): string {
  if (!code) return "N/A";
  return code
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function resolveActivityLabelRw(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  // Assessor override (notes.intendedActivities) wins when non-empty.
  const fromNotes = Array.isArray(notes?.intendedActivities)
    ? (notes!.intendedActivities as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  let intended: string[] = fromNotes;
  if (!intended.length && Array.isArray((application as any).intended_activities)) {
    intended = ((application as any).intended_activities as unknown[]).map(String).filter(Boolean);
  }
  if (!intended.length && typeof notes?.transferFormData?.waterPurpose === "string") {
    const tp = notes.transferFormData.waterPurpose.trim();
    if (tp) intended = [tp];
  }
  const primary = intended?.[0] ?? "";
  // Each label is a full noun phrase that fits after "mu bikorwa" / "ibikorwa".
  // Kinyarwanda noun-class concord: verbs take "byo" (e.g. byo kuhira),
  // nouns take "bya" / "by'" (e.g. by'inganda).
  const labels: Record<string, string> = {
    fish_farming_lakes: "by'uburobyi mu biyaga",
    fish_farming_ponds: "by'uburobyi mu bidendezi",
    irrigation: "byo kuhira",
    water_supply: "byo gutanga amazi",
    industry: "by'inganda",
    industrial: "by'inganda",
    coffee_washing: "byo gusukura ikawa",
    electricity_generation: "byo gukora amashanyarazi",
    electricity: "byo gukora amashanyarazi",
    mining: "byo gucukura amabuye y'agaciro",
    construction_of_dam: "byo kubaka urugomero",
    construction_of_infrastructures: "byo kubaka cyangwa gushyiraho ibikorwa remezo",
    construction: "byo kubaka",
    navigation: "by'ubwogero",
    port_construction: "byo kubaka icyambu",
    recreation_activities: "byo kwidagadura",
    recreation: "byo kwidagadura",
    gaz_extraction: "byo gucukura gaze",
    livestock: "by'ubworozi",
    domestic: "byo gukoreshwa mu rugo",
    aquaculture: "by'ubworozi bw'amafi",
    municipal_supply: "byo gutanga amazi mu mijyi",
    other: "by'ibindi bisobanuwe",
    other_concession: "by'ibindi bisobanuwe",
  };
  return labels[primary] || humanizeActivityCodeRw(primary);
}

function humanizeActivityCodeRw(code: string): string {
  if (!code) return "by'ibindi";
  // Best-effort fallback: prefix with "byo" so any unmapped enum still renders
  // a syntactically plausible Kinyarwanda phrase. Add the new code to the
  // labels map above to get a properly translated phrase.
  return `byo ${code.replaceAll("_", " ")}`;
}

function resolveLatLng(application: ApplicationForContract): { lat: string; lng: string } {
  const notes = getInternalNotes(application);

  // Helper: attempt to parse a lat/lng pair from two raw values.
  const tryPair = (rawLat: unknown, rawLng: unknown): { lat: string; lng: string } | null => {
    const latStr = typeof rawLat === "string" ? rawLat.trim() : typeof rawLat === "number" ? String(rawLat) : "";
    const lngStr = typeof rawLng === "string" ? rawLng.trim() : typeof rawLng === "number" ? String(rawLng) : "";
    const latNum = latStr ? Number.parseFloat(latStr) : NaN;
    const lngNum = lngStr ? Number.parseFloat(lngStr) : NaN;
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: latNum.toFixed(6), lng: lngNum.toFixed(6) };
    }
    return null;
  };

  // Priority 1: assessor-approved adjustment from assessment report
  const assessorAdjustments = notes?._assessorAdjustments;
  const adjusted = tryPair(
    assessorAdjustments?.waterSourceLatitude,
    assessorAdjustments?.waterSourceLongitude,
  );
  if (adjusted) return adjusted;

  // Priority 2: top-level internal_notes (new-application form path)
  const p1 = tryPair(notes?.waterSourceLatitude, notes?.waterSourceLongitude);
  if (p1) return p1;

  // Priority 3: nested under permitDetails (renewal form path)
  const pd = notes?.permitDetails;
  if (pd && typeof pd === "object") {
    const p2 = tryPair((pd as any).waterSourceLatitude, (pd as any).waterSourceLongitude);
    if (p2) return p2;
  }

  // Priority 4: GeoJSON Point in the coordinates DB column
  const geom: any = application.coordinates as any;
  if (geom && geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lng, lat] = geom.coordinates;
    const p3 = tryPair(lat, lng);
    if (p3) return p3;
  }

  return { lat: "N/A", lng: "N/A" };
}

function resolveSystemTypeLabels(application: ApplicationForContract): {
  english: string;
  kinyarwanda: string;
} {
  const notes = getInternalNotes(application);

  // Helper: return the value only if it carries real information.
  // The application-utils save path stores "Not specified" as a sentinel
  // when waterAbstractionDetails is empty — treat that (and similar
  // placeholders) as blank so the priority chain keeps looking.
  const meaningful = (v: unknown): string =>
    typeof v === "string" &&
    v.trim() !== "" &&
    !/^not[_ ]specified$/i.test(v.trim()) &&
    v.trim().toLowerCase() !== "n/a"
      ? v.trim()
      : "";

  const rawMethod =
    // Assessor edit first — see resolveAbstractionMethodRaw in permit-text-data.
    meaningful(notes?.waterTakingMethod) ||
    meaningful(application.water_taking_method) ||
    meaningful(notes?.waterAbstractionDetails?.[0]?.abstractionMethod) ||
    meaningful(notes?.abstractionMethod) ||
    meaningful(notes?.transferFormData?.abstractionMethod);

  const normalized = rawMethod.toLowerCase();
  if (!normalized) {
    if (isGroundwaterApplication(application)) {
      return { english: "Pumping system", kinyarwanda: "gupompa" };
    }
    return { english: "N/A", kinyarwanda: "N/A" };
  }

  if (normalized.includes("pump")) {
    return { english: "Pumping system", kinyarwanda: "gupompa" };
  }
  if (normalized.includes("grav")) {
    return { english: "Gravity system", kinyarwanda: "gravity" };
  }
  if (normalized.includes("diversion") || normalized === "diversion_channel") {
    return { english: "Diversion Channel", kinyarwanda: "umuyoboro w'amazi" };
  }
  if (normalized.includes("dam") || normalized.includes("reservoir")) {
    return { english: "Dam/Reservoir", kinyarwanda: "ikidendezi/reservoir" };
  }
  if (normalized.includes("borehole")) {
    return { english: "Borehole", kinyarwanda: "iriba ryatobowe" };
  }
  if (normalized.includes("spring")) {
    return { english: "Spring Capture", kinyarwanda: "gufata amazi y'isoko" };
  }
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) {
    return { english: "Hand Dug Well", kinyarwanda: "iriba ryacukuwe n'intoki" };
  }

  const capitalizedMethod = rawMethod.trim().replace(/[_-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  return { english: capitalizedMethod, kinyarwanda: capitalizedMethod };
}

function hasActivity(application: ApplicationForContract, activity: string): boolean {
  const acts = Array.isArray((application as any).intended_activities)
    ? ((application as any).intended_activities as unknown[]).map(String)
    : [];
  if (acts.includes(activity)) return true;
  const notes = getInternalNotes(application);
  const noteActs = Array.isArray(notes?.intendedActivities)
    ? (notes.intendedActivities as unknown[]).map(String)
    : [];
  return noteActs.includes(activity);
}

function isGroundwaterApplication(application: ApplicationForContract): boolean {
  const notes = getInternalNotes(application);
  return notes?.methodOfWaterAbstraction === "groundwater";
}

function resolvePumpingRateM3Day(application: ApplicationForContract): number | undefined {
  const notes = getInternalNotes(application);
  const toNum = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return (
    toNum((notes?._assessorAdjustments as Record<string, any> | undefined)?.recommendedPumpingRateM3Day) ??
    toNum(notes?.waterAbstractionDetails?.[0]?.flowRate)
  );
}

function resolveVolumeLabel(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);

  // Groundwater: return pumping rate in m³/day (overrides all other logic)
  if (isGroundwaterApplication(application)) {
    const pr = resolvePumpingRateM3Day(application);
    if (pr !== undefined) return `${formatNumber(pr)} m³/day`;
  }

  // Priority 1: Assessor recommended volume from the field assessment report.
  // The assessor's recommended allocation is AUTHORITATIVE for the allocated
  // discharge — the contract must print the same value the permit prints
  // (lib/permit/permit-text-data.ts resolveVolumes). Application-supplied
  // values (including raw flow-rate fields) are fallbacks only.
  const assessorAdjustments = notes?._assessorAdjustments;
  if (typeof assessorAdjustments?.recommendedVolumeM3 === "number" &&
      Number.isFinite(assessorAdjustments.recommendedVolumeM3)) {
    return `${formatNumber(assessorAdjustments.recommendedVolumeM3)} m³/year`;
  }
  if (typeof application.assessor_recommended_volume_m3 === "number" &&
      Number.isFinite(application.assessor_recommended_volume_m3)) {
    return `${formatNumber(application.assessor_recommended_volume_m3)} m³/year`;
  }

  // Priority 2: Fall back to database fields (original applicant values)
  if (typeof application.max_yearly_volume_m3 === "number" && Number.isFinite(application.max_yearly_volume_m3)) {
    return `${formatNumber(application.max_yearly_volume_m3)} m³/year`;
  }
  if (typeof application.max_daily_volume_m3 === "number" && Number.isFinite(application.max_daily_volume_m3)) {
    return `${formatNumber(application.max_daily_volume_m3)} m³/day`;
  }
  if (typeof application.estimated_usage_volume === "number" && Number.isFinite(application.estimated_usage_volume)) {
    const unit = (application.usage_unit ?? "m³").trim() || "m³";
    return `${formatNumber(application.estimated_usage_volume)} ${unit}`;
  }

  // Priority 3: Check internal_notes for original form data
  const formVolume = notes?.waterAbstractionDetails?.[0]?.maxAverageYearly;
  if (typeof formVolume === "number" && Number.isFinite(formVolume)) {
    return `${formatNumber(formVolume)} m³/year`;
  }

  // Priority 4: Transfer form data fallback (manual permit transfers)
  const tfData = notes?.transferFormData;
  const tfVal = tfData?.waterAllowance ? parseFloat(String(tfData.waterAllowance)) : NaN;
  const tfUnit = String(tfData?.allowanceUnit || '').trim() || 'm³';
  if (Number.isFinite(tfVal) && tfVal > 0) {
    return `${formatNumber(tfVal)} ${tfUnit}`;
  }

  // Priority 5 (legacy last resort): raw flow-rate fields from the
  // application. These used to take priority over the assessor's recommended
  // allocation, which made the contract disagree with the permit — they are
  // kept only so very old applications with nothing but a flow rate don't
  // regress to "N/A".
  const dbFlowRate = application.flow_rate_m3_per_second;
  if (typeof dbFlowRate === "number" && Number.isFinite(dbFlowRate) && dbFlowRate > 0) {
    return `${formatNumber(dbFlowRate)} m³/s`;
  }
  const formFlowRate = notes?.waterAbstractionDetails?.[0]?.flowRate;
  if (typeof formFlowRate === "number" && Number.isFinite(formFlowRate) && formFlowRate > 0) {
    return `${formatNumber(formFlowRate)} m³/s`;
  }
  const tfFlowRate = notes?.transferFormData?.flowRate;
  if (typeof tfFlowRate === "number" && Number.isFinite(tfFlowRate) && tfFlowRate > 0) {
    return `${formatNumber(tfFlowRate)} m³/s`;
  }

  return "N/A";
}

function resolveDurationYears(
  application: ApplicationForContract,
  transferPermit?: TransferPermitContext | null,
): string {
  const notes = getInternalNotes(application);

  // Priority 1: Assessor recommended duration (from assessor adjustments)
  const assessorAdjustments = notes?._assessorAdjustments;
  if (typeof assessorAdjustments?.permitLengthYears === "number" &&
      Number.isFinite(assessorAdjustments.permitLengthYears) &&
      assessorAdjustments.permitLengthYears >= 1 &&
      assessorAdjustments.permitLengthYears <= 15) {
    return String(Math.round(assessorAdjustments.permitLengthYears));
  }

  // Priority 2a: Renewal — inherit the original permit's total duration (expiry − issue).
  // Source A: passed transferPermit context (system-generated permit renewals, DB row available)
  // Source B: permitDetails in internal_notes (manual/registry permit renewals, no DB row)
  if (isRenewalApplication(application)) {
    const parseD = (s: string | null | undefined) => {
      if (!s) return null;
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
    const issueDate  = parseD(transferPermit?.issue_date)  ?? parseD(notes?.permitDetails?.issuedDate);
    const expiryDate = parseD(transferPermit?.expiry_date) ?? parseD(notes?.permitDetails?.expiryDate);
    if (issueDate && expiryDate) {
      const years = Math.round(
        (expiryDate.getTime() - issueDate.getTime()) / (365.25 * 24 * 3600 * 1000),
      );
      if (years >= 1 && years <= 15) return String(years);
    }
  }

  // Priority 2b: Transfer — remaining validity of the transferred permit.
  if (isTransferApplication(application) && transferPermit?.expiry_date) {
    const expiry = new Date(`${transferPermit.expiry_date}T00:00:00Z`);
    if (!Number.isNaN(expiry.getTime())) {
      const years = Math.ceil(
        (expiry.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000),
      );
      if (years >= 1 && years <= 15) return String(years);
    }
  }

  // Priority 3: Database field (may have been updated by assessor)
  if (typeof application.proposed_duration_years === "number" &&
      Number.isFinite(application.proposed_duration_years)) {
    return String(Math.max(1, Math.round(application.proposed_duration_years)));
  }

  // Priority 4: Default
  return "5";
}

function resolveConcessionAreaLabel(
  application: ApplicationForContract,
  originalPermit?: TransferPermitContext | null,
): string {
  const notes = getInternalNotes(application);

  const assessorArea = parsePositiveNumber(notes?._assessorAdjustments?.recommendedVolumeM3);
  if (assessorArea) return `${formatNumber(assessorArea)} Ha`;

  // The assessor's field-verified boundary outranks the applicant's declared
  // area: when they adjusted the polygon without typing an explicit area, the
  // contract must state the area of the boundary the permit actually grants.
  if (notes) {
    const adjustedPolygon = notes._assessorAdjustments?.waterSourcePolygonPoints;
    if (Array.isArray(adjustedPolygon) && adjustedPolygon.length > 0) {
      const feature = polygonsToGeoJSON([adjustedPolygon]);
      if (feature) {
        const areaSqMeters = turf.area(feature as any);
        if (Number.isFinite(areaSqMeters) && areaSqMeters > 0) {
          return `${formatNumber(areaSqMeters / 10000)} Ha`;
        }
      }
    }
  }

  const dbValue = parsePositiveNumber(application.concession_area);
  if (dbValue) return `${formatNumber(dbValue)} Ha`;

  const geometryValue = areaHaFromGeometry(application.coordinates);
  if (geometryValue) return `${formatNumber(geometryValue)} Ha`;

  if (notes) {
    if (Array.isArray(notes.waterSourcePolygons) && notes.waterSourcePolygons.length > 0) {
      const feature = polygonsToGeoJSON(notes.waterSourcePolygons);
      if (feature) {
        const areaSqMeters = turf.area(feature as any);
        if (Number.isFinite(areaSqMeters) && areaSqMeters > 0) {
          return `${formatNumber(areaSqMeters / 10000)} Ha`;
        }
      }
    }

    if (Array.isArray(notes.waterSourceCoordinates) && notes.waterSourceCoordinates.length > 0) {
      const feature = polygonsToGeoJSON([notes.waterSourceCoordinates]);
      if (feature) {
        const areaSqMeters = turf.area(feature as any);
        if (Number.isFinite(areaSqMeters) && areaSqMeters > 0) {
          return `${formatNumber(areaSqMeters / 10000)} Ha`;
        }
      }
    }

    const fishHa = parsePositiveNumber(notes.fishLakeAreaHectares);
    if (fishHa) return `${formatNumber(fishHa)} Ha`;

    const recreationM2 = parsePositiveNumber(notes.recreationConcessionAreaM2);
    if (recreationM2) return `${formatNumber(recreationM2 / 10000)} Ha`;

    // Renewal form stores concession area under permitDetails
    const pdArea = parsePositiveNumber(notes.permitDetails?.concessionArea);
    if (pdArea) return `${formatNumber(pdArea)} Ha`;
  }

  // Fallback: inherit concession area from the original permit (renewals/transfers)
  const origArea = parsePositiveNumber(originalPermit?.concession_area);
  if (origArea) return `${formatNumber(origArea)} Ha`;

  return "N/A";
}

function isTransferApplication(application: ApplicationForContract): boolean {
  const appType = application.application_type;
  if (typeof appType === "string" && appType.toLowerCase() === "transfer") return true;
  const notes = getInternalNotes(application);
  return notes?.isTransfer === true;
}

/**
 * Build the English office-address sentence used in the contract template.
 * Cell and village are prepended only when set so existing applications without
 * those overrides keep producing the legacy "Sector, District, Province" string.
 */
function composeOfficeAddressEnglish(loc: {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
}, provinceLabel: string): string {
  const parts: string[] = [];
  if (loc.village && loc.village !== "N/A") parts.push(`${loc.village} Village`);
  if (loc.cell && loc.cell !== "N/A") parts.push(`${loc.cell} Cell`);
  parts.push(`${loc.sector} Sector`);
  parts.push(`${loc.district} District`);
  parts.push(provinceLabel);
  return parts.join(", ");
}

/** Kinyarwanda counterpart to {@link composeOfficeAddressEnglish}. */
function composeOfficeAddressKinyarwanda(loc: {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
}, provinceLabel: string): string {
  const parts: string[] = [];
  if (loc.village && loc.village !== "N/A") parts.push(`Umudugudu wa ${loc.village}`);
  if (loc.cell && loc.cell !== "N/A") parts.push(`Akagari ka ${loc.cell}`);
  parts.push(`Umurenge wa ${loc.sector}`);
  parts.push(`Akarere ka ${loc.district}`);
  parts.push(`Intara y' ${provinceLabel}`);
  return parts.join(", ");
}

function applyTransferOverlay(
  ctx: ContractPlaceholderContext,
  application: ApplicationForContract
): ContractPlaceholderContext {
  const notes = getInternalNotes(application);
  const tfd = notes?.transferFormData;
  if (!tfd || typeof tfd !== "object") return ctx;

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const transfereeName = str(tfd.transfereeName);
  const transfereeRepName = str(tfd.transfereeRepresentativeName);
  const transfereeRepTitle = str(tfd.transfereeRepresentativePosition) || str(tfd.transfereeTitlePosition);
  const transfereeProvince = str(tfd.transfereeAddressProvince);
  const transfereeDistrict = str(tfd.transfereeAddressDistrict);
  const transfereeSector = str(tfd.transfereeAddressSector);

  // Heuristic: transferee is an organization if a representative name was provided,
  // otherwise treat as an individual. The transfer form does not capture account_type.
  const isIndividual = transfereeRepName.length === 0;

  return {
    ...ctx,
    isIndividual,
    applicantName: transfereeName || ctx.applicantName,
    organizationName: transfereeName || ctx.organizationName,
    representativeName: transfereeRepName || (isIndividual ? transfereeName : ctx.representativeName),
    representativeTitle: transfereeRepTitle || (isIndividual ? "" : ctx.representativeTitle),
    // Transfer form does not collect the transferee's national ID number.
    applicantIdNumber: "N/A",
    // Addresses intentionally fall back to "N/A" rather than the transferor values —
    // the whole point of the overlay is to avoid leaking transferor data into the contract.
    officeProvinceLabel: transfereeProvince ? provinceLabelForContract(transfereeProvince) : "N/A",
    officeDistrict: transfereeDistrict || "N/A",
    officeSector: transfereeSector || "N/A",
    // Transfer form does not collect transferee cell/village.
    officeCell: "N/A",
    officeVillage: "N/A",
    officeAddressEnglish: composeOfficeAddressEnglish(
      {
        province: transfereeProvince || "N/A",
        district: transfereeDistrict || "N/A",
        sector: transfereeSector || "N/A",
        cell: "N/A",
        village: "N/A",
      },
      transfereeProvince ? provinceLabelForContract(transfereeProvince) : "N/A",
    ),
    officeAddressKinyarwanda: composeOfficeAddressKinyarwanda(
      {
        province: transfereeProvince || "N/A",
        district: transfereeDistrict || "N/A",
        sector: transfereeSector || "N/A",
        cell: "N/A",
        village: "N/A",
      },
      transfereeProvince ? provinceLabelForContract(transfereeProvince) : "N/A",
    ),
  };
}

export type TransferPermitContext = {
  permit_number?: string | null;
  expiry_date?: string | null;
  issue_date?: string | null;
  concession_area?: number | null;
};

function isRenewalApplication(application: ApplicationForContract): boolean {
  const appType = application.application_type;
  if (typeof appType === "string" && appType.toLowerCase() === "renewal") return true;
  const notes = getInternalNotes(application);
  return notes?.isRenewal === true;
}

function isModificationApplication(application: ApplicationForContract): boolean {
  const appType = application.application_type;
  if (typeof appType === "string" && appType.toLowerCase() === "modification") return true;
  const notes = getInternalNotes(application);
  return notes?.isModification === true;
}

export function buildContractPlaceholderContext(
  application: ApplicationForContract,
  applicationNumber?: string,
  transferPermit?: TransferPermitContext | null,
): ContractPlaceholderContext {
  const waterSourceLocation = resolveWaterSourceAdminLocation(application);
  const officeLocation = resolveOfficeAdminLocation(application);
  const { lat, lng } = resolveLatLng(application);
  const systemType = resolveSystemTypeLabels(application);
  const isIndividual = (application.applicant?.account_type ?? null) === "individual";
  const appNo = (applicationNumber ?? "").trim();
  const transferredPermitNumber =
    (isTransferApplication(application) || isRenewalApplication(application) || isModificationApplication(application)) &&
    typeof transferPermit?.permit_number === "string"
      ? transferPermit.permit_number.trim()
      : "";
  const contractNumber = (() => {
    // For transfers/renewals/modifications passed via prop, the contract reuses the existing permit number.
    if (transferredPermitNumber) return transferredPermitNumber;
    // For renewals / modifications / transfers, the original permit number is
    // stored in internal_notes — resolve it via the shared 6-key chain (it may
    // live under permitReference.registrySnapshot / transferFormData for
    // manually-captured or registry permits, not just originalPermitNumber), so
    // the contract shows the real permit number instead of an app-derived one.
    if (
      isRenewalApplication(application) ||
      isModificationApplication(application) ||
      isTransferApplication(application)
    ) {
      const original = resolveOriginalPermitNumber(getInternalNotes(application));
      if (original) return original;
    }
    if (!appNo) return "N/A";
    // Common format: "RWB-2025-000025" -> "000025/RWB/2025"
    const m = appNo.match(/^RWB-(\d{4})-(\d+)$/i);
    if (!m) return "N/A";
    const year = m[1];
    const seq = m[2].padStart(6, "0");
    return `${seq}/RWB/${year}`;
  })();
  const baseCtx: ContractPlaceholderContext = {
    applicationNumber: (applicationNumber ?? "").trim() || "N/A",
    contractNumber,
    isIndividual,
    applicantName: resolveApplicantName(application),
    applicantIdNumber: resolveApplicantIdNumber(application),
    organizationName: resolveOrganizationName(application),
    representativeName: resolveRepresentativeName(application),
    representativeTitle: resolveRepresentativeTitle(application),
    officeProvinceLabel: provinceLabelForContract(officeLocation.province),
    officeDistrict: officeLocation.district,
    officeSector: officeLocation.sector,
    officeCell: officeLocation.cell,
    officeVillage: officeLocation.village,
    officeAddressEnglish: composeOfficeAddressEnglish(
      officeLocation,
      provinceLabelForContract(officeLocation.province),
    ),
    officeAddressKinyarwanda: composeOfficeAddressKinyarwanda(
      officeLocation,
      provinceLabelForContract(officeLocation.province),
    ),
    waterSourceName: resolveWaterSourceName(application),
    provinceLabel: provinceLabelForContract(waterSourceLocation.province),
    district: waterSourceLocation.district,
    sector: waterSourceLocation.sector,
    cell: waterSourceLocation.cell,
    village: waterSourceLocation.village,
    lat,
    lng,
    volumeLabel: resolveVolumeLabel(application),
    isGroundwater: isGroundwaterApplication(application),
    durationYearsLabel: resolveDurationYears(application, transferPermit),
    concessionAreaLabel: resolveConcessionAreaLabel(application, transferPermit),
    activityLabel: resolveActivityLabel(application),
    activityLabelRw: resolveActivityLabelRw(application),
    systemTypeEnglish: systemType.english,
    systemTypeKinyarwanda: systemType.kinyarwanda,
  };

  if (isTransferApplication(application)) {
    return applyTransferOverlay(baseCtx, application);
  }
  return baseCtx;
}

export function fillContractText(raw: string, ctx: ContractPlaceholderContext): string {
  let s = raw;

  // Application
  s = s.replaceAll("{{APPLICATION_NUMBER}}", ctx.applicationNumber);
  s = s.replaceAll("{{CONTRACT_NUMBER}}", ctx.contractNumber);
  s = s.replaceAll("{{APPLICANT_NAME}}", ctx.applicantName);
  s = s.replaceAll("{{APPLICANT_ID}}", ctx.applicantIdNumber);
  s = s.replaceAll("{{ORGANIZATION_NAME}}", ctx.organizationName);
  s = s.replaceAll("{{REPRESENTATIVE_NAME}}", ctx.representativeName);
  s = s.replaceAll("{{REPRESENTATIVE_TITLE}}", ctx.representativeTitle);
  s = s.replaceAll("{{OFFICE_PROVINCE_LABEL}}", ctx.officeProvinceLabel);
  s = s.replaceAll("{{OFFICE_DISTRICT}}", ctx.officeDistrict);
  s = s.replaceAll("{{OFFICE_SECTOR}}", ctx.officeSector);
  s = s.replaceAll("{{OFFICE_CELL}}", ctx.officeCell);
  s = s.replaceAll("{{OFFICE_VILLAGE}}", ctx.officeVillage);
  s = s.replaceAll("{{OFFICE_ADDRESS_EN}}", ctx.officeAddressEnglish);
  s = s.replaceAll("{{OFFICE_ADDRESS_RW}}", ctx.officeAddressKinyarwanda);
  s = s.replaceAll("{{WATER_SOURCE_NAME}}", ctx.waterSourceName);
  s = s.replaceAll("{{PROVINCE_LABEL}}", ctx.provinceLabel);
  s = s.replaceAll("{{DISTRICT}}", ctx.district);
  s = s.replaceAll("{{SECTOR}}", ctx.sector);
  s = s.replaceAll("{{CELL}}", ctx.cell);
  s = s.replaceAll("{{VILLAGE}}", ctx.village);
  s = s.replaceAll("{{LAT}}", ctx.lat);
  s = s.replaceAll("{{LNG}}", ctx.lng);
  s = s.replaceAll("{{VOLUME_LABEL}}", ctx.volumeLabel);
  s = s.replaceAll("{{DURATION_YEARS}}", ctx.durationYearsLabel);
  s = s.replaceAll("{{CONCESSION_AREA}}", ctx.concessionAreaLabel);
  s = s.replaceAll("{{ACTIVITY_LABEL}}", ctx.activityLabel);
  s = s.replaceAll("{{SYSTEM_TYPE_EN}}", ctx.systemTypeEnglish);
  s = s.replaceAll("{{SYSTEM_TYPE_RW}}", ctx.systemTypeKinyarwanda);

  // Applicant
  s = s.replaceAll("NAME OF APPLICANT", ctx.applicantName);
  s = s.replaceAll("Name of applicant", ctx.applicantName);
  s = s.replaceAll("IZINA RY’USABA", ctx.applicantName);
  s = s.replaceAll("IZINA RY'USABA", ctx.applicantName);
  // Replace ID-number placeholders ONLY when the surrounding text indicates an ID field.
  // Avoid a global X{6,} replacement because templates also use XXXXXX for non-ID placeholders (e.g. water source).
  s = s.replace(
    /(with\s+ID\s+No\.?\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(with\s+ID\s+Number:?\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(Nomero y[’']?\s+Indangamuntu:\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(Nimero y[’']?\s+Indangamuntu:\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replaceAll("“XXXXX (IZINA RY’USABA)”", `“${ctx.applicantName}”`);
  s = s.replaceAll("\"XXXXX (IZINA RY’USABA)\"", `"${ctx.applicantName}"`);
  s = s.replaceAll("“XXXXX (IZINA RY'USABA)”", `“${ctx.applicantName}”`);
  s = s.replaceAll("\"XXXXX (IZINA RY'USABA)\"", `"${ctx.applicantName}"`);

  // Organization + representative
  s = s.replaceAll(
    "“XXXXX (NAME OF ORGANIZATION)”, with its registered office address as follows: XXX Sector, XXX District, XXX Province; represented by XXXX (NAME OF REPRESENTATIVE) “TITLE OF REPRESENTATIVE”, and hereafter referred to as the (“Water User”) on the other hand;",
    `“${ctx.organizationName}”, with its registered office address as follows: ${ctx.officeAddressEnglish}; represented by ${ctx.representativeName} “${ctx.representativeTitle}”, and hereafter referred to as the (“Water User”) on the other hand;`
  );
  s = s.replaceAll(
    "“(IZINA RY’ IKIGO/KOPERATIVE/ IKOMPANYI N’IBINDI CYASABYE)”, ifite ibiro biherereye mu Umurenge wa XXXXX, Akarere ka XXXX, Intara y' XXXX; ihagarariwe na XXX (IZINA RY’UHAGARARIYE IKIGO “ICYO ASHINZWE”, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
    `“${ctx.organizationName}”, ifite ibiro biherereye mu ${ctx.officeAddressKinyarwanda}; ihagarariwe na ${ctx.representativeName} “${ctx.representativeTitle}”, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;`
  );
  s = s.replaceAll("NAME OF APPLIED ORGANIZATION", ctx.organizationName);
  s = s.replaceAll("NAME OF ORGANIZATION", ctx.organizationName);
  s = s.replaceAll("IZINA RY’ IKIGO/KOPERATIVE/ IKOMPANYI N’IBINDI CYASABYE", ctx.organizationName);
  s = s.replaceAll("IZINA RY' IKIGO/KOPERATIVE/ IKOMPANYI N'IBINDI CYASABYE", ctx.organizationName);
  s = s.replaceAll("NAME OF REPRESENTATIVE", ctx.representativeName);
  s = s.replaceAll("IZINA RY’UHAGARARIYE IKIGO", ctx.representativeName);
  s = s.replaceAll("IZINA RY'UHAGARARIYE IKIGO", ctx.representativeName);
  s = s.replaceAll("TITLE/ POSITION", ctx.representativeTitle);
  s = s.replaceAll("TITLE OF REPRESENTATIVE", ctx.representativeTitle);
  s = s.replaceAll("POSITION", ctx.representativeTitle);
  s = s.replaceAll("ICYO ASHINZWE", ctx.representativeTitle);

  // Water source
  s = s.replaceAll("NAME OF WATER SOURCE", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY’ISOKO Y’AMAZI", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY'ISOKO Y'AMAZI", ctx.waterSourceName);
  // Some templates include a space after the apostrophe: "IZINA RY’ ISOKO..."
  s = s.replaceAll("IZINA RY’ ISOKO Y’AMAZI", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY' ISOKO Y'AMAZI", ctx.waterSourceName);
  s = s.replaceAll("(NAME OF WATER SOURCE)", ctx.waterSourceName);
  s = s.replaceAll("NAME OF LAKE", ctx.waterSourceName);
  s = s.replaceAll("NAME OF THE LAKE", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY’IKIYAGA", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY'IKIYAGA", ctx.waterSourceName);

  // Location placeholders (English)
  s = s.replaceAll("XXX Province", `${ctx.provinceLabel}`);
  s = s.replaceAll("XXXX Province", `${ctx.provinceLabel}`);
  s = s.replaceAll("XXX District", `${ctx.district}`);
  s = s.replaceAll("XXXX District", `${ctx.district}`);
  s = s.replaceAll("XXX Sector", `${ctx.sector}`);
  s = s.replaceAll("XXXX Sector", `${ctx.sector}`);
  s = s.replaceAll("XXX Cell", `${ctx.cell}`);
  s = s.replaceAll("XXXX Cell", `${ctx.cell}`);
  s = s.replaceAll("XXX Village", `${ctx.village}`);
  s = s.replaceAll("XXXX Village", `${ctx.village}`);
  s = s.replaceAll("XXXX Sector", `${ctx.sector}`);

  // Location placeholders (Kinyarwanda)
  s = s.replaceAll("Intara y' XXX", `Intara y' ${ctx.provinceLabel}`);
  s = s.replaceAll("Intara y’ XXX", `Intara y’ ${ctx.provinceLabel}`);
  s = s.replaceAll("Akarere ka XXX", `Akarere ka ${ctx.district}`);
  s = s.replaceAll("Umurenge wa XXX", `Umurenge wa ${ctx.sector}`);
  s = s.replaceAll("Umurenge wa XXXX", `Umurenge wa ${ctx.sector}`);
  s = s.replaceAll("Akagari ka XXX", `Akagari ka ${ctx.cell}`);
  s = s.replaceAll("Umudugudu w’ XXX", `Umudugudu w’ ${ctx.village}`);
  s = s.replaceAll("Umudugudu w' XXX", `Umudugudu w' ${ctx.village}`);

  // Coordinates
  s = s.replace(
    /Latitude:\s*[-0-9.]+°,\s*Longitude:\s*[-0-9.]+°/g,
    `Latitude: ${ctx.lat}°, Longitude: ${ctx.lng}°`
  );
  s = s.replace(
    /Latitide\s*\(Latitude\):\s*[-0-9.]+°,\s*Lonjitide\s*\(Longitude\):\s*[-0-9.]+°/g,
    `Latitide (Latitude): ${ctx.lat}°, Lonjitide (Longitude): ${ctx.lng}°`
  );

  // Water abstraction method
  s = s.replace(/by\s+Gravity\s+of\s+Pumping system/gi, `by ${ctx.systemTypeEnglish}`);
  s = s.replace(/by\s+Gravity\s+or\s+pumping system/gi, `by ${ctx.systemTypeEnglish}`);
  s = s.replace(/hakoreshejwe uburyo bwa\s+gravity cyangwa pumping/gi, `hakoreshejwe uburyo bwa ${ctx.systemTypeKinyarwanda}`);

  // Volume / flow rate
  s = s.replace(/flow rate of\s+XXX\s+m3\/year\s+OR\s+m3\/day/gi, `flow rate of ${ctx.volumeLabel}`);
  s = s.replace(/flow rate of\s+XXXX\s+m3\/day\s+OR\s+m3\/year/gi, `flow rate of ${ctx.volumeLabel}`);

  // Groundwater: relabel "flow rate" → "pumping rate" AFTER all flow-rate value substitutions
  // (both the {{VOLUME_LABEL}} token and the legacy "flow rate of XXX …" literals) so those
  // replacements still match. Running it earlier breaks the legacy regex and leaves XXX.
  if (ctx.isGroundwater) {
    s = s.replace(/flow rate of/gi, "pumping rate of");
    // Groundwater is abstracted from a borehole — "abstract water" → "abstract ground water".
    s = s.replace(/abstract water from/gi, "abstract ground water from");
  }
  s = s.replace(/angana na m3\s+XXX\s+ku mwaka/gi, `angana na ${ctx.volumeLabel.replaceAll("m³", "m3")} ku mwaka`);
  s = s.replace(/angana na\s+m³?\s+XXX\s+ku munsi/gi, `angana na ${ctx.volumeLabel.replaceAll("m³", "m3")} ku munsi`);

  // Duration
  s = s.replace(/period of\s+XXX\s+\(Number\)\s+years/gi, `period of ${ctx.durationYearsLabel} years`);
  s = s.replace(/IN LETTER AND NUMBER\s*\(XXX\)\s*years/gi, `${ctx.durationYearsLabel} years`);
  s = s.replace(/period of\s+XXXX\s+\(NUMBER\)\s+years/gi, `period of ${ctx.durationYearsLabel} years`);
  s = s.replace(/imyaka\s+XXXX\s+\(IMYAKA URUHUSHYA RUZAMARA\)/gi, `imyaka ${ctx.durationYearsLabel}`);
  s = s.replace(/imyaka\s+XXX\s+\(IGIHE URUHUSHYA RUZAMARA\)/gi, `imyaka ${ctx.durationYearsLabel}`);

  // Concession area + activity
  s = s.replaceAll("XXXHa", ctx.concessionAreaLabel);
  s = s.replaceAll("XXX Ha", ctx.concessionAreaLabel);
  s = s.replaceAll("Hegitari XXX", ctx.concessionAreaLabel);
  s = s.replaceAll("NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR", ctx.activityLabel);
  s = s.replaceAll("NAME OF ACTIVITIES APPLIED FOR", ctx.activityLabel);
  // Swallow surrounding parens because activityLabelRw already carries its
  // concord prefix (e.g. "by'inganda") and parens read awkwardly in the
  // rendered Kinyarwanda contract. Then handle the bare placeholder as a
  // fallback for any template that doesn't wrap it.
  s = s.replaceAll("(IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA)", ctx.activityLabelRw);
  s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabelRw);

  // Lake cleanup: remove stray "XXXX" next to "Lake" after we’ve filled the lake name.
  // e.g. "Lake XXXX <name>" -> "Lake <name>"
  s = s.replace(/Lake\s+XXXX\s+(?=\S)/g, "Lake ");
  // e.g. "XXXX Lake <name>" -> "<name>"
  s = s.replace(/XXXX\s+Lake\s+(?=\S)/g, "");
  // Collapse accidental duplicates like "<name> <name>" in some templates
  if (ctx.waterSourceName && ctx.waterSourceName !== "N/A") {
    const escaped = ctx.waterSourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dup = new RegExp(`(${escaped})\\s+\\1`, "g");
    s = s.replace(dup, "$1");
  }

  // Signature placeholder used in some Kinyarwanda templates
  s = s.replaceAll("XXXX (Usaba y’ Usaba uruhushya)", ctx.applicantName);

  // Fix a common template typo: "water from XXXX (NAME OF ACTIVITIES APPLIED FOR)" should reference water source.
  s = s.replace(/water from\s+XXXX\s+\(NAME OF ACTIVITIES APPLIED FOR\)/gi, `water from ${ctx.waterSourceName}`);

  // Strip leftover X-prefixed placeholders around values we have already filled.
  // Example: "XXXX (test)" -> "test", "XXXXX (Acme Ltd)" -> "Acme Ltd"
  function stripXPrefixAroundValue(value: string) {
    const v = (value ?? "").trim();
    if (!v) return;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Matches: XXXX(<value>) or XXXX (<value>) with any 3+ X's.
    const re = new RegExp(`\\bX{3,}\\s*\\(\\s*${escaped}\\s*\\)`, "g");
    s = s.replace(re, v);
  }

  function stripXPrefixBeforeValue(value: string) {
    const v = (value ?? "").trim();
    if (!v || v === "N/A") return;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\bX{1,}(?=${escaped}\\b)`, "g");
    s = s.replace(re, "");
  }

  stripXPrefixAroundValue(ctx.waterSourceName);
  stripXPrefixAroundValue(ctx.applicantName);
  stripXPrefixAroundValue(ctx.organizationName);
  stripXPrefixAroundValue(ctx.representativeName);
  stripXPrefixAroundValue(ctx.activityLabel);
  stripXPrefixAroundValue(ctx.activityLabelRw);
  stripXPrefixBeforeValue(ctx.waterSourceName);
  stripXPrefixBeforeValue(ctx.applicantName);
  stripXPrefixBeforeValue(ctx.organizationName);
  stripXPrefixBeforeValue(ctx.representativeName);
  stripXPrefixBeforeValue(ctx.provinceLabel);
  stripXPrefixBeforeValue(ctx.district);
  stripXPrefixBeforeValue(ctx.sector);
  stripXPrefixBeforeValue(ctx.cell);
  stripXPrefixBeforeValue(ctx.village);

  // ── Groundwater-only Kinyarwanda rewrites ─────────────────────────────────
  // Run AFTER all token substitutions and X-prefix cleanup so the water-source
  // name and volume value are already in their final resolved form.
  // Surface-water sentences are byte-unchanged by this block (block is skipped).
  if (ctx.isGroundwater) {
    // Strip "borehole" or leading "Nayikondo ya" from a source name so the
    // rendered phrase reads cleanly as "Nayikondo ya <name>" without duplication.
    const gwSourceClean = (raw: string): string =>
      raw
        .replace(/\s*\bborehole\b/gi, "")
        .replace(/^\s*Nayikondo\s+ya\s*/i, "")
        .trim() || raw.trim();

    // VALUE (abstraction_individual legacy template):
    // After line ~1030 the string reads "angana na 19 m3/day ku mwaka"
    // → "angana na m3 19 ku munsi"  (unit before number, ku munsi)
    s = s.replace(
      /\bangana na ([\d,.]+)\s+m3\/day\s+ku mwaka/gi,
      (_, n) => `angana na m3 ${n} ku munsi`,
    );
    // VALUE (abstraction_organization modern template):
    // After {{VOLUME_LABEL}} substitution the string reads "ku gipimo cya 19 m³/day"
    // → "ku gipimo cya m3 19 ku munsi"
    s = s.replace(
      /ku gipimo cya ([\d,.]+)\s+m[³3]\/day/gi,
      (_, n) => `ku gipimo cya m3 ${n} ku munsi`,
    );
    // LOCATION (abstraction_individual legacy):
    // "ava mu <source> gaherereye mu" → "ava muri Nayikondo ya <source> iherereye mu"
    s = s.replace(
      /ava mu ([^,]+?)\s+gaherereye mu\b/g,
      (_, src) => `ava muri Nayikondo ya ${gwSourceClean(src)}, iherereye mu`,
    );
    // LOCATION (abstraction_organization modern):
    // "ava mu <source> mu gice cyacyo giherereye" → "ava muri Nayikondo ya <source>, iherereye"
    s = s.replace(
      /ava mu ([^,]+?)\s+mu gice cyacyo giherereye/g,
      (_, src) => `ava muri Nayikondo ya ${gwSourceClean(src)}, iherereye`,
    );
  }

  return s;
}


