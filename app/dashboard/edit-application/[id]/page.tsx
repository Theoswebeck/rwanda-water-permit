"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form-new";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase, createAuditLog } from "@/lib/supabase";
import { getApplicationExpiration } from "@/lib/application-expiration";
import type { Application, Document, User as UserType } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { getRequiredAttachmentFieldNames } from "@/lib/annex-requirements";
import { buildDocumentLookupPathPatterns, resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { mergeAdditionalDocumentUrls } from "@/lib/documents/additional-documents";
import { mapFormDataToApplication as mapFormDataToApplicationShared } from "@/lib/application-utils";
import { BackToDashboardButton } from "@/components/ui/back-button";

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
}

// Use the shared mapper so edit flow persists every activity field consistently.
function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' | 'pending_assessment' = 'draft', userId?: string): Partial<Application> {
  const sharedStatus: 'draft' | 'submitted' = status === 'draft' ? 'draft' : 'submitted';
  const mappedData = mapFormDataToApplicationShared(formData, sharedStatus, userId) as Partial<Application> & {
    submitted_at?: string;
  };

  // Preserve edit-flow specific workflow statuses.
  if (status !== sharedStatus) {
    mappedData.status = status as Application['status'];
    if (status === 'pending_assessment' && 'submitted_at' in mappedData) {
      delete mappedData.submitted_at;
    }
  }

  return mappedData;
}

