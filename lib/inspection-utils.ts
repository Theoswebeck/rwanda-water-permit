/**
 * Inspection Data Utilities
 * 
 * Utilities for fetching and pre-populating permit inspection data
 */

import { supabase } from './supabase';
import type { Application, Permit, User } from '@/types/database';

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
  
  // Section 2: Activity Details
  activityType: string;
  activityStartingDate?: string;
  
  // Section 3: Permit Particulars
  permitNumber: string;
  issuanceDate?: string;
  expirationDate?: string;
  
  // Section 4: Water Source
  waterSourceName: string;
  waterSourceLocation: string;
  coordinates?: string;
  district: string;
  sector: string;
  cell: string;
  village?: string;
  
  // Section 5: Allowed Water Abstraction
  allowedQuantity?: number;
  allowedUnit?: string;
  authorizedMethod?: string;
  
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
    // Fetch application with related data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(
          id,
          first_name,
          last_name,
          email,
          phone,
          company_name,
          account_type,
          address,
          national_id,
          tin_number
        )
      `)
      .eq('application_number', applicationNumber)
      .single();

    if (appError) throw appError;
    if (!application) return null;

    // Fetch permit data if available
    const { data: permit, error: permitError } = await supabase
      .from('permits')
      .select('*')
      .eq('application_id', application.id)
      .single();

    // Don't throw error if permit not found, it might not exist yet
    const permitData = permitError ? null : permit;

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

/**
 * Prepare pre-populated inspection data from application and permit records
 */
function prepareInspectionData(
  application: any,
  permit: Permit | null,
  paymentHistory: PaymentRecord[]
): PrepopulatedInspectionData {
  const applicant = application.applicant;
  
  // Section 1: Permit Holder Identification
  const permitHolderName = applicant?.company_name || 
    `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim();
  
  const permitHolderId = applicant?.national_id || applicant?.tin_number || 'N/A';
  
  const residence = applicant?.address || 'N/A';
  
  // Representative - for companies, might be a contact person
  const representative = applicant?.account_type === 'business' 
    ? `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() || 'N/A'
    : 'N/A';
  
  const contacts = `Tel: ${applicant?.phone || 'N/A'}, Email: ${applicant?.email || 'N/A'}`;
  
  // Section 2: Activity Details
  const activityType = application.water_purpose?.replace(/_/g, ' ')?.toUpperCase() || 'N/A';
  const activityStartingDate = permit?.issued_date;
  
  // Section 3: Permit Particulars
  const permitNumber = permit?.permit_number || 'Not Issued';
  const issuanceDate = permit?.issued_date;
  const expirationDate = permit?.expiry_date;
  
  // Section 4: Water Source
  const waterSourceName = application.water_source?.replace(/_/g, ' ')?.toUpperCase() || 'N/A';
  const coordinates = application.coordinates 
    ? `Lat: ${application.coordinates.lat}, Lng: ${application.coordinates.lng}`
    : 'N/A';
  
  const waterSourceLocation = [
    application.village,
    application.cell,
    application.sector,
    application.district
  ].filter(Boolean).join(', ');
  
  // Section 5: Allowed Water Abstraction
  const allowedQuantity = permit?.water_allowance;
  const allowedUnit = permit?.allowance_unit;
  const authorizedMethod = application.abstraction_method || 'As per technical drawings';
  
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
    activityType,
    activityStartingDate,
    permitNumber,
    issuanceDate,
    expirationDate,
    waterSourceName,
    waterSourceLocation,
    coordinates,
    district: application.district,
    sector: application.sector,
    cell: application.cell,
    village: application.village,
    allowedQuantity,
    allowedUnit,
    authorizedMethod,
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


