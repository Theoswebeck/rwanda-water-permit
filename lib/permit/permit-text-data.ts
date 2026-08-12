/**
 * Pure data helpers used by the permit PDF renderer (`lib/pdf-permit-server.ts`)
 * and the document-slots catalogue (`lib/document-slots/permit-slots.ts`).
 *
 * "Pure" means: no PDFKit, no Node-only fs/path imports, no async I/O. Just
 * functions that take an application object + render options and return the
 * exact strings the permit emits today.
 *
 * Lifted verbatim from `lib/pdf-permit-server.ts` so the renderer and the
 * slot catalogue share one source of truth — bug fixes here flow to both.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4.4
 */

import { getEffectiveInternalNotes } from "@/lib/document-overrides";

// ─── Number / date helpers ───────────────────────────────────────────────────

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtDMY(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtNum(n: number, maxDec = 2): string {
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: isInt ? 0 : maxDec,
    minimumFractionDigits: 0,
  }).format(n);
}

// ─── Application shape used by the resolvers ─────────────────────────────────

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
  /** GeoJSON geometry from applications.coordinates (when the caller selects it). */
  coordinates?: unknown;
  proposed_duration_years?: number;
  assessor_recommended_volume_m3?: number;
  max_daily_volume_m3?: number;
  max_yearly_volume_m3?: number;
  internal_notes?: string;
  water_taking_method?: string;
  is_bulk?: boolean;
  bulk_networks?: unknown[];
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

export function resolveNotes(app: PermitApplication): ReturnType<typeof getEffectiveInternalNotes> {
  return getEffectiveInternalNotes(app.internal_notes);
}

// ─── Identity / location resolvers ───────────────────────────────────────────

export function resolveApplicantName(app: PermitApplication): string {
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

export function resolveIdNumber(app: PermitApplication): string {
  const notes = resolveNotes(app);
  return (notes?.nationalIdNumber as string)?.trim()
    || app.applicant?.id_number?.trim()
    || "N/A";
}

export function resolveWaterSourceName(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const override = typeof notes?.nameSourceWater === "string" ? notes.nameSourceWater.trim() : "";
  if (override) return override;
  // Some legacy applications carry water_body_name not declared on the type;
  // accept it loosely.
  const wbn = (app as unknown as { water_body_name?: string }).water_body_name;
  if (wbn) return wbn;
  return (app.water_source || "N/A").replaceAll("_", " ");
}

export function resolveLakeName(app: PermitApplication): string {
  const name = resolveWaterSourceName(app);
  if (!name || name === "N/A") return "N/A";
  return /\blake\b/i.test(name) ? name : `${name} Lake`;
}

export function resolveAdminLocation(app: PermitApplication): {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
} {
  const notes = resolveNotes(app);
  return {
    province: (notes?.waterSourceProvince as string)?.trim() || app.province || "N/A",
    district: (notes?.waterSourceDistrict as string)?.trim() || app.district || "N/A",
    sector: (notes?.waterSourceSector as string)?.trim() || app.sector || "N/A",
    cell: (notes?.waterSourceCell as string)?.trim() || app.cell || "N/A",
    village: (notes?.waterSourceVillage as string)?.trim() || app.village || "N/A",
  };
}

export function fmtProvince(raw: string): string {
  if (!raw) return "N/A";
  return raw.toLowerCase() === "kigali" ? "CITY OF KIGALI" : `${raw} Province`;
}

export function formatProvinceOrCityOfKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  return provinceRaw.toLowerCase() === "kigali" ? "City OF Kigali" : `${provinceRaw} Province`;
}