// Transform Application data back to form format for editing - UPDATED TO MATCH NEW-APPLICATION
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};
  
  // Parse internal notes to extract form-specific data
  // Try to parse as JSON first (new format), fallback to legacy format
  let storedFormData: any = {};
  let legacyNotesMap: Record<string, string> = {};
  
  const notes = application.internal_notes || '';
  
  try {
    // Try parsing as JSON (new comprehensive format)
    storedFormData = JSON.parse(notes);
    console.log('✅ Successfully parsed stored form data from JSON');
  } catch (error) {
    // Fallback to legacy format parsing
    console.log('📄 Using legacy notes format parsing');
    const notesParts = notes.split(' | ');
    notesParts.forEach(part => {
      const [key, value] = part.split(': ');
      if (key && value) {
        legacyNotesMap[key] = value;
      }
    });
  }
  
  // If we have comprehensive stored data, use it directly
  if (Object.keys(storedFormData).length > 0 && storedFormData.fullNameApplicant !== undefined) {
    // New format: restore all form fields directly from stored data
    console.log('🔄 Restoring form data from comprehensive JSON storage');
    
    // Copy all stored form data
    Object.assign(formData, storedFormData);
    
    // Debug: Log specific fields being restored
    console.log('🔍 Key fields restored:', {
      nameSourceWater: formData.nameSourceWater,
      tributaryToMain: formData.tributaryToMain,
      waterSourceType: formData.waterSourceType,
      fullNameApplicant: formData.fullNameApplicant
    });
    
    // Override with profile data for contact information if available
    if (userProfile) {
      formData.telephoneContact = userProfile.phone || userProfile.company_phone || formData.telephoneContact;
      formData.emailAddress = userProfile.email || formData.emailAddress;
    }
    
    // Ensure polygons are properly formatted:
    // 1) persisted `waterSourcePolygons`
    // 2) legacy `waterSourceCoordinates`
    // 3) fallback to application.coordinates geometry for older submitted records
    if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
      // ok
    } else if (Array.isArray(formData.waterSourceCoordinates)) {
      formData.waterSourcePolygons = [formData.waterSourceCoordinates];
    } else {
      const fallbackPolygons = geometryToCoordinatePolygons(application.coordinates);
      formData.waterSourcePolygons =
        fallbackPolygons.length > 0
          ? fallbackPolygons
          : [
              [
                { latitude: "", longitude: "" },
                { latitude: "", longitude: "" },
                { latitude: "", longitude: "" }
              ]
            ];
    }
    
    // Ensure additionalDocuments is always an array
    if (!formData.additionalDocuments) {
      formData.additionalDocuments = [];
    }
    
    return formData; // Early return for new format
  }
  
  // Legacy format: reconstruct from basic database fields and legacy notes
  console.log('🔄 Restoring form data from legacy format');
  
  // Basic applicant information (using internal notes and project title)
  formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
  formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';

  // Office address (from application location) - reverse the province mapping
  // Map database province names to Rwanda administrative data keys
  const provinceReverseMap: Record<string, string> = {
    'Kigali': 'Kigali',
    'Northern': 'North',
    'Southern': 'South',
    'Eastern': 'East',
    'Western': 'West'
  };
  formData.officeProvince = provinceReverseMap[application.province] || application.province || '';
  formData.officeDistrict = application.district || '';
  formData.officeSector = application.sector || '';
  formData.officeCell = application.cell || '';
  formData.officeVillage = application.village || '';
  
  // Contact information - use profile data if available, otherwise try to extract from notes
  formData.telephoneContact = userProfile?.phone || userProfile?.company_phone || '';
  formData.emailAddress = userProfile?.email || legacyNotesMap['Contact']?.replace('Not provided', '') || '';

  // Water source information
  const waterSourceMap: Record<string, string> = {
    'surface_water': 'stream_river',
    'groundwater': 'borehole'
  };
  formData.waterSourceType = waterSourceMap[application.water_source] || 'stream_river';
  formData.nameSourceWater = application.water_body_name || '';
  formData.tributaryToMain = application.tributary_name || '';
  
  // Water source location (same as office for now) - reverse the province mapping
  formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
  formData.waterSourceDistrict = application.district || '';
  formData.waterSourceSector = application.sector || '';
  formData.waterSourceCell = application.cell || '';
  formData.waterSourceVillage = application.village || '';

  // Coordinates - normalize Polygon/MultiPolygon/Point into waterSourcePolygons
  try {
    const polys = geometryToCoordinatePolygons(application.coordinates);
    formData.waterSourcePolygons =
      polys && polys.length > 0
        ? polys
        : [
            [
              { latitude: "", longitude: "" },
              { latitude: "", longitude: "" },
              { latitude: "", longitude: "" }
            ]
          ];
  } catch (error) {
    console.warn('Error parsing coordinates:', error);
    formData.waterSourcePolygons = [
      [
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" }
      ]
    ];
  }

  // Water reliability
  formData.waterReliability = 'water_always_available'; // Default
  
  // Intended activities - reverse map from application_type and water_purpose
  const activityMap: Record<string, string[]> = {
    'domestic': ['water_supply'],
    'agricultural': ['irrigation', 'aquaculture'],
    'industrial': ['industry', 'coffee_washing', 'construction'],
    'commercial': ['navigation', 'recreation'],
    'municipal': ['water_supply'],
    'mining_water_use': ['mining']
  };
  
  const purposeToActivity: Record<string, string> = {
    'domestic': 'water_supply',
    'irrigation': 'irrigation', 
    'aquaculture': 'fish_farming_lakes', // legacy
    'fish_farming_lakes': 'fish_farming_lakes',
    'fish_farming_ponds': 'fish_farming_ponds',
    'industrial': 'industry',
    'electricity_generation': 'electricity_generation',
    'mining': 'mining',
    'recreation': 'recreation_activities',
    'port_construction': 'port_construction',
    'gaz_extraction': 'gaz_extraction',
    'other_concession': 'other_concession'
  };
  
  // Prefer the explicit persisted multi-select list if present.
  let mappedActivity: string;
  if (Array.isArray((application as any).intended_activities) && (application as any).intended_activities.length > 0) {
    formData.intendedActivities = (application as any).intended_activities;
    mappedActivity = (application as any).intended_activities[0] || 'water_supply';
  } else {
    mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
    formData.intendedActivities = [mappedActivity];
  }
  
  // Water abstraction details
  if (application.estimated_usage_volume) {
    formData.waterAbstractionDetails = [{
      activity: mappedActivity,
      flowRate: '',
      flowRateUnit: 'm³/s',
      maxAverageYearly: application.estimated_usage_volume,
      abstractionMethod: application.water_taking_method || 'pump'
    }];
  } else {
    formData.waterAbstractionDetails = [{
      activity: mappedActivity,
      flowRate: '',
      flowRateUnit: 'm³/s',
      maxAverageYearly: 0,
      abstractionMethod: 'pump'
    }];
  }
  
  // Land ownership
  formData.ownsAllLand = true; // Default
  formData.hasLandAccess = true; // Default
  
  // Annexes - extract from specific fields
  if (application.electricity_generation_capacity) {
    formData.annexF_electricityDetails = application.electricity_generation_capacity;
  }
  if (application.mining_operations_type) {
    formData.annexG_miningDetails = application.mining_operations_type;
  }

  // Certification
  formData.certificationAgreement = true; // Must be true for saved applications

  // Ensure additionalDocuments is always an array for legacy format too
  if (!formData.additionalDocuments) {
    formData.additionalDocuments = [];
  }

  return formData;
}

// Helper function to upload documents and save to database
async function uploadApplicationDocuments(applicationId: string, formData: any, userId?: string): Promise<Document[]> {
  try {
    const uploadedDocuments: Document[] = [];
    
    // Document type mapping
    const documentTypes = {
      paymentProof: 'payment_proof',
      identificationDoc: 'identification_doc', 
      landOwnershipDoc: 'land_ownership_doc',
      landAccessDocuments: 'land_access_doc',
      technicalDrawings: 'technical_drawings',
      environmentalImpactDoc: 'environmental_impact_doc',
      intakeDischargeMap: 'intake_discharge_map',
      feasibilityStudy: 'other',
      miningLicense: 'business_license',
      miningEIA: 'environmental_impact_doc',
      miningHydrologicalReport: 'geological_survey',
      miningGeneralRequirements: 'other',
      // Groundwater: Geophysical Survey for the eligible activities that have no existing
      // hydrological-report field (the others reuse their *HydrologicalReport key above).
      // Without these entries the upload loop skips them and the file never persists.
      irrigationGeophysicalSurvey: 'geological_survey',
      livestockGeophysicalSurvey: 'geological_survey',
      waterSupplyGeophysicalSurvey: 'geological_survey',
      // Irrigation documents
      irrigationGeneralRequirements: 'other',
      irrigationEIA: 'environmental_impact_doc',
      irrigationFeasibilityStudy: 'other',
      // Water Supply documents
      waterSupplyGeneralRequirements: 'other',
      waterSupplyFeasibilityStudy: 'other',
      // Aquaculture documents
      aquacultureGeneralRequirements: 'other',
      aquacultureEIA: 'environmental_impact_doc',
      aquacultureManagementPlan: 'other',
      aquacultureRecommendationLetter: 'other',
      aquaculturePolygonAreaMap: 'intake_discharge_map',
      aquacultureHydrologicalReport: 'geological_survey',
      // Coffee Washing documents
      coffeeWashingGeneralRequirements: 'other',
      coffeeWashingEIA: 'environmental_impact_doc',
      coffeeWashingHydrologicalReport: 'geological_survey',
      // Industrial documents
      industrialGeneralRequirements: 'other',
      industrialEIA: 'environmental_impact_doc',
      industrialHydrologicalReport: 'geological_survey',
      // Hydropower documents
      hydropowerGeneralRequirements: 'other',
      hydropowerEIA: 'environmental_impact_doc',
      hydropowerFeasibilityStudy: 'other',
      // Construction Dam documents
      constructionDamGeneralRequirements: 'other',
      constructionDamEIA: 'environmental_impact_doc',
      constructionDamFeasibilityStudy: 'other',
      // Infrastructure documents
      infrastructureGeneralRequirements: 'other',
      infrastructureEIA: 'environmental_impact_doc',
      infrastructureFeasibilityStudy: 'other',
      // Navigation documents
      navigationGeneralRequirements: 'other',
      navigationEIA: 'environmental_impact_doc',
      navigationManagementPlan: 'other',
      // Recreation documents
      recreationGeneralRequirements: 'other',
      recreationEIA: 'environmental_impact_doc',
      recreationPolygonAreaMap: 'intake_discharge_map',
      // Port construction documents
      portConstructionGeneralRequirements: 'other',
      portConstructionEIA: 'environmental_impact_doc',
      portConstructionFeasibilityStudy: 'other',
      // Gas extraction documents
      gazExtractionGeneralRequirements: 'other',
      gazExtractionEIA: 'environmental_impact_doc',
      gazExtractionFeasibilityStudy: 'other',
      gazExtractionRMBLicense: 'other',
      // Livestock documents
      livestockGeneralRequirements: 'other',
      livestockFeasibilityStudy: 'other',
      // Transfer documents
      certifiedLetter: 'certified_letter',
      notifiedAgreement: 'signed_transfer_form',
      registrationCertificate: 'registration_certificate',
      existingPermitCopy: 'existing_permit_copy',
    };

    const requiredFieldNames = (() => {
      const intendedActivities = formData.intendedActivities || [];
      const irrigationArea = formData.irrigationTotalArea || 0;
      const req = getRequiredAttachmentFieldNames(intendedActivities, { irrigationTotalArea: irrigationArea });
      req.add("identificationDoc");
      if (formData.ownsAllLand === false) req.add("landAccessDocuments");
      return req;
    })();
    
    console.log('📋 Checking for document uploads in formData:', Object.keys(formData).filter(key => formData[key] instanceof File));
    console.log('📋 All formData keys:', Object.keys(formData));
    console.log('📋 FormData file entries:', Object.entries(formData).filter(([key, value]) => value instanceof File));
    
    for (const [fieldName, documentType] of Object.entries(documentTypes)) {
      const file = formData[fieldName];
      
      if (file && file instanceof File) {
        console.log(`📎 Found file for ${fieldName}:`, file.name);
        try {
          // Upload file to storage
          console.log(`🔄 Uploading ${fieldName} to storage...`);
          const uploadResult = await uploadDocument(file, applicationId, fieldName);
          console.log(`✅ Upload result for ${fieldName}:`, uploadResult);
          
          if (uploadResult) {
            // IMPORTANT:
            // Do NOT upsert by `type` because many distinct fields share the same type (e.g. "other", "geological_survey").
            // Upsert by fieldName encoded into the storage path: applications/{applicationId}/{fieldName}-{timestamp}.{ext}
            const pathPatterns = buildDocumentLookupPathPatterns(applicationId, fieldName);
            const { data: existingDoc, error: checkError } = await supabase
              .from('documents')
              .select('id,file_path,created_at')
              .eq('application_id', applicationId)
              .or(pathPatterns.map((p) => `file_path.ilike.${p}`).join(','))
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
              
            if (checkError) {
              console.error(`Error checking existing document by fieldName ${fieldName}:`, checkError);
              continue;
            }
            
            if (existingDoc) {
              // Update existing document
              const { data: documentRecord, error: dbError } = await supabase
                .from('documents')
                .update({
                  name: file.name,
                  file_path: uploadResult.path,
                  file_size: file.size,
                  mime_type: file.type,
                  verification_status: 'pending',
                  is_required: requiredFieldNames.has(fieldName),
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingDoc.id)
                .select()
                .single();
                
              if (dbError) {
                console.error(`❌ Error updating document ${fieldName}:`, {
                  fieldName,
                  documentType,
                  error: dbError,
                  errorMessage: dbError.message,
                  errorCode: dbError.code,
                  errorDetails: dbError.details,
                  errorHint: dbError.hint
                });
              } else {
                console.log(`✅ Updated existing document ${fieldName} successfully`);
                uploadedDocuments.push(documentRecord);
              }
            } else {
              // Create new document record
              const { data: documentRecord, error: dbError } = await supabase
                .from('documents')
                .insert({
                  application_id: applicationId,
                  name: file.name,
                  type: documentType as any,
                  file_path: uploadResult.path,
                  file_size: file.size,
                  mime_type: file.type,
                  verification_status: 'pending',
                  is_required: requiredFieldNames.has(fieldName),
                  uploaded_by: userId || '550e8400-e29b-41d4-a716-446655440001',
                  upload_date: new Date().toISOString()
                })
                .select()
                .single();
                
              if (dbError) {
                console.error(`❌ Error saving document ${fieldName} to database:`, {
                  fieldName,
                  documentType,
                  error: dbError,
                  errorMessage: dbError.message,
                  errorCode: dbError.code,
                  errorDetails: dbError.details,
                  errorHint: dbError.hint
                });
              } else {
                console.log(`✅ Created new document ${fieldName} successfully`);
                uploadedDocuments.push(documentRecord);
              }
            }
          } else {
            console.error(`Failed to upload ${fieldName}`);
          }
        } catch (error) {
          console.error(`Error processing document ${fieldName}:`, error);
        }
      }
    }
    
    // Handle additional documents
    if (formData.additionalDocuments && Array.isArray(formData.additionalDocuments)) {
      console.log('📎 Processing additional documents:', formData.additionalDocuments.length);
      
      for (const additionalDoc of formData.additionalDocuments) {
        if (additionalDoc.file && additionalDoc.file instanceof File) {
          console.log(`📎 Found additional document file:`, additionalDoc.file.name);
          try {
            // Upload file to storage with a unique field name
            const fieldName = `additional_${additionalDoc.id}`;
            console.log(`🔄 Uploading additional document ${additionalDoc.name} to storage...`);
            const uploadResult = await uploadDocument(additionalDoc.file, applicationId, fieldName);
            console.log(`✅ Upload result for additional document ${additionalDoc.name}:`, uploadResult);
            
            if (uploadResult) {
              // Upsert additional docs by field marker in file_path to avoid
              // collisions when names or shared "other" types repeat.
              const pathPatterns = buildDocumentLookupPathPatterns(applicationId, fieldName);
              const { data: existingDoc, error: checkError } = await supabase
                .from('documents')
                .select('id,file_path,created_at')
                .eq('application_id', applicationId)
                .or(pathPatterns.map((p) => `file_path.ilike.${p}`).join(','))
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (checkError) {
                console.error(`Error checking existing additional document ${additionalDoc.name}:`, checkError);
                continue;
              }
              
              if (existingDoc) {
                // Update existing document
                const { data: documentRecord, error: dbError } = await supabase
                  .from('documents')
                  .update({
                    name: additionalDoc.name,
                    file_path: uploadResult.path,
                    file_size: additionalDoc.file.size,
                    mime_type: additionalDoc.file.type,
                    verification_status: 'pending' as const,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingDoc.id)
                  .select()
                  .single();
                  
                if (dbError) {
                  console.error(`Error updating additional document ${additionalDoc.name}:`, dbError);
                } else {
                  uploadedDocuments.push(documentRecord);
                }
              } else {
                // Create new document record
                const { data: documentRecord, error: dbError } = await supabase
                  .from('documents')
                  .insert({
                    application_id: applicationId,
                    name: additionalDoc.name,
                    type: 'other' as const,
                    file_path: uploadResult.path,
                    file_size: additionalDoc.file.size,
                    mime_type: additionalDoc.file.type,
                    verification_status: 'pending' as const,
                    is_required: false,
                    uploaded_by: userId || '550e8400-e29b-41d4-a716-446655440001',
                    upload_date: new Date().toISOString()
                  })
                  .select()
                  .single();
                  
                if (dbError) {
                  console.error(`Error saving additional document ${additionalDoc.name} to database:`, dbError);
                } else {
                  uploadedDocuments.push(documentRecord);
                }
              }
            } else {
              console.error(`Failed to upload additional document ${additionalDoc.name}`);
            }
          } catch (error) {
            console.error(`Error processing additional document ${additionalDoc.name}:`, error);
          }
        }
      }
    }
    
    console.log(`📋 Total documents processed: ${uploadedDocuments.length}`);
    return uploadedDocuments;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
  }
}

export default function EditApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const { userProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [expiresAtIso, setExpiresAtIso] = useState<string | null>(null);
  
  const { getApplication, updateApplication } = useApplications({
    userId: userProfile?.id,
    autoFetch: false // Don't auto-fetch all applications, we only need one
  });
  const { getDocuments } = useDocuments();
  
  // ⚡ PERFORMANCE: Memoize user data to prevent re-renders
  const userData = useMemo(() => {
    if (!userProfile) {
      return {
        email: "",
        name: "",
        phone: "",
        address: "",
        idNumber: "",
    account_type: 'individual' as const,
        id_number: "",
    company_tin: undefined,
  };
    }
    
    return {
      email: userProfile.email || "",
      name: `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.company_name || "",
      phone: userProfile.phone || userProfile.company_phone || "",
      address: userProfile.company_address || "",
      idNumber: userProfile.id_number || "",
      account_type: userProfile.account_type || 'individual' as const,
      id_number: userProfile.id_number || "",
      company_tin: userProfile.company_tin,
    };
  }, [userProfile]);

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const applicationId = params.id as string;
        console.log('Fetching application for editing:', applicationId);
        console.log('Current user profile:', userProfile);
        console.log('Current user ID:', userProfile?.id);
        
        const app = await getApplication(applicationId);
        if (app) {
          // Determine whether a permit has been issued (permits row exists) and apply expiry rule.
          const { data: permitRow } = await supabase
            .from('permits')
            .select('id')
            .eq('application_id', app.id)
            .limit(1)
            .maybeSingle();

          // IMPORTANT: the statutory 6-month window runs from the ORIGINAL
          // submitted_at, never from resubmitted_at. Restarting the clock on
          // each resubmission would let repeated resubmissions keep an
          // application alive indefinitely. Only DISPLAY and SORTING use the
          // latest (re)submission date (getEffectiveSubmissionDate).
          const expiration = getApplicationExpiration({
            submitted_at: (app as any).submitted_at ?? null,
            hasPermit: Boolean(permitRow?.id),
          });

          if (expiration.isExpired) {
            setIsExpired(true);
            setExpiresAtIso(expiration.expiresAt ? expiration.expiresAt.toISOString() : null);

            // Best-effort: mark the application as expired in DB (requires enum + policies).
            try {
              await supabase
                .from('applications')
                .update({ status: 'expired' as any, updated_at: new Date().toISOString() })
                .eq('id', app.id);
            } catch (e) {
              console.warn('⚠️ Failed to set status=expired (best-effort).', e);
            }
          } else {
            setIsExpired(false);
            setExpiresAtIso(null);
          }

          // Check if application is editable - approved or rejected applications cannot be edited by anyone
          if (app.status === 'approved' || app.status === 'rejected') {
            setError('Approved or rejected applications cannot be edited. Please contact an administrator if changes are needed.');
            return;
          }
          
          // Expired applications are view-only.
          if (app.status === 'expired' || expiration.isExpired) {
            setError('⛔ This application has expired (6 months since submission) and can no longer be edited or submitted.');
          }

          // Check if application is editable (draft, unpaid pending_payment or revision_required), unless expired (view-only)
          if (!expiration.isExpired && app.status !== 'draft' && app.status !== 'pending_payment' && app.status !== 'revision_required') {
            if (
              app.status === 'returned_to_assessment' ||
              app.status === 'returned_to_review' ||
              app.status === 'returned_to_verification' ||
              app.status === 'under_review' ||
              app.status === 'pending_assessment' ||
              app.status === 'pending_review' ||
              app.status === 'pending_verification'
            ) {
              setError('This application is currently being reviewed internally by RWB staff. No action is required from you at this time.');
            } else {
              setError('Only draft applications and applications returned for revision can be edited');
            }
            return;
          }
          
          setApplication(expiration.isExpired ? ({ ...(app as any), status: 'expired' } as any) : app);
          
          // ⚡ PERFORMANCE: Load application and documents in parallel
          const [formData, documents] = await Promise.all([
            Promise.resolve(mapApplicationToFormData(app, userProfile)),
            getDocuments(app.id)
          ]);
          
          // NOTE: setInitialFormData is called AFTER document processing below
          // so that additionalDocuments are included
          
          // ⚡ PERFORMANCE: Process documents efficiently
          const documentMap: Record<string, { url: string; name: string }> = {};

          // Standard/activity documents keyed by their field token from the storage path.
          for (const doc of documents) {
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                if (fieldName && !fieldName.startsWith('additional_')) {
                  documentMap[fieldName] = {
                    url: publicUrl,
                    name: doc.name
                  };
                }
              }
            }
          }

          // Additional (annex "+ Add Document") entries: use the same shared merge
          // as the view/staff pages so each doc keeps its annex category
          // (parsed from the additional_<activity>_<ts> token) instead of being
          // dumped into a catch-all bucket that no annex section renders.
          const mergedFormData = mergeAdditionalDocumentUrls(formData, documents, getDocumentUrl);

          // NOW set the initial form data (after additionalDocuments are added)
          setInitialFormData(mergedFormData);
          setInitialDocuments(documentMap);
          console.log('📋 Document processing complete:');
          console.log('📋 Standard documents found:', Object.keys(documentMap));
          console.log('📋 Additional documents found:', mergedFormData.additionalDocuments.length);
          console.log('✅ Application loaded for editing:', app);
          console.log('✅ Form data mapped:', formData);
        } else {
          console.log('❌ Application not found for ID:', applicationId);
          setError('Application not found. This may be because the application doesn\'t exist, you don\'t have permission to edit it, or it belongs to another user.');
        }
      } catch (err) {
        console.error('❌ Error loading application:', err);
        console.error('❌ Error details:', err);
        setError(`Failed to load application: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoadingApplication(false);
      }
    };
    
    if (params.id && userProfile?.id) {
      fetchApplication();
    }
  }, [params.id, getApplication, userProfile?.id]);
  
  const handleSubmitApplication = async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Updating application, form data received:', formData);
      console.log('📋 Current application state at submit:', application);
      console.log('📋 Application ID at submit:', application?.id);
      
      // Debug: Log all file fields in formData
      const fileFields = Object.entries(formData).filter(([_, value]) => value instanceof File);
      console.log('📎 File fields in formData:', fileFields.map(([key, file]) => ({ key, name: (file as File).name, size: (file as File).size })));
      
      // Determine the correct status for resubmission:
      // If the application was returned by an assessor for revision (has assigned_assessor_id),
      // route it back to that assessor by setting status to 'pending_assessment' instead of 'submitted'
      const wasReturnedByAssessor = application?.status === 'revision_required' && application?.assigned_assessor_id;
      const resubmissionStatus = wasReturnedByAssessor ? 'pending_assessment' : status;
      
      if (wasReturnedByAssessor) {
        console.log('🔄 Application was returned by assessor - routing back to assessor:', application.assigned_assessor_id);
      }
      
      // Map form data to application schema with appropriate status
      const applicationData = mapFormDataToApplication(formData, resubmissionStatus as any, userProfile?.id);

      // Record the LATEST (re)submission date. submitted_at keeps the ORIGINAL
      // submission (it drives the statutory 6-month expiration window); staff
      // tables and detail pages display getEffectiveSubmissionDate() =
      // resubmitted_at first.
      const isResubmission = application?.status === 'revision_required';
      let resubmittedAtStamp: string | null = null;
      if (isResubmission) {
        resubmittedAtStamp = new Date().toISOString();
        (applicationData as any).resubmitted_at = resubmittedAtStamp;
        // Preserve the ORIGINAL submission date on resubmission (the shared
        // mapper stamps submitted_at = now for status 'submitted'; the
        // pending_assessment path already deletes it in mapFormDataToApplication).
        if ('submitted_at' in applicationData) {
          delete (applicationData as any).submitted_at;
        }
      }

      // NOTE: revision_notes is intentionally NOT cleared on resubmission.
      // RWB staff must still see the last return-for-revision reason after the
      // applicant resubmits (traceability). Applicant-facing "Revision Required"
      // banners are all gated on status === 'revision_required', so keeping the
      // notes does not resurface the banner once the status moves on.
      
      console.log('📋 Mapped application data:', applicationData);
      
      // Check if application exists
      if (!application?.id) {
        console.error('❌ Application is null or missing ID at submit time');
        console.error('Application state:', application);
        throw new Error('Application not found or missing ID');
      }
      
      // Update the application
      const updatedApplication = await updateApplication(application.id, applicationData);
      
      if (updatedApplication) {
        console.log('✅ Application updated and submitted successfully:', updatedApplication);

        // The PATCH route silently ignores a status write the row is not eligible
        // for (e.g. a stale view of the status) and still answers success. Never
        // tell the applicant "resubmitted" while the application is still sitting
        // in an applicant-side state (draft / returned / awaiting payment).
        const resultingStatus = String((updatedApplication as any).status || '');
        if (['draft', 'revision_required', 'pending_payment'].includes(resultingStatus)) {
          console.error('❌ Resubmission did not change the application status:', {
            application_id: application.id,
            attempted: resubmissionStatus,
            resulting: resultingStatus,
          });
          throw new Error(
            'Your changes were saved, but the application could not be resubmitted (its status did not change). Please refresh the page and try Resubmit again, or contact support if it persists.'
          );
        }

        // Degradation check: the PATCH route silently drops columns the database
        // does not have yet, so on an un-migrated database resubmitted_at never
        // lands and staff tables keep showing the original submission date.
        // We deliberately do NOT compensate by overwriting submitted_at: that
        // column is the statutory 6-month expiration anchor and must stay on the
        // ORIGINAL submission. The resubmission is therefore still recorded (via
        // status + workflow history + audit log) and the only lost bit is the
        // displayed date, with a loud warning naming the migration to apply.
        if (isResubmission && !(updatedApplication as any).resubmitted_at) {
          console.error(
            '⚠️ Resubmission date was NOT persisted: applications.resubmitted_at is missing from this database. ' +
              'Staff tables will keep showing the original submission date until database/add-application-resubmitted-at.sql is applied. ' +
              'submitted_at was intentionally left unchanged (statutory 6-month expiration anchor).',
            { application_id: application.id, attempted_resubmitted_at: resubmittedAtStamp }
          );
        }

        // Create audit log for resubmission
        try {
          await createAuditLog({
            action: wasReturnedByAssessor ? 'application.resubmitted_to_assessor' : 'application.resubmitted',
            entity_type: 'application',
            table_name: 'applications',
            record_id: application.id,
            old_values: { status: application.status },
            new_values: { status: resubmissionStatus },
            description: wasReturnedByAssessor 
              ? `Application ${application.application_number} resubmitted after corrections - routed back to assigned assessor`
              : `Application ${application.application_number} resubmitted`,
            severity: 'info',
            status: 'success',
          });
        } catch (auditErr) {
          console.warn('⚠️ Failed to create audit log:', auditErr);
        }

        // Fire-and-forget: send submission SMS + email (idempotent server-side)
        try {
          fetch('/api/notifications/send-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: updatedApplication.id }),
          }).catch(() => null)
        } catch {}
        
        // Upload documents and WAIT for completion before redirecting
        console.log('🚀 Starting document upload process...');
        try {
          const uploadedDocuments = await uploadApplicationDocuments(application.id, formData, userProfile?.id);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
        } catch (docError) {
          console.error('⚠️ Document upload failed:', docError);
          setError('Application submitted but some documents failed to upload. Please contact support.');
          setIsLoading(false);
          return;
        }
        
        setSuccess(true);
        
        // Redirect to dashboard after a brief success message
        // Use different success query param based on routing
        const successParam = wasReturnedByAssessor ? 'application-resubmitted-to-assessor' : 'application-submitted';
        setTimeout(() => {
          router.push(`/dashboard?tab=applications&success=${successParam}`);
        }, 2000);
      } else {
        throw new Error('Failed to submit application');
      }
    } catch (error) {
      console.error('❌ Error submitting application:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit application');
      setIsLoading(false);
    }
  };

  const handleSaveAsDraft = useCallback(async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      setDraftSaved(false);
      
      console.log('📋 Updating draft, form data received:', formData);
      console.log('📋 Current application state:', application);
      console.log('📋 Application ID:', application?.id);
      console.log('📋 User profile ID:', userProfile?.id);
      
      // Debug: Log all file fields in formData
      const fileFields = Object.entries(formData).filter(([_, value]) => value instanceof File);
      console.log('📎 File fields in formData:', fileFields.map(([key, file]) => ({ key, name: (file as File).name, size: (file as File).size })));
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status, userProfile?.id);
      // Never attempt to update ownership fields from the client (can violate RLS/policies)
      const { applicant_id, ...updateData } = applicationData as any;

      // Preserve revision_required status -- saving form data should not
      // downgrade the workflow state, otherwise the user gets locked into
      // a broken draft/payment loop on reload.
      if (application?.status === 'revision_required') {
        updateData.status = 'revision_required';
      }
      
      console.log('📋 Mapped draft application data:', updateData);
      
      // Check if application exists
      if (!application?.id) {
        console.error('❌ Application is null or missing ID at save time');
        console.error('Application state:', application);
        throw new Error('Application not found or missing ID');
      }
      
      // Update the application as draft
      const updatedApplication = await updateApplication(application.id, updateData);

      if (updatedApplication) {
        console.log('✅ Application updated as draft successfully:', updatedApplication);
        setApplication(updatedApplication);
        
        // Upload documents and WAIT for completion (previously was fire-and-forget)
        console.log('🚀 Starting document upload process for draft...');
        try {
          const uploadedDocuments = await uploadApplicationDocuments(application.id, formData, userProfile?.id);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
          
          // Update initialDocuments state with newly uploaded documents
          if (uploadedDocuments.length > 0) {
            const newDocMap: Record<string, { url: string; name: string }> = {};
            for (const doc of uploadedDocuments) {
              // Extract field name from file path
              if (doc.file_path) {
                const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                if (fieldName) {
                  const publicUrl = getDocumentUrl(doc.file_path);
                  if (publicUrl) {
                    newDocMap[fieldName] = { url: publicUrl, name: doc.name };
                  }
                }
              }
            }
            // Merge with existing initialDocuments
            if (Object.keys(newDocMap).length > 0) {
              setInitialDocuments(prev => ({ ...prev, ...newDocMap }));
              console.log('📋 Updated initialDocuments with:', Object.keys(newDocMap));
            }
          }
        } catch (docError) {
          console.error('⚠️ Document upload failed:', docError);
          // Don't fail the whole save, but warn the user
          setError('Draft saved but some documents failed to upload. Please try uploading them again.');
        }
        
        // ✅ Draft save UX (do NOT redirect; payment flow depends on staying here)
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);

        return updatedApplication;
      } else {
        // If updateApplication returned null, it has already set a more specific error in the hook.
        throw new Error('Failed to save draft');
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
    } finally {
      // Always reset loading state
      setIsLoading(false);
    }
  }, [application, updateApplication, userProfile?.id, router]);
  
  if (loadingApplication) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading application for editing...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <BackToDashboardButton className="gap-1" />
          </div>
          
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }
  
  if (success) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-green-900 mb-2">Success!</h2>
            <p className="text-green-700 mb-4">
              Your water permit application has been successfully updated.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <BackToDashboardButton className="gap-1" />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {(isLoading || draftSaved) && (
            <Alert className={draftSaved ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}>
              {draftSaved ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              )}
              <AlertDescription className={draftSaved ? "text-green-800" : "text-blue-800"}>
                {draftSaved ? "✅ Draft saved." : "Saving draft…"}
              </AlertDescription>
            </Alert>
          )}
          <div>
            <h1 className="text-primary text-2xl sm:text-3xl font-semibold tracking-tight">Edit Water Permit Application</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isExpired
                ? 'This application has expired and is now view-only.'
                : 'Update your draft application below. You can save changes as a draft or submit for review.'}
            </p>
          </div>

          {/* Expired Notice */}
          {isExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <Alert className="border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 shadow-sm">
                <AlertCircle className="h-5 w-5 text-slate-700" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 text-lg">⛔ Application Expired</h3>
                      <Badge className="border border-slate-300 text-slate-700 bg-slate-200">
                        Expired
                      </Badge>
                    </div>
                    <p className="text-slate-800">
                      This application expired 6 months after submission and can no longer be edited or submitted.
                    </p>
                    {expiresAtIso && (
                      <p className="text-sm text-slate-700">
                        Expired on: <span className="font-medium">{new Date(expiresAtIso).toLocaleDateString()}</span>
                      </p>
                    )}
                    <p className="text-sm text-slate-700">
                      You can still view the submitted information and documents below.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Revision Requirements - Prominent Notice */}
          {application?.status === 'revision_required' && application.revision_notes && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <Alert className="border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <AlertDescription>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-orange-900 text-lg">⚠️ Revision Required</h3>
                      <Badge className="border border-orange-300 text-orange-700 bg-orange-100">
                        Action Needed
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-orange-800">Required Changes:</p>
                      <div className="bg-white/50 rounded-md p-3 border border-orange-200">
                        <p className="text-orange-900 leading-relaxed whitespace-pre-wrap">{application.revision_notes}</p>
                      </div>
                      <p className="text-sm text-orange-700 mt-2">
                        <strong>Note:</strong> Please review the specific requirements above and make the necessary changes before resubmitting your application.
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Documents Section */}
          {application?.documents && (
            <DocumentViewer
              documents={application.documents}
              applicationId={application.id}
              title="Application Documents"
              description="Documents currently uploaded for this application"
              allowDownload={true}
              allowView={true}
              showStatus={true}
              emptyMessage="No documents have been uploaded for this application yet"
            />
          )}
          
          {application && initialFormData && (
            <ApplicationForm
              userData={userData}
              onSubmit={handleSubmitApplication}
              onSaveAsDraft={handleSaveAsDraft}
              isLoading={isLoading}
              initialData={initialFormData}
              initialDocuments={initialDocuments}
              mode={isExpired ? "view" : "edit"}
              readOnly={isExpired}
              currentApplication={application}
              isModification={Boolean((application as any)?.is_modification)}
              excludeApplicationIds={[(application as any)?.modified_from_application_id].filter(Boolean)}
            />
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 