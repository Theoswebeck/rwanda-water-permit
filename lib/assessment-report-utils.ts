// =============================================
// Assessment Report Utilities
// Functions for mapping application data to assessment report format
// =============================================

import type { Application, Document } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { getDocumentUrl } from "@/lib/supabase-storage";

export type ReportType = 'abstraction' | 'concession';

type FormDataLike = Record<string, unknown>;

function getString(formData: FormDataLike | undefined, key: string): string | undefined {
  const v = formData?.[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function pickFirstString(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickFirstNumber(...values: Array<unknown>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function extractLatLngFromUnknownPoint(
  point: unknown
): { lat: string; lng: string } | null {
  if (Array.isArray(point) && point.length >= 2) {
    const lng = pickFirstNumber(point[0]);
    const lat = pickFirstNumber(point[1]);
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat: String(lat), lng: String(lng) };
    }
    return null;
  }

  if (!point || typeof point !== "object") return null;

  const asRecord = point as Record<string, unknown>;
  const lat = pickFirstNumber(asRecord.latitude, asRecord.lat);
  const lng = pickFirstNumber(asRecord.longitude, asRecord.lng, asRecord.lon);
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat: String(lat), lng: String(lng) };
  }
  return null;
}

function normalizePolygonsFromUnknown(
  polygonsUnknown: unknown
): Array<Array<{ latitude: string; longitude: string }>> {
  if (!Array.isArray(polygonsUnknown)) return [];

  const normalized: Array<Array<{ latitude: string; longitude: string }>> = [];
  for (const poly of polygonsUnknown) {
    if (!Array.isArray(poly)) continue;
    const points = poly
      .map((p) => extractLatLngFromUnknownPoint(p))
      .filter((p): p is { lat: string; lng: string } => Boolean(p))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (points.length > 0) {
      normalized.push(points);
    }
  }
  return normalized;
}

function getStringArray(formData: FormDataLike | undefined, key: string): string[] | undefined {
  const v = formData?.[key];
  if (!Array.isArray(v)) return undefined;
  const strings = v.filter((x): x is string => typeof x === 'string');
  return strings.length > 0 ? strings : undefined;
}

export interface AssessmentReportData {
  // Section 1: Permit Applicant Identification (prefilled)
  applicantName: string;
  applicantIdTin: string;
  residence: string;
  typeOfActivity: string;
  representative: string;
  contactTel: string;
  contactEmail: string;
  
  // Section 2: Required Documents (prefilled)
  requiredDocuments: Array<{
    key: string;
    label: string;
    provided: boolean;
    name?: string;
    url?: string;
  }>;
  /** Full list of uploaded docs (annex) */
  annexDocuments?: Array<{ name: string; url?: string }>;
  
  // Section 3: Water Source (prefilled + editable)
  sourceName: string;
  sourceLatitude: string;
  sourceLongitude: string;
  sourceLocation: string; // "Village, Cell, Sector, District, Province"
  catchmentLevel1?: string;
  catchmentLevel2?: string;
  /** Concession: full polygon points from the application (shown instead of single lat/lng) */
  sourcePolygonPoints?: Array<{ latitude: string; longitude: string }>;
  /** Abstraction template: flow of the water source (attach field pictures) */
  sourceFlowLps?: string;
  sourceFlowM3Day?: string;
  
  // Abstraction-specific fields
  flowRateLps?: string;
  flowRateM3Day?: string;
  abstractionMethod?: string;
  returnFlow?: 'yes' | 'no';
  waterBalanceDescription?: string;
  availableWaterQ?: string;
  waterDemandD?: string;
  existingDemandED?: string;
  remainingWater?: string;
  waterStorage?: string;
  waterUseConflict?: string;
  
  // Concession-specific fields
  surfaceAreaHa?: string;
  surfaceAreaUnit?: string;
  beacons?: Array<{ id: string; latitude: string; longitude: string }>;
  existingWaterUses?: string;
  
  // Common fields
  wastewaterSystemType?: string;
  wastewaterSystemDescription?: string;
  pollutionDescription?: string;
  pollutionImpactLevel?: string;
  conclusion?: string;
  recommendations?: string;
  reportDate?: string;
}

/**
 * Determines if the report type should be concession or abstraction
 * Concession: fish_farming_lakes or recreation_activities (surface-area based, requires polygon area)
 * Abstraction: All other activities including fish_farming_ponds (single point, volume-based)
 */