export function formatIntaraOrUmujyiWaKigali(provinceRaw: string): string {
  if (!provinceRaw) return "N/A";
  const key = provinceRaw
    .trim()
    .toLowerCase()
    .replace(/\s+province$/i, "")
    .replace(/^province\s+of\s+/i, "")
    .trim();
  const provinces: Record<string, string> = {
    east: "Intara y'Iburasirazuba",
    eastern: "Intara y'Iburasirazuba",
    iburasirazuba: "Intara y'Iburasirazuba",
    west: "Intara y'Iburengerazuba",
    western: "Intara y'Iburengerazuba",
    iburengerazuba: "Intara y'Iburengerazuba",
    north: "Intara y'Amajyaruguru",
    northern: "Intara y'Amajyaruguru",
    amajyaruguru: "Intara y'Amajyaruguru",
    south: "Intara y'Amajyepfo",
    southern: "Intara y'Amajyepfo",
    amajyepfo: "Intara y'Amajyepfo",
    kigali: "Umujyi wa Kigali",
    "city of kigali": "Umujyi wa Kigali",
    "umujyi wa kigali": "Umujyi wa Kigali",
  };
  return provinces[key] ?? `Intara ya ${provinceRaw.trim()}`;
}

export function resolveArea(app: PermitApplication): number | null {
  const notes = resolveNotes(app);
  const assessorArea = notes?._assessorAdjustments?.recommendedVolumeM3;
  if (typeof assessorArea === "number" && Number.isFinite(assessorArea) && assessorArea > 0) return assessorArea;
  if (typeof app.concession_area === "number" && Number.isFinite(app.concession_area)) return app.concession_area;
  if (typeof notes?.concessionArea === "number") return notes.concessionArea;
  if (typeof notes?.fishLakeAreaHectares === "number") return notes.fishLakeAreaHectares;
  if (typeof notes?.permitDetails?.concessionArea === "number") return notes.permitDetails.concessionArea;
  return null;
}

// ─── Activity / volume resolvers ─────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  irrigation: "Irrigation", water_supply: "Water Supply",
  fish_farming_lakes: "Fish farming in lakes", fish_farming_ponds: "Fish farming in ponds",
  industry: "Industry", coffee_washing: "Coffee Washing",
  electricity_generation: "Electricity Generation (Hydropower)", mining: "Mining",
  construction_of_dam: "Construction of Dam",
  construction_of_infrastructures: "Construction or installation of infrastructure",
  navigation: "Navigation", recreation_activities: "Recreational Activities",
  port_construction: "Port Construction",
  gaz_extraction: "Gas Extraction", livestock: "Livestock", other: "Other",
  other_concession: "Other Water Concession Activities",
};

export function resolveActivities(app: PermitApplication): string {
  let acts: string[] = [];
  const notes = resolveNotes(app);
  const fromNotes = notes?.intendedActivities;
  if (Array.isArray(fromNotes)) {
    const cleaned = fromNotes.map(String).map((s) => s.trim()).filter(Boolean);
    if (cleaned.length) acts = cleaned;
  }
  if (!acts.length && Array.isArray(app.intended_activities)) {
    acts = app.intended_activities.map(String).filter(Boolean);
  }
  if (!acts.length && typeof notes?.transferFormData?.waterPurpose === "string") {
    const tp = notes.transferFormData.waterPurpose.trim();
    if (tp) acts = [tp];
  }
  if (acts.length) return acts.map((a) => ACTIVITY_LABELS[a] || a).join(", ");
  const purpose = app.water_purpose?.trim();
  if (purpose) return ACTIVITY_LABELS[purpose] || purpose.replaceAll("_", " ");
  return app.application_type?.trim().replaceAll("_", " ") || "N/A";
}

export function resolveLatLng(app: PermitApplication): { lat: string; lng: string } {
  const notes = resolveNotes(app);
  const tryPair = (latVal: unknown, lngVal: unknown): { lat: string; lng: string } | null => {
    const lat = typeof latVal === "number" ? latVal : typeof latVal === "string" ? parseFloat(latVal) : NaN;
    const lng = typeof lngVal === "number" ? lngVal : typeof lngVal === "string" ? parseFloat(lngVal) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
    return null;
  };
  const assessorAdjustments = notes?._assessorAdjustments;
  const adjusted = tryPair(
    assessorAdjustments?.waterSourceLatitude,
    assessorAdjustments?.waterSourceLongitude,
  );
  if (adjusted) return adjusted;
  const fromNotes = tryPair(notes?.waterSourceLatitude, notes?.waterSourceLongitude);
  if (fromNotes) return fromNotes;
  // Renewal forms store the coordinates under permitDetails — same fallback
  // the contract uses (lib/contract-placeholders.ts resolveLatLng), so the
  // permit and the contract print identical water-source coordinates.
  const pd = notes?.permitDetails;
  if (pd && typeof pd === "object") {
    const fromDetails = tryPair(
      (pd as Record<string, unknown>).waterSourceLatitude,
      (pd as Record<string, unknown>).waterSourceLongitude,
    );
    if (fromDetails) return fromDetails;
  }
  // GeoJSON Point in the applications.coordinates column (application data).
  const geom = app.coordinates as { type?: unknown; coordinates?: unknown } | null | undefined;
  if (
    geom &&
    geom.type === "Point" &&
    Array.isArray(geom.coordinates) &&
    geom.coordinates.length >= 2
  ) {
    const [lng, lat] = geom.coordinates as [unknown, unknown];
    const fromGeom = tryPair(lat, lng);
    if (fromGeom) return fromGeom;
  }
  return { lat: "N/A", lng: "N/A" };
}

export function resolveAbstractionMethodRaw(app: PermitApplication): string {
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

export function resolveSystemType(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const normalized = raw.toLowerCase();
  if (!normalized) return resolveIsGroundwater(app) ? "PUMPING SYSTEM" : "GRAVITY SYSTEM";
  if (normalized.includes("pump")) return "PUMPING SYSTEM";
  if (normalized.includes("grav")) return "GRAVITY SYSTEM";
  if (normalized.includes("diversion") || normalized === "diversion_channel") return "DIVERSION CHANNEL";
  if (normalized.includes("dam") || normalized.includes("reservoir")) return "DAM/RESERVOIR";
  if (normalized.includes("borehole")) return "BOREHOLE";
  if (normalized.includes("spring")) return "SPRING CAPTURE";
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) return "HAND DUG WELL";
  return raw.replace(/[_-]/g, " ").toUpperCase() || "GRAVITY SYSTEM";
}

export function resolveEnglishSystemLabel(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const normalized = raw.toLowerCase();
  if (!normalized) return resolveIsGroundwater(app) ? "PUMPING system" : "GRAVITY system";
  if (normalized.includes("pump")) return "PUMPING system";
  if (normalized.includes("grav")) return "GRAVITY system";
  if (normalized.includes("diversion") || normalized === "diversion_channel") return "Diversion Channel";
  if (normalized.includes("dam") || normalized.includes("reservoir")) return "Dam/Reservoir";
  if (normalized.includes("borehole")) return "Borehole";
  if (normalized.includes("spring")) return "Spring Capture";
  if (normalized.includes("hand") || (normalized.includes("dug") && normalized.includes("well"))) return "Hand Dug Well";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GRAVITY system";
}

export function resolveIsGroundwater(app: PermitApplication): boolean {
  const notes = resolveNotes(app);
  return (notes as any)?.methodOfWaterAbstraction === "groundwater";
}

export function resolvePumpingRateM3Day(app: PermitApplication): number | undefined {
  const notes = resolveNotes(app);
  const toNum = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return (
    toNum((notes as any)?._assessorAdjustments?.recommendedPumpingRateM3Day) ??
    toNum((notes as any)?.waterAbstractionDetails?.[0]?.flowRate)
  );
}

export function resolveVolumes(app: PermitApplication): { yearly: number | null; daily: number | null } {
  const notes = resolveNotes(app);
  const assessorVol = notes?._assessorAdjustments?.recommendedVolumeM3 ?? app.assessor_recommended_volume_m3 ?? null;
  const estVol = (typeof app.estimated_usage_volume === "number" && app.estimated_usage_volume > 0)
    ? app.estimated_usage_volume : null;
  const yearly = assessorVol ?? app.max_yearly_volume_m3 ?? estVol ?? null;
  const daily = app.max_daily_volume_m3 ?? (yearly != null ? yearly / 365 : null);
  return { yearly: typeof yearly === "number" && Number.isFinite(yearly) ? yearly : null, daily };
}

