/**
 * Inspection Data Utilities
 * 
 * Utilities for fetching and pre-populating permit inspection data
 */

import { supabase } from './supabase';
import type { Application, Permit, User } from '@/types/database';
import { geometryToCoordinatePolygons } from '@/lib/geoUtils';
import { getActivityLabel } from '@/lib/assessment-report-utils';

export interface PermitInspectionData {
  application: Application & {
    applicant?: User;
    permit?: Permit;
  };
  permit?: Permit;
  paymentHistory?: PaymentRecord[];
  prepopulatedData: PrepopulatedInspectionData;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_date: string;
  reference: string;
  description?: string;
}

export interface PrepopulatedInspectionData {
  // Section 1: Permit Holder Identification
  permitHolderName: string;
  permitHolderId: string;
  residence: string;
  representative: string;
  contacts: string;
  operatorName?: string;
  operatorIdTin?: string;
  operatorResidence?: string;
  
  // Section 2: Activity Details
  activityType: string;
  activityStartingDate?: string;
  
  // Section 3: Permit Particulars
  permitNumber: string;
  facilityProjectName?: string;
  issuanceDate?: string;
  expirationDate?: string;
  
  // Section 4: Water Source
  waterSourceName: string;
  waterSourceType?: string;
  waterPurpose?: string;
  waterSourceLocation: string;
  coordinates?: string;
  waterSourceLatitude?: string;
  waterSourceLongitude?: string;
  catchmentLevel1?: string;
  catchmentLevel2?: string;
  province?: string;
  district: string;
  sector: string;
  cell: string;
  village?: string;
  
  // Section 5: Allowed Water Abstraction
  allowedQuantity?: number;
  allowedUnit?: string;
  authorizedMethod?: string;
  flowRate?: number;
  
  // Section 8: Payment Information
  totalPaymentAmount?: number;
  lastPaymentDate?: string;
  paymentStatus?: string;
}

/**
 * Fetch comprehensive inspection data for a permit/application
 */
export async function fetchInspectionData(
  applicationNumber: string
): Promise<PermitInspectionData | null> {
  try {
    const applicantSelect = `
      *,
      applicant:users!applicant_id(
        id,
        first_name,
        last_name,
        email,
        phone,
        company_name,
        company_tin,
        account_type,
        address,
        id_number,
        id_type
      )
    `;

    // Primary: treat input as application_number
    const { data: byApplicationNo, error: byApplicationNoError } = await supabase
      .from('applications')
      .select(applicantSelect)
      .eq('application_number', applicationNumber)
      .maybeSingle();

    if (byApplicationNoError) throw byApplicationNoError;

    let application = byApplicationNo as any | null;
    let permitData: Permit | null = null;

    // Fallback: treat input as permit_number and resolve application via permits.application_id
    if (!application) {
      const { data: permitByNo, error: permitByNoError } = await supabase
        .from('permits')
        .select('*')
        .eq('permit_number', applicationNumber)
        .maybeSingle();

      if (permitByNoError) throw permitByNoError;
      permitData = (permitByNo as Permit | null) ?? null;

      if (!permitData?.application_id) return null;

      const { data: appById, error: appByIdError } = await supabase
        .from('applications')
        .select(applicantSelect)
        .eq('id', permitData.application_id)
        .maybeSingle();

      if (appByIdError) throw appByIdError;
      application = appById as any | null;
    }

    if (!application) return null;

    // If we didn't already resolve permit via permit_number, attempt to fetch it by application_id
    if (!permitData) {
      const { data: permit, error: permitError } = await supabase
        .from('permits')
        .select('*')
        .eq('application_id', application.id)
        .maybeSingle();

      // Don't throw error if permit not found, it might not exist yet
      permitData = permitError ? null : permit;
    }

    // Fetch payment history (if payment integration exists)
    const paymentHistory = await fetchPaymentHistory(application.id);

    // Prepare pre-populated data
    const prepopulatedData = prepareInspectionData(application, permitData, paymentHistory);

    return {
      application: {
        ...application,
        permit: permitData
      },
      permit: permitData || undefined,
      paymentHistory,
      prepopulatedData
    };
  } catch (error) {
    console.error('Error fetching inspection data:', error);
    throw error;
  }
}

