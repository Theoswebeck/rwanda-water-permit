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
  requiredDocuments: Array<{ name: string; url: string }>;
  
  // Section 3: Water Source (prefilled + editable)
  sourceName: string;
  sourceLatitude: string;
  sourceLongitude: string;
  sourceLocation: string; // "Village, Cell, Sector, District, Province"
  catchmentLevel1?: string;
  catchmentLevel2?: string;
  
  // Abstraction-specific fields
  flowRateLps?: string;
  flowRateM3Day?: string;
  abstractionMethod?: string;
  returnFlow?: 'yes' | 'no';
  availableWaterQ?: string;
  waterDemandD?: string;
  existingDemandED?: string;
  remainingWater?: string;
  waterStorage?: string;
  waterUseConflict?: string;
  
  // Concession-specific fields
  surfaceAreaHa?: string;
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
 * Concession: fish_farming_lakes or fish_farming_ponds
 * Abstraction: All other activities
 */
export function determineReportType(
  activities?: string[] | null,
  waterPurpose?: string | null
): ReportType {
  // Check intended_activities first (new format)
  if (activities && Array.isArray(activities) && activities.length > 0) {
    const primaryActivity = activities[0];
    if (primaryActivity === 'fish_farming_lakes' || primaryActivity === 'fish_farming_ponds') {
      return 'concession';
    }
    return 'abstraction';
  }
  
  // Fallback to water_purpose (legacy format)
  if (waterPurpose === 'fish_farming_lakes' || waterPurpose === 'fish_farming_ponds') {
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
  
  // Extract up to the first 3 points as beacons (B1, B2, B3)
  return firstPolygon.slice(0, 3).map((coord, index) => ({
    id: `B${index + 1}`,
    latitude: String(coord.latitude || ''),
    longitude: String(coord.longitude || '')
  }));
}

/**
 * Gets activity label from activity code
 */
export function getActivityLabel(activity: string): string {
  const activityLabels: Record<string, string> = {
    'irrigation': 'Irrigation',
    'water_supply': 'Water Supply',
    'fish_farming_lakes': 'Fish farming in lakes',
    'fish_farming_ponds': 'Fish farming in ponds',
    'industry': 'Industry',
    'coffee_washing': 'Coffee Washing',
    'electricity_generation': 'Electricity Generation',
    'mining': 'Mining',
    'construction_of_dam': 'Construction of Dam',
    'construction_of_infrastructures': 'Construction of Infrastructures',
    'navigation': 'Navigation',
    'recreation_activities': 'Recreation Activities',
    'other': 'Other'
  };
  
  return activityLabels[activity] || activity;
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
    application.water_purpose || null
  );
  
  // Get activities
  const activities = (application.intended_activities as string[]) || [];
  const primaryActivity = activities[0] || application.water_purpose || 'other';
  const activityLabel = getActivityLabel(primaryActivity);
  
  // Extract applicant information
  const applicantName =
    getString(formData, 'fullNameApplicant') ||
    application.project_title?.replace(' Water Permit Application', '') ||
    'Not specified';
  
  const applicantIdTin =
    getString(formData, 'nationalIdNumber') ||
    getString(formData, 'companyTin') ||
    'Not provided';
  
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
    (application as unknown as { applicant?: { phone?: string | null } | null }).applicant?.phone ||
    'Not provided';
  const contactEmail =
    getString(formData, 'emailAddress') ||
    (application as unknown as { applicant?: { email?: string | null } | null }).applicant?.email ||
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
  
  // Fallback to application coordinates
  if (!sourceLatitude || !sourceLongitude) {
    try {
      const geom: any = (application as any).coordinates;
      if (geom?.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        const [lng, lat] = geom.coordinates as [number, number];
        sourceLatitude = String(lat);
        sourceLongitude = String(lng);
      } else {
        const polysUnknown = formData?.waterSourcePolygons;
        if (Array.isArray(polysUnknown) && polysUnknown.length > 0) {
          const firstPoly = polysUnknown[0];
          if (Array.isArray(firstPoly) && firstPoly.length > 0) {
            const firstPoint = firstPoly[0] as unknown;
            if (firstPoint && typeof firstPoint === 'object') {
              const lat = (firstPoint as { latitude?: unknown }).latitude;
              const lng = (firstPoint as { longitude?: unknown }).longitude;
              if (typeof lat === 'string' || typeof lat === 'number') sourceLatitude = String(lat);
              if (typeof lng === 'string' || typeof lng === 'number') sourceLongitude = String(lng);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting coordinates:', error);
    }
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
  
  // Extract required documents with URLs
  const requiredDocuments: Array<{ name: string; url: string }> = [];
  if (documents && documents.length > 0) {
    documents.forEach(doc => {
      if (doc.name && doc.file_path) {
        const url = getDocumentUrl(doc.file_path) || '#';
        requiredDocuments.push({ name: doc.name, url });
      }
    });
  }
  
  // Extract abstraction-specific data if applicable
  const abstractionData: Partial<AssessmentReportData> = {};
  if (reportType === 'abstraction' && formData?.waterAbstractionDetails) {
    const abstractionDetail = formData.waterAbstractionDetails[0];
    if (abstractionDetail) {
      abstractionData.abstractionMethod = abstractionDetail.abstractionMethod || '';
      if (abstractionDetail.maxAverageYearly) {
        // Convert yearly to daily (approximate)
        const dailyM3 = abstractionDetail.maxAverageYearly / 365;
        abstractionData.waterDemandD = String(dailyM3.toFixed(2));
      }
    }
  }
  
  // Extract concession-specific data if applicable
  const concessionData: Partial<AssessmentReportData> = {};
  if (reportType === 'concession') {
    // Extract surface area
    if (formData?.concessionArea) {
      concessionData.surfaceAreaHa = String(formData.concessionArea);
    } else if (formData?.fishLakeAreaHectares) {
      concessionData.surfaceAreaHa = String(formData.fishLakeAreaHectares);
    }
    
    // Extract beacon coordinates
    if (formData?.waterSourcePolygons) {
      concessionData.beacons = extractBeaconCoordinates(formData.waterSourcePolygons);
    } else {
      // Try to extract from application coordinates
      try {
        const geom: any = (application as any).coordinates;
        if (geom) {
          const polygons = geometryToCoordinatePolygons(geom);
          concessionData.beacons = extractBeaconCoordinates(polygons);
        }
      } catch (error) {
        console.warn('Error extracting beacon coordinates:', error);
      }
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
  
  // Handle backward compatibility for requiredDocuments (might be string[] or Array<{name, url}>)
  let mergedRequiredDocuments = prefilled.requiredDocuments;
  if (existing.requiredDocuments) {
    if (Array.isArray(existing.requiredDocuments) && existing.requiredDocuments.length > 0) {
      // Check if it's the new format (array of objects)
      if (typeof existing.requiredDocuments[0] === 'object' && 'name' in existing.requiredDocuments[0]) {
        mergedRequiredDocuments = existing.requiredDocuments as Array<{ name: string; url: string }>;
      } else {
        // Old format (array of strings) - keep prefilled with URLs
        mergedRequiredDocuments = prefilled.requiredDocuments;
      }
    }
  }
  
  return {
    ...prefilled,
    ...existing,
    // Use merged required documents
    requiredDocuments: mergedRequiredDocuments,
    // Merge beacons array properly
    beacons: existing.beacons && existing.beacons.length > 0 
      ? existing.beacons 
      : prefilled.beacons
  };
}