export function resolvePermitDuration(app: PermitApplication, fallback = 5): number {
  const notes = resolveNotes(app);

  const adj = notes?._assessorAdjustments?.permitLengthYears;
  if (typeof adj === "number" && adj >= 1 && adj <= 15) return adj;

  const appType = String((app as unknown as { application_type?: string }).application_type ?? "").toLowerCase();
  const isTransferLike =
    appType === "transfer" || appType === "renewal" || appType === "modification" ||
    notes?.isTransfer === true || notes?.isRenewal === true || notes?.isModification === true;

  if (isTransferLike) {
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

    const isRenewal = appType === "renewal" || notes?.isRenewal === true;

    // For transfers / modifications: use transferFormData dates (original permit validity).
    // For renewals: prefer permitDetails dates (PermitRenewalForm stores them there);
    //               fall back to transferFormData for older submissions.
    const expiryTransfer = parseTfDate(notes?.transferFormData?.expirationDate);
    const issueTransfer  = parseTfDate(notes?.transferFormData?.effectiveDate);
    const expiryDetails  = parseTfDate(notes?.permitDetails?.expiryDate);
    const issueDetails   = parseTfDate(notes?.permitDetails?.issuedDate);

    const expiry = isRenewal ? (expiryDetails ?? expiryTransfer) : expiryTransfer;
    const issue  = isRenewal ? (issueDetails  ?? issueTransfer)  : issueTransfer;

    if (expiry) {
      if (isRenewal && issue) {
        const totalYears = Math.round(
          (expiry.getTime() - issue.getTime()) / (365.25 * 24 * 3600 * 1000),
        );
        if (totalYears >= 1 && totalYears <= 15) return totalYears;
      } else if (!isRenewal) {
        const remaining = Math.ceil(
          (expiry.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000),
        );
        if (remaining >= 1 && remaining <= 15) return remaining;
      }
    }
    return fallback;
  }

  if (typeof app.proposed_duration_years === "number" && app.proposed_duration_years >= 1) return app.proposed_duration_years;
  return fallback;
}

export function resolvePermitTitleNumber(permitNumber: string, headerYear: number): string {
  const n = permitNumber.trim();
  if (!n) return `N/A/RWB/${headerYear}`;
  if (n.includes('/')) return n;
  return `${n}/RWB/${headerYear}`;
}

export function resolveOrgAddress(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;

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
    (notes?.officeVillage as string)?.trim() ? `${notes!.officeVillage} Village` : null,
    (notes?.officeCell as string)?.trim() ? `${notes!.officeCell} Cell` : null,
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

/**
 * Kinyarwanda-formatted version of the organization office address.
 * Mirrors the structure rendered in the sample permit PDF, e.g.
 *   "Umurenge wa Musanze, Akarere ka Musanze, Intara y'Amajyaruguru"
 *
 * Falls back to the free-text `company_address` (or "N/A") when the
 * structured `officeSector / officeDistrict / officeProvince` notes
 * are not populated.
 */
export function resolveOrgAddressKinyarwanda(app: PermitApplication): string {
  const notes = resolveNotes(app);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;

  const sectorEn = isTransfer && tfd
    ? ((tfd.transfereeAddressSector as string | undefined)?.trim() ?? "")
    : ((notes?.officeSector as string)?.trim() ?? "");
  const districtEn = isTransfer && tfd
    ? ((tfd.transfereeAddressDistrict as string | undefined)?.trim() ?? "")
    : ((notes?.officeDistrict as string)?.trim() ?? "");
  const provinceEn = isTransfer && tfd
    ? ((tfd.transfereeAddressProvince as string | undefined)?.trim() ?? "")
    : ((notes?.officeProvince as string)?.trim() ?? "");

  const parts = [
    sectorEn ? `Umurenge wa ${sectorEn}` : null,
    districtEn ? `Akarere ka ${districtEn}` : null,
    provinceEn ? formatIntaraOrUmujyiWaKigali(provinceEn) : null,
  ].filter(Boolean);

  if (parts.length) return parts.join(", ");
  return app.applicant?.company_address?.trim() || "N/A";
}

export function resolveOrgRep(app: PermitApplication): { name: string; title: string } {
  const notes = resolveNotes(app);
  const tfd = notes?.transferFormData as Record<string, unknown> | null | undefined;
  const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;

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

export function resolveFlowRate(app: PermitApplication): string {
  if (resolveIsGroundwater(app)) {
    const pr = resolvePumpingRateM3Day(app);
    if (pr != null) return `${fmtNum(pr)} M3/day`;
  }
  const v = resolveVolumes(app);
  if (v.yearly != null) return `${fmtNum(v.yearly)} M3/year`;
  if (v.daily != null) return `${fmtNum(v.daily)} M3/day`;
  const notes = resolveNotes(app);
  const tfData = notes?.transferFormData;
  if (tfData) {
    const tfVal = tfData.waterAllowance != null ? parseFloat(String(tfData.waterAllowance)) : NaN;
    const tfUnit = String(tfData.allowanceUnit ?? "").trim();
    if (Number.isFinite(tfVal) && tfVal > 0) return `${fmtNum(tfVal)} ${tfUnit || "M3/year"}`;
  }
  return "N/A";
}

function formatFlowRateUnitKinyarwanda(unitRaw: string): string {
  const unit = unitRaw.trim();
  if (!unit) return "m3 ku mwaka";
  const normalized = unit
    .toLowerCase()
    .replace(/³/g, "3")
    .replace(/\s+/g, "")
    .replace(/^cubicmeters?/, "m3")
    .replace(/^cubicmetres?/, "m3");

  const compactMap: Record<string, string> = {
    m3: "m3",
    "m3/year": "m3 ku mwaka",
    "m3/yr": "m3 ku mwaka",
    "m3/y": "m3 ku mwaka",
    "m3/annum": "m3 ku mwaka",
    "m3/peryear": "m3 ku mwaka",
    "m3/day": "m3 ku munsi",
    "m3/d": "m3 ku munsi",
    "m3/perday": "m3 ku munsi",
    "m3/hour": "m3 ku isaha",
    "m3/hr": "m3 ku isaha",
    "m3/h": "m3 ku isaha",
    "m3/perhour": "m3 ku isaha",
    "m3/minute": "m3 ku munota",
    "m3/min": "m3 ku munota",
    "m3/perminute": "m3 ku munota",
    "m3/second": "m3 ku isegonda",
    "m3/sec": "m3 ku isegonda",
    "m3/s": "m3 ku isegonda",
    "m3/persecond": "m3 ku isegonda",
    "l/s": "litiro ku isegonda",
    "l/sec": "litiro ku isegonda",
    "liters/sec": "litiro ku isegonda",
    "litres/sec": "litiro ku isegonda",
    "liter/sec": "litiro ku isegonda",
    "litre/sec": "litiro ku isegonda",
    "liters/s": "litiro ku isegonda",
    "litres/s": "litiro ku isegonda",
    "liters/second": "litiro ku isegonda",
    "litres/second": "litiro ku isegonda",
    "liter/second": "litiro ku isegonda",
    "litre/second": "litiro ku isegonda",
  };
  if (compactMap[normalized]) return compactMap[normalized];

  return unit
    .replace(/m³/gi, "m3")
    .replace(/m3\s*\/\s*(year|yr|y|annum)/gi, "m3 ku mwaka")
    .replace(/m3\s*\/\s*(day|d)/gi, "m3 ku munsi")
    .replace(/m3\s*\/\s*(hour|hr|h)/gi, "m3 ku isaha")
    .replace(/m3\s*\/\s*(minute|min)/gi, "m3 ku munota")
    .replace(/m3\s*\/\s*(second|sec|s)/gi, "m3 ku isegonda")
    .replace(/\b(l|liter|litre|liters|litres)\s*\/\s*(second|sec|s)\b/gi, "litiro ku isegonda");
}

export function resolveFlowRateKinyarwanda(app: PermitApplication): string {
  if (resolveIsGroundwater(app)) {
    const pr = resolvePumpingRateM3Day(app);
    // Groundwater: unit before number, per official RWB format — "m3 <N> ku munsi"
    if (pr != null) return `m3 ${fmtNum(pr)} ku munsi`;
  }
  const v = resolveVolumes(app);
  if (v.yearly != null) return `${fmtNum(v.yearly)} m3 ku mwaka`;
  if (v.daily != null) return `${fmtNum(v.daily)} m3 ku munsi`;
  const notes = resolveNotes(app);
  const tfData = notes?.transferFormData;
  if (tfData) {
    const tfVal = tfData.waterAllowance != null ? parseFloat(String(tfData.waterAllowance)) : NaN;
    const tfUnit = String(tfData.allowanceUnit ?? "").trim();
    if (Number.isFinite(tfVal) && tfVal > 0) {
      return `${fmtNum(tfVal)} ${formatFlowRateUnitKinyarwanda(tfUnit || "M3/year")}`;
    }
  }
  return "N/A";
}

// ─── Kinyarwanda ────────────────────────────────────────────────────────────

export function getActivityLabelKinyarwanda(activity: string): string {
  const activityLabels: Record<string, string> = {
    coffee_washing: "byo gusukura ikawa",
    construction_of_dam: "byo kubaka urugomero",
    construction_of_infrastructures: "byo kubaka cyangwa gushyiraho ibikorwa remezo",
    electricity_generation: "kubyaza amashanyarazi amazi",
    fish_farming_lakes: "ubworozi bw'amafi",
    fish_farming_ponds: "ubworozi bw'amafi",
    gaz_extraction: "byo gucukura gaze",
    industry: "by'inganda",
    irrigation: "kuhira",
    livestock: "ubworozi",
    mining: "ubucukuzi bw'amabuye y'agaciro",
    recreation_activities: "imyidagaduro",
    port_construction: "byo kubaka icyambu",
    water_supply: "gutanga amazi",
    other: "ibindi",
    other_concession: "ibindi",
    domestic: "gukoresha mu rugo",
    industrial: "by'inganda",
    aquaculture: "ubworozi bw'amafi",
    hydropower_source: "kubyaza amashanyarazi amazi",
    municipal_supply: "gutanga amazi",
  };
  return activityLabels[activity] || activity.replace(/[_-]/g, " ");
}

export function resolveActivitiesKinyarwanda(app: PermitApplication): string {
  let acts: string[] = [];
  const notes = resolveNotes(app);
  const fromNotes = notes?.intendedActivities;
  if (Array.isArray(fromNotes)) {
    const cleaned = fromNotes
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (cleaned.length) acts = cleaned;
  }
  if (!acts.length) {
    const raw = app.intended_activities;
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
  }
  if (!acts.length) {
    const purpose = typeof app.water_purpose === "string" ? app.water_purpose.trim() : "";
    if (purpose) return getActivityLabelKinyarwanda(purpose);
    return "N/A";
  }
  return acts.map(getActivityLabelKinyarwanda).join(", ");
}

export function resolveKinyarwandaSystemType(app: PermitApplication): string {
  const raw = resolveAbstractionMethodRaw(app);
  const n = raw.toLowerCase();
  if (!n) return resolveIsGroundwater(app) ? "GUPOMPA" : "GUKORESHA";
  if (n.includes("pump")) return "GUPOMPA";
  if (n.includes("grav")) return "GUKORESHA";
  if (n.includes("diversion") || n === "diversion_channel") return "gukoresha umuyoboro w'amazi";
  if (n.includes("dam") || n.includes("reservoir")) return "gukoresha ikidendezi";
  if (n.includes("borehole")) return "gukoresha iriba ryatobowe";
  if (n.includes("spring")) return "gufata amazi y'isoko";
  if (n.includes("hand") || (n.includes("dug") && n.includes("well"))) return "gukoresha iriba ryacukuwe";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "GUKORESHA";
}