/**
 * Fetch payment history for an application
 */
async function fetchPaymentHistory(applicationId: string): Promise<PaymentRecord[]> {
  try {
    // Check if payments table exists and fetch records
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Payment history not available:', error.message);
      return [];
    }

    return payments || [];
  } catch (error) {
    console.log('Payment table not available or error fetching:', error);
    return [];
  }
}

function safeParseInternalNotes(notes: unknown): Record<string, any> | null {
  if (!notes) return null;
  if (typeof notes !== 'string') return null;
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function pickFirstDefined<T>(...values: Array<T | undefined | null>): T | undefined {
  return values.find(v => v !== undefined && v !== null) as T | undefined;
}

function pickFirstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toDisplayLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function toDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.includes("T") ? value.split("T")[0] : value;
}

function normalizeIntendedActivities(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // ignore non-JSON strings
    }
  }
  return [];
}

function getPrimaryLatLngFromGeometry(geometry: any): { lat: number; lng: number } | null {
  try {
    const polygons = geometryToCoordinatePolygons(geometry);
    if (!polygons || polygons.length === 0) return null;

    // If it's a single point, use it
    if (polygons.length === 1 && polygons[0].length === 1) {
      const p = polygons[0][0];
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      return null;
    }

    // Otherwise compute a simple centroid-ish average of the first polygon ring
    const points = polygons[0];
    const nums = points
      .map(p => ({ lat: Number(p.latitude), lng: Number(p.longitude) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (nums.length === 0) return null;
    const lat = nums.reduce((s, p) => s + p.lat, 0) / nums.length;
    const lng = nums.reduce((s, p) => s + p.lng, 0) / nums.length;
    return { lat, lng };
  } catch {
    return null;
  }
}

function extractLockedFieldsFromNotes(internal: Record<string, any> | null): {
  operatorName?: string;
  operatorIdTin?: string;
  operatorResidence?: string;
  catchmentLevel1?: string;
  catchmentLevel2?: string;
} {
  if (!internal) return {};

  const operatorName = pickFirstDefined(
    internal.operatorName,
    internal.operator_name,
    internal.operator_full_name,
    internal.nameOperator,
    internal.name_operator
  );
  const operatorIdTin = pickFirstDefined(
    internal.operatorIdTin,
    internal.operator_id_tin,
    internal.operatorIdTIN,
    internal.operator_id,
    internal.operatorTin,
    internal.operator_tin
  );
  const operatorResidence = pickFirstDefined(
    internal.operatorResidence,
    internal.operator_residence,
    internal.operatorAddress,
    internal.operator_address
  );
  const catchmentLevel1 = pickFirstDefined(
    internal.catchmentLevel1,
    internal.catchment_level1,
    internal.level1Catchment,
    internal.level_one_catchment
  );
  const catchmentLevel2 = pickFirstDefined(
    internal.catchmentLevel2,
    internal.catchment_level2,
    internal.level2Catchment,
    internal.level_two_catchment
  );

  return { operatorName, operatorIdTin, operatorResidence, catchmentLevel1, catchmentLevel2 };
}

/**
 * Prepare pre-populated inspection data from application and permit records
 */
function prepareInspectionData(
  application: any,
  permit: Permit | null,
  paymentHistory: PaymentRecord[]
): PrepopulatedInspectionData {
  const applicant = application.applicant;
  const internal = safeParseInternalNotes(application.internal_notes);
  const locked = extractLockedFieldsFromNotes(internal);
  
  // Section 1: Permit Holder Identification
  const permitHolderName = pickFirstNonEmptyString(
    applicant?.account_type === 'individual' ? `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() : undefined,
    applicant?.company_name,
    `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim(),
    'N/A'
  ) || 'N/A';
  
  const isOrganizationAccount = typeof applicant?.account_type === "string" && applicant.account_type !== "individual";
  const permitHolderId = pickFirstNonEmptyString(
    isOrganizationAccount ? applicant?.company_tin : undefined,
    applicant?.id_number,
    'N/A'
  ) || 'N/A';

  const permitDetails = internal?.permitDetails && typeof internal.permitDetails === "object"
    ? internal.permitDetails
    : null;
  const locationProvince = pickFirstNonEmptyString(
    internal?.waterSourceProvince,
    permitDetails?.waterSourceProvince,
    permitDetails?.province,
    application.province
  );
  const locationDistrict = pickFirstNonEmptyString(
    internal?.waterSourceDistrict,
    permitDetails?.waterSourceDistrict,
    permitDetails?.district,
    application.district
  );
  const locationSector = pickFirstNonEmptyString(
    internal?.waterSourceSector,
    permitDetails?.waterSourceSector,
    permitDetails?.sector,
    application.sector
  );
  const locationCell = pickFirstNonEmptyString(
    internal?.waterSourceCell,
    permitDetails?.waterSourceCell,
    permitDetails?.cell,
    application.cell
  );
  const locationVillage = pickFirstNonEmptyString(
    internal?.waterSourceVillage,
    permitDetails?.waterSourceVillage,
    permitDetails?.village,
    application.village
  );

  // Residence should reflect the office location from permit location chain.
  const residence = [
    locationDistrict,
    locationSector,
    locationCell,
    locationVillage,
    locationProvince,
  ].filter(Boolean).join(", ") || 'N/A';
  
  // Representative - for companies, might be a contact person
  const representative = applicant?.account_type && applicant?.account_type !== 'individual'
    ? `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() || 'N/A'
    : 'N/A';
  
  const contacts = `Tel: ${pickFirstNonEmptyString(applicant?.phone, (applicant as any)?.mobile_phone, (applicant as any)?.company_phone) || 'N/A'}, Email: ${applicant?.email || 'N/A'}`;
  const operatorName = pickFirstNonEmptyString(
    permitHolderName !== "N/A" ? permitHolderName : undefined,
    locked.operatorName
  );
  const operatorIdTin = pickFirstNonEmptyString(
    permitHolderId !== "N/A" ? permitHolderId : undefined,
    locked.operatorIdTin
  );
  const operatorResidence = pickFirstNonEmptyString(
    residence !== "N/A" ? residence : undefined,
    locked.operatorResidence
  );
  
  // Section 2: Activity Details
  const intendedActivities = normalizeIntendedActivities(application.intended_activities);
  const primaryActivity = pickFirstNonEmptyString(intendedActivities[0], application.water_purpose) || 'other';
  const activitiesLabel = intendedActivities.length > 1
    ? intendedActivities.map(getActivityLabel).join(", ")
    : getActivityLabel(primaryActivity);
  const activityType = pickFirstNonEmptyString(
    activitiesLabel,
    toDisplayLabel(permit?.purpose)
  ) || "N/A";
  const activityStartingDate = toDateOnly(permit?.issued_date);
  
  // Section 3: Permit Particulars
  const permitNumber = permit?.permit_number || 'Not Issued';
  const facilityProjectName = pickFirstNonEmptyString(application.project_title, (application as any)?.facility_project_name);
  const issuanceDate = toDateOnly(permit?.issued_date);
  const expirationDate = toDateOnly(permit?.expiry_date);
  
  // Section 4: Water Source
  const waterSourceType = pickFirstNonEmptyString(
    toDisplayLabel(permit?.water_source),
    toDisplayLabel(application.water_source)
  );
  const waterSourceName = pickFirstNonEmptyString(application.water_body_name, application.water_source?.replace(/_/g, ' '), 'N/A') || 'N/A';
  const waterPurpose = pickFirstNonEmptyString(
    getActivityLabel(primaryActivity),
    toDisplayLabel(application.water_purpose),
    toDisplayLabel(permit?.purpose)
  );
  const primary = getPrimaryLatLngFromGeometry(application.coordinates);
  const coordinates = primary ? `Lat: ${primary.lat}, Lng: ${primary.lng}` : 'N/A';
  const waterSourceLatitude = pickFirstNonEmptyString(internal?.waterSourceLatitude, primary?.lat !== undefined ? String(primary.lat) : undefined);
  const waterSourceLongitude = pickFirstNonEmptyString(internal?.waterSourceLongitude, primary?.lng !== undefined ? String(primary.lng) : undefined);
  
  const waterSourceLocation = [
    locationVillage,
    locationCell,
    locationSector,
    locationDistrict,
    locationProvince,
  ].filter(Boolean).join(', ');
  
  // Section 5: Allowed Water Abstraction
  const allowedQuantity = permit?.water_allowance;
  const allowedUnit = permit?.allowance_unit;
  const savedAbstraction = Array.isArray(internal?.waterAbstractionDetails) ? internal.waterAbstractionDetails[0] : null;
  const authorizedMethod = application.water_taking_method || application.abstraction_method || savedAbstraction?.abstractionMethod || 'As per technical drawings';
  const flowRate = application.flow_rate_m3_per_second ?? undefined;
  
  // Section 8: Payment Information
  const completedPayments = paymentHistory.filter(p => p.status === 'completed' || p.status === 'success');
  const totalPaymentAmount = completedPayments.reduce((sum, p) => sum + p.amount, 0);
  const lastPaymentDate = completedPayments.length > 0 ? completedPayments[0].payment_date : undefined;
  const paymentStatus = completedPayments.length > 0 ? 'Paid' : 'Pending';
  
  return {
    permitHolderName,
    permitHolderId,
    residence,
    representative,
    contacts,
    operatorName,
    operatorIdTin,
    operatorResidence,
    activityType,
    activityStartingDate,
    permitNumber,
    facilityProjectName,
    issuanceDate,
    expirationDate,
    waterSourceName,
    waterSourceType,
    waterPurpose,
    waterSourceLocation,
    coordinates,
    waterSourceLatitude,
    waterSourceLongitude,
    catchmentLevel1: locked.catchmentLevel1,
    catchmentLevel2: locked.catchmentLevel2,
    province: locationProvince,
    district: locationDistrict || application.district,
    sector: locationSector || application.sector,
    cell: locationCell || application.cell,
    village: locationVillage || application.village,
    allowedQuantity,
    allowedUnit,
    authorizedMethod,
    flowRate,
    totalPaymentAmount,
    lastPaymentDate,
    paymentStatus
  };
}

/**
 * Format a number with unit for display
 */
export function formatQuantity(quantity?: number, unit?: string): string {
  if (!quantity) return 'N/A';
  return `${quantity.toLocaleString()} ${unit || ''}`.trim();
}

/**
 * Calculate percentage difference between allowed and actual quantities
 */
export function calculateUsagePercentage(actual?: number, allowed?: number): number | null {
  if (!actual || !allowed || allowed === 0) return null;
  return (actual / allowed) * 100;
}

/**
 * Get usage status indicator
 */
export function getUsageStatus(actual?: number, allowed?: number): {
  status: 'compliant' | 'warning' | 'exceeded';
  message: string;
  color: string;
} {
  const percentage = calculateUsagePercentage(actual, allowed);
  
  if (!percentage) {
    return {
      status: 'compliant',
      message: 'No data',
      color: 'text-gray-500'
    };
  }
  
  if (percentage <= 100) {
    return {
      status: 'compliant',
      message: 'Within limits',
      color: 'text-green-600'
    };
  } else if (percentage <= 110) {
    return {
      status: 'warning',
      message: 'Slightly over limit',
      color: 'text-yellow-600'
    };
  } else {
    return {
      status: 'exceeded',
      message: 'Exceeded permit limit',
      color: 'text-red-600'
    };
  }
}

/**
 * Format date for display
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-RW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

/**
 * Check if inspection is complete (all required fields filled)
 */
export function isInspectionComplete(inspectionData: any): {
  isComplete: boolean;
  missingFields: string[];
} {
  const requiredFields = [
    { field: 'actual_quantity', label: 'Actual Water Abstraction Quantity' },
    { field: 'measurement_device_type', label: 'Measurement Device Type' },
    { field: 'fees_payment_verified', label: 'Fees Payment Verification' },
    { field: 'reports_submitted', label: 'Reports Submission Status' },
    { field: 'water_use_conflicts', label: 'Water Use Conflicts' },
    { field: 'general_conclusion', label: 'General Conclusion' },
    { field: 'compliance_status', label: 'Compliance Status' }
  ];
  
  const missingFields: string[] = [];
  
  for (const { field, label } of requiredFields) {
    const value = inspectionData[field];
    if (value === null || value === undefined || value === '') {
      missingFields.push(label);
    }
  }
  
  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
}