export function determineReportType(
  activities?: string[] | null,
  waterPurpose?: string | null,
  waterUseCategory?: string | null
): ReportType {
  // Check intended_activities first (new format)
  if (activities && Array.isArray(activities) && activities.length > 0) {
    const cleaned = activities
      .map((a) => (typeof a === "string" ? a.trim() : ""))
      .filter((a) => a.length > 0);
    const pureConcessionActivities = new Set([
      "fish_farming_lakes",
      "recreation_activities",
    ]);
    const hasPureConcessionActivity = cleaned.some((a) => pureConcessionActivities.has(a));
    if (hasPureConcessionActivity) {
      return "concession";
    }
    // For all other activities, use the user-selected waterUseCategory
    if (waterUseCategory === "concession") {
      return "concession";
    }
    return "abstraction";
  }

  // Fallback to water_purpose (legacy format)
  if (waterPurpose === 'fish_farming_lakes' || waterPurpose === 'recreation_activities') {
    return 'concession';
  }

  return 'abstraction';
}

/**
 * Formats location string from application data
 * Format: "Village, Cell, Sector, District, Province"
 */
export function formatLocationString(
  village?: string | null,
  cell?: string | null,
  sector?: string | null,
  district?: string | null,
  province?: string | null
): string {
  const parts: string[] = [];
  
  if (village) parts.push(village);
  if (cell) parts.push(cell);
  if (sector) parts.push(sector);
  if (district) parts.push(district);
  if (province) parts.push(province);
  
  return parts.join(', ') || 'Not specified';
}

/**
 * Extracts beacon coordinates from concession polygons
 * Returns array of beacon coordinates (B1, B2, B3, etc.)
 */
export function extractBeaconCoordinates(
  polygons?: Array<Array<{ latitude: string | number; longitude: string | number }>> | null
): Array<{ id: string; latitude: string; longitude: string }> {
  if (!polygons || polygons.length === 0) {
    return [];
  }
  
  // Use the first polygon's coordinates as beacons
  const firstPolygon = polygons[0];
  if (!firstPolygon || firstPolygon.length === 0) {
    return [];
  }
  
  return firstPolygon.map((coord, index) => ({
    id: `B${index + 1}`,
    latitude: String(coord.latitude || ''),
    longitude: String(coord.longitude || '')
  }));
}

/**
 * Gets activity label from activity code
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  irrigation: "Irrigation",
  water_supply: "Water Supply",
  fish_farming_lakes: "Fish farming in lakes",
  fish_farming_ponds: "Fish farming in ponds",
  industry: "Industry",
  industrial: "Industry",
  coffee_washing: "Coffee Washing",
  electricity_generation: "Electricity Generation (Hydropower)",
  mining: "Mining",
  construction_of_dam: "Construction of Dam",
  construction_of_infrastructures: "Construction or installation of infrastructure",
  navigation: "Navigation",
  recreation_activities: "Recreational Activities",
  recreation: "Recreational Activities",
  gaz_extraction: "Gaz Extraction",
  livestock: "Livestock",
  domestic: "Water Supply",
  municipal_supply: "Municipal Supply",
  aquaculture: "Aquaculture",
  other: "Other",
};

export const ALL_WATER_ACTIVITY_CODES: string[] = Object.keys(ACTIVITY_LABELS);

/**
 * Normalizes activity strings (enum codes, CSV values, human-readable) to canonical codes
 * for consistent lookup. Handles permit_registry CSV imports and legacy formats.
 */
export function normalizeActivityCode(value: string | null | undefined): string {
  if (value == null || typeof value !== "string") return "";
  let key = value.trim().toLowerCase();
  if (!key) return "";

  // For compound values like "Industrial (tea processing) & residential", take the primary activity
  key = key.split(/\s+(&|and)\s+/i)[0]?.trim() || key;
  // Strip parenthetical suffixes e.g. "Industrial (tea processing)" -> "industrial"
  key = key.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // Normalize spaces to underscores for alias lookup
  key = key.replace(/\s+/g, "_");

  const aliases: Record<string, string> = {
    industry: "industrial",
    coffee_washing_station: "coffee_washing",
    electricity: "electricity_generation",
    construction: "industrial",
    recreation_activities: "recreation",
    gas_extraction: "gaz_extraction",
    aquaculture: "fish_farming_lakes",
    fish_farming: "fish_farming_lakes",
    hydropower: "electricity_generation",
    municipal: "municipal_supply",
    residential: "water_supply",
  };
  return aliases[key] || key || "";
}

export function getActivityLabel(activity: string): string {
  const normalized = normalizeActivityCode(activity);
  if (normalized) {
    const directLabel = ACTIVITY_LABELS[normalized];
    if (directLabel) return directLabel;
  }

  // Try original value as-is (e.g. already a valid code)
  const directLabel = ACTIVITY_LABELS[activity];
  if (directLabel) return directLabel;

  // Fallback for unknown/legacy codes to keep UI readable.
  const fallback = activity || normalized;
  return fallback
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Prefills assessment report data from application and form data
 */
export function prefillAssessmentReportFromApplication(
  application: Application,
  formData?: FormDataLike,
  documents?: Document[]
): Partial<AssessmentReportData> {
  // Determine report type
  const reportType = determineReportType(
    application.intended_activities as string[] | null,
    application.water_purpose || null,
    (formData as any)?.waterUseCategory ?? null
  );
  const assessorAdjustments =
    formData && typeof (formData as any)._assessorAdjustments === "object" && (formData as any)._assessorAdjustments !== null
      ? ((formData as any)._assessorAdjustments as Record<string, unknown>)
      : {};
  
  // Get activities
  const activities = (application.intended_activities as string[]) || [];
  const primaryActivity = activities[0] || application.water_purpose || 'other';
  const activityLabel = getActivityLabel(primaryActivity);
  
  // Extract applicant information
  const applicantName =
    getString(formData, 'fullNameApplicant') ||
    application.project_title?.replace(' Water Permit Application', '') ||
    'Not specified';
  
  const applicantFromJoin = (application as unknown as { applicant?: any }).applicant;
  const applicantCategory = pickFirstString(
    getString(formData, "categoryApplicant"),
    typeof applicantFromJoin?.account_type === "string" ? applicantFromJoin.account_type : undefined
  );
  const isIndividualApplicant = applicantCategory === "individual";
  const applicantIdTin = pickFirstString(
    getString(formData, "nationalIdNumber"),
    getString(formData, "companyTin"),
    isIndividualApplicant
      ? (typeof applicantFromJoin?.id_number === "string" ? applicantFromJoin.id_number : undefined)
      : (typeof applicantFromJoin?.company_tin === "string" ? applicantFromJoin.company_tin : undefined),
    typeof applicantFromJoin?.company_tin === "string" ? applicantFromJoin.company_tin : undefined,
    typeof applicantFromJoin?.id_number === "string" ? applicantFromJoin.id_number : undefined,
  ) || "Not provided";
  
  // Extract residence from office address
  const residence = formatLocationString(
    getString(formData, 'officeVillage') || null,
    getString(formData, 'officeCell') || null,
    getString(formData, 'officeSector') || null,
    getString(formData, 'officeDistrict') || null,
    getString(formData, 'officeProvince') || null
  );
  
  // Extract representative
  const representative = getString(formData, 'nameRepresentative') || 'Not specified';
  
  // Extract contact information
  const contactTel =
    getString(formData, 'telephoneContact') ||
    (typeof applicantFromJoin?.phone === 'string' ? applicantFromJoin.phone : undefined) ||
    (typeof applicantFromJoin?.company_phone === 'string' ? applicantFromJoin.company_phone : undefined) ||
    'Not provided';
  const contactEmail =
    getString(formData, 'emailAddress') ||
    (typeof applicantFromJoin?.email === 'string' ? applicantFromJoin.email : undefined) ||
    'Not provided';
  
  // Extract water source information
  const sourceName = getString(formData, 'nameSourceWater') || application.water_body_name || 'Not specified';
  
  // Extract coordinates
  let sourceLatitude = '';
  let sourceLongitude = '';
  
  // Try to get from form data first
  const fdLat = getString(formData, 'waterSourceLatitude');
  const fdLng = getString(formData, 'waterSourceLongitude');
  if (fdLat) sourceLatitude = fdLat;
  if (fdLng) sourceLongitude = fdLng;
  
  // Fallback to polygon/geometry coordinates
  if (!sourceLatitude || !sourceLongitude) {
    try {
      const geom: any = (application as any).coordinates;
      if (geom?.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        const [lng, lat] = geom.coordinates as [number, number];
        sourceLatitude = String(lat);
        sourceLongitude = String(lng);
      } else {
        const polysUnknown = formData?.waterSourcePolygons;
        let extracted: { lat: string; lng: string } | null = null;
        if (Array.isArray(polysUnknown) && polysUnknown.length > 0) {
          const firstPoly = polysUnknown[0];
          if (Array.isArray(firstPoly) && firstPoly.length > 0) {
            extracted = extractLatLngFromUnknownPoint(firstPoly[0]);
          }
        }

        // If form polygons are absent/empty/invalid, derive from saved geometry.
        if (!extracted && geom) {
          const polygons = geometryToCoordinatePolygons(geom);
          if (Array.isArray(polygons) && polygons.length > 0 && polygons[0].length > 0) {
            extracted = extractLatLngFromUnknownPoint(polygons[0][0]);
          }
        }

        if (extracted) {
          sourceLatitude = extracted.lat;
          sourceLongitude = extracted.lng;
        }
      }
    } catch (error) {
      console.warn('Error extracting coordinates:', error);
    }
  }

  const adjustedLat = pickFirstNumber(assessorAdjustments.waterSourceLatitude);
  const adjustedLng = pickFirstNumber(assessorAdjustments.waterSourceLongitude);
  if (typeof adjustedLat === "number" && typeof adjustedLng === "number") {
    sourceLatitude = String(adjustedLat);
    sourceLongitude = String(adjustedLng);
  }
  
  // Extract source location
  const sourceLocation = formatLocationString(
    getString(formData, 'waterSourceVillage') || application.village || null,
    getString(formData, 'waterSourceCell') || application.cell || null,
    getString(formData, 'waterSourceSector') || application.sector || null,
    getString(formData, 'waterSourceDistrict') || application.district || null,
    getString(formData, 'waterSourceProvince') || application.province || null
  );
  
  // Extract catchment information
  const catchmentLevel1 = getString(formData, 'catchmentNameLevel1') || application.catchment_name_level_1 || '';
  const catchmentLevel2 = getString(formData, 'catchmentNameLevel2') || application.catchment_name_level_2 || '';
  
  const docs = Array.isArray(documents) ? documents : [];

  // Annex list: all documents with URLs (clickable)
  const annexDocuments: Array<{ name: string; url?: string }> = docs
    .filter((d) => typeof d?.name === 'string' && typeof d?.file_path === 'string')
    .map((d) => ({
      name: d.name,
      url: d.file_path ? (getDocumentUrl(d.file_path) || undefined) : undefined,
    }));

  const findDoc = (keywords: RegExp[]) => {
    for (const d of docs) {
      const name = (d?.name || '').toLowerCase();
      if (!name) continue;
      if (keywords.every((re) => re.test(name))) return d;
    }
    return undefined;
  };

  // Required docs (template-fixed list) with best-effort matching to uploaded docs
  const requiredDocuments: AssessmentReportData['requiredDocuments'] = [
    {
      key: 'application_letter_through_district',
      label: 'Application letter',
      ...(() => {
        const d =
          findDoc([/application/, /letter/]) ||
          findDoc([/cover/, /letter/]) ||
          findDoc([/letter/, /rwb/]) ||
          findDoc([/letter/, /district/]) ||
          findDoc([/letter/]);
        if (!d) return { provided: false as const };
        return {
          provided: true as const,
          name: d.name,
          url: d.file_path ? (getDocumentUrl(d.file_path) || undefined) : undefined,
        };
      })(),
    },
    {
      key: 'registration_certificate',
      label: 'Registration certificate',
      ...(() => {
        const d =
          // Explicit phrasing
          findDoc([/registration/, /certificate/]) ||
          findDoc([/certificate/, /registration/]) ||
          findDoc([/certificate/, /incorporation/]) ||
          findDoc([/incorporation/, /certificate/]) ||
          findDoc([/certificate/, /company/]) ||
          // Common Rwanda institutions for registration docs (RDB, RGB, RCA)
          findDoc([/(rdb|rgb|rca)/, /(certificate|cert|registration)/]) ||
          findDoc([/(rdb|rgb|rca)/]) ||
          // Fallback: "certificate" alone is noisy, but keep as last resort
          findDoc([/registration/]) ||
          findDoc([/certificate/]);
        if (!d) return { provided: false as const };
        return {
          provided: true as const,
          name: d.name,
          url: d.file_path ? (getDocumentUrl(d.file_path) || undefined) : undefined,
        };
      })(),
    },
    {
      key: 'hydrological_report',
      label: 'Hydrological Report',
      ...(() => {
        const d = findDoc([/hydro/]) || findDoc([/hydrological/]) || findDoc([/hydrology/]);
        if (!d) return { provided: false as const };
        return {
          provided: true as const,
          name: d.name,
          url: d.file_path ? (getDocumentUrl(d.file_path) || undefined) : undefined,
        };
      })(),
    },
  ];
  
  // Extract abstraction-specific data if applicable
  const abstractionData: Partial<AssessmentReportData> = {};
  if (reportType === 'abstraction') {
    const detailsUnknown: any = (formData as any).waterAbstractionDetails;
    const abstractionDetail: any = Array.isArray(detailsUnknown) ? detailsUnknown[0] : undefined;
    const recommendedVolumeM3 = pickFirstNumber(
      assessorAdjustments.recommendedVolumeM3,
      (application as any)?.assessor_recommended_volume_m3
    );

    if (abstractionDetail) {
      abstractionData.abstractionMethod = typeof abstractionDetail.abstractionMethod === "string" ? abstractionDetail.abstractionMethod : "";

      // Keep Section 4 values exactly as submitted in the application.
      // Do not derive or convert values here.
      if (typeof abstractionDetail.flowRate === "number") {
        abstractionData.flowRateLps = String(abstractionDetail.flowRate);
      } else if (typeof abstractionDetail.flowRate === "string") {
        abstractionData.flowRateLps = abstractionDetail.flowRate;
      }

      if (typeof abstractionDetail.maxAverageYearly === "number") {
        abstractionData.flowRateM3Day = String(abstractionDetail.maxAverageYearly);
      } else if (typeof abstractionDetail.maxAverageYearly === "string") {
        abstractionData.flowRateM3Day = abstractionDetail.maxAverageYearly;
      }

      // If assessor recommended a different yearly amount, it should be used in the assessment report.
      if (typeof recommendedVolumeM3 === "number") {
        abstractionData.flowRateM3Day = String(recommendedVolumeM3);
      }
    } else {
      const fallbackYearlyVolume = pickFirstNumber(
        recommendedVolumeM3,
        (application as any)?.max_yearly_volume_m3,
        (application as any)?.estimated_usage_volume
      );
      if (typeof fallbackYearlyVolume === "number") {
        abstractionData.flowRateM3Day = String(fallbackYearlyVolume);
      }
    }
  }
  
  // Extract concession-specific data if applicable
  const concessionData: Partial<AssessmentReportData> = {};
  if (reportType === 'concession') {
    // Extract surface area — prefer the applicant-submitted value from the form
    const fishLakeAreaM2 = pickFirstNumber((formData as any)?.fishLakeAreaHectares);
    const explicitConcessionArea = pickFirstNumber((formData as any)?.concessionArea);
    const explicitConcessionUnit = getString(formData, "concessionAreaUnit")?.toLowerCase() || "";
    const dbConcessionArea = pickFirstNumber((application as any)?.concession_area);

    if (typeof fishLakeAreaM2 === "number" && fishLakeAreaM2 > 0) {
      concessionData.surfaceAreaHa = String(fishLakeAreaM2);
      concessionData.surfaceAreaUnit = "m²";
    } else if (typeof explicitConcessionArea === "number" && explicitConcessionArea > 0) {
      const isM2 =
        explicitConcessionUnit.includes("m2") ||
        explicitConcessionUnit.includes("m²") ||
        explicitConcessionUnit.includes("square");
      concessionData.surfaceAreaHa = String(explicitConcessionArea);
      concessionData.surfaceAreaUnit = isM2 ? "m²" : (explicitConcessionUnit || "Ha");
    } else if (typeof dbConcessionArea === "number" && dbConcessionArea > 0) {
      concessionData.surfaceAreaHa = String(dbConcessionArea);
      concessionData.surfaceAreaUnit = "Ha";
    }
    
    // Resolve the full polygon (used for both Section 3 polygon and Section 4 beacons)
    const polysUnknown = (formData as any)?.waterSourcePolygons;
    const adjustedPolygonsUnknown = assessorAdjustments.waterSourcePolygonPoints;
    const normalizedFormPolygons = normalizePolygonsFromUnknown(polysUnknown);
    const normalizedAdjustedPolygons = normalizePolygonsFromUnknown(
      Array.isArray(adjustedPolygonsUnknown) ? [adjustedPolygonsUnknown] : adjustedPolygonsUnknown
    );
    let resolvedPolygon: Array<{ latitude: string; longitude: string }> = [];

    if (normalizedAdjustedPolygons.length > 0 && normalizedAdjustedPolygons[0].length > 0) {
      resolvedPolygon = normalizedAdjustedPolygons[0];
    } else if (normalizedFormPolygons.length > 0 && normalizedFormPolygons[0].length > 0) {
      resolvedPolygon = normalizedFormPolygons[0];
    } else {
      try {
        const geom: any = (application as any).coordinates;
        if (geom) {
          const polygons = geometryToCoordinatePolygons(geom);
          if (polygons.length > 0 && polygons[0].length > 0) {
            resolvedPolygon = polygons[0].map((p) => ({
              latitude: String(p.latitude),
              longitude: String(p.longitude),
            }));
          }
        }
      } catch (error) {
        console.warn('Error extracting polygon coordinates:', error);
      }
    }

    if (resolvedPolygon.length > 0) {
      concessionData.sourcePolygonPoints = resolvedPolygon;
      concessionData.beacons = resolvedPolygon.map((coord, index) => ({
        id: `B${index + 1}`,
        latitude: coord.latitude,
        longitude: coord.longitude,
      }));
    }
  }
  
  return {
    applicantName,
    applicantIdTin,
    residence,
    typeOfActivity: activityLabel,
    representative,
    contactTel,
    contactEmail,
    requiredDocuments,
    annexDocuments,
    sourceName,
    sourceLatitude,
    sourceLongitude,
    sourceLocation,
    catchmentLevel1,
    catchmentLevel2,
    ...abstractionData,
    ...concessionData
  };
}

/**
 * Merges existing assessment report data with prefilled data
 * Existing data takes precedence over prefilled data
 */
export function mergeAssessmentReportData(
  prefilled: Partial<AssessmentReportData>,
  existing?: Partial<AssessmentReportData> | null
): Partial<AssessmentReportData> {
  if (!existing) {
    return prefilled;
  }
  
  // Merge requiredDocuments: keep template structure from prefill, but preserve assessor's provided/missing toggles.
  const mergedRequiredDocuments = Array.isArray(prefilled.requiredDocuments)
    ? prefilled.requiredDocuments.map((p) => {
        const match = Array.isArray(existing.requiredDocuments)
          ? (existing.requiredDocuments as any[]).find((e) => e && typeof e === "object" && "key" in e && (e as any).key === (p as any).key)
          : undefined;
        if (!match || typeof match !== "object") return p;
        return {
          ...(p as any),
          provided: typeof (match as any).provided === "boolean" ? (match as any).provided : (p as any).provided,
        };
      })
    : prefilled.requiredDocuments;
  
  const merged: Partial<AssessmentReportData> = {
    ...prefilled,
    ...existing,
    requiredDocuments: mergedRequiredDocuments,
    // Annex is derived from current application documents; keep prefilled.
    annexDocuments: prefilled.annexDocuments,
    // Merge beacons array properly
    beacons: existing.beacons && existing.beacons.length > 0 ? existing.beacons : prefilled.beacons,
  };

  // Always enforce application-derived read-only fields from prefill (prevents stale/blank overrides)
  const enforcedPrefilledKeys: Array<keyof AssessmentReportData> = [
    "applicantName",
    "applicantIdTin",
    "residence",
    "typeOfActivity",
    "representative",
    "contactTel",
    "contactEmail",
    "sourceName",
    "sourceLatitude",
    "sourceLongitude",
    "sourceLocation",
    "catchmentLevel1",
    "catchmentLevel2",
    "sourcePolygonPoints",
    "surfaceAreaHa",
    "surfaceAreaUnit",
    "flowRateLps",
    "flowRateM3Day",
  ];
  for (const k of enforcedPrefilledKeys) {
    if (prefilled[k] !== undefined) {
      (merged as any)[k] = (prefilled as any)[k];
    }
  }

  return merged;
}

/**
 * Normalizes raw assessment_report_data coming from Supabase/PostgREST.
 * Handles:
 * - null/undefined
 * - empty object {}
 * - JSON string (legacy/incorrectly-typed rows)
 */
export function normalizeAssessmentReportData(
  raw: unknown
): Partial<AssessmentReportData> | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeAssessmentReportData(parsed);
    } catch {
      return null;
    }
  }

  if (typeof raw !== "object") return null;
  if (Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return null;

  return obj as Partial<AssessmentReportData>;
}