"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";

// Lazy load the heavy form components
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading form...", getPreferredLanguage())}
        </span>
      </div>
    ),
    ssr: false
  }
);

const PermitTransferForm = dynamic(
  () => import("@/components/dashboard/permit-transfer-form").then(mod => ({ default: mod.PermitTransferForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading transfer form...", getPreferredLanguage())}
        </span>
      </div>
    ),
    ssr: false
  }
);

const PermitRenewalForm = dynamic(
  () => import("@/components/dashboard/permit-renewal-form").then(mod => ({ default: mod.PermitRenewalForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading renewal form...", getPreferredLanguage())}
        </span>
      </div>
    ),
    ssr: false
  }
);

import { ApplicationTypeSelector, type ApplicationMode } from "@/components/dashboard/application-type-selector";
import { PermitSelectForTransfer, type PermitWithApplication } from "@/components/dashboard/permit-select-for-transfer";
import { PermitSelectForModification } from "@/components/dashboard/permit-select-for-modification";
import { PermitSelectForRenewal, type PermitWithApplication as RenewalPermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2, FileSearch } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useApplications } from "@/hooks/useApplications";
import { applicationKeys } from "@/hooks/useApplicationsQuery";
import { useDocuments } from "@/hooks/useDocuments";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import type { Application, Document } from "@/types/database";
import { mapFormDataToApplication, formatProvinceForDB, formatWaterSourceForDB, formatWaterPurposeForDB, formatApplicationTypeForDB } from "@/lib/application-utils";
import { polygonsToGeoJSON } from "@/lib/geoUtils";
import { getRequiredAttachmentFieldNames } from "@/lib/annex-requirements";
import { buildDocumentLookupPathPatterns, resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import type { ManualPermitSelectionPayload, PermitReference } from "@/lib/permit/permit-reference";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

// Helper function to create storage bucket if it doesn't exist
async function ensureStorageBucket() {
  try {
    const bucketName = 'application-documents';
    
    // Try to get bucket info to see if it exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.warn('Could not list buckets:', listError);
      return;
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      // Create the bucket
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        fileSizeLimit: 26214400 // 25MB (feasibility studies can be up to 25MB)
      });
      
      if (createError) {
        console.warn('Could not create storage bucket:', createError);
      }
    }
  } catch (error) {
    console.warn('Storage bucket setup failed:', error);
  }
}

// Helper function to upload documents and save to database
async function uploadApplicationDocuments(applicationId: string, formData: any, userId?: string): Promise<Document[]> {
  try {
    const uploadedDocuments: Document[] = [];
    const uploadFailures: Array<{ fieldName: string; reason: string }> = [];

    // Prefer Supabase auth user id for RLS (source of truth). Fall back to provided userId.
    const uploaderId = await (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        return data?.user?.id || userId || '550e8400-e29b-41d4-a716-446655440001';
      } catch {
        return userId || '550e8400-e29b-41d4-a716-446655440001';
      }
    })();
    
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
      // Renewal documents
      renewalRequestLetter: 'renewal_request_letter',
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
      industrialWasteManagementPlan: 'other',
      industrialHydrologicalReport: 'geological_survey',
      // Hydropower documents
      hydropowerGeneralRequirements: 'other',
      hydropowerEIA: 'environmental_impact_doc',
      hydropowerFeasibilityStudy: 'other',
      // Construction Dam documents
      constructionDamGeneralRequirements: 'other',
      constructionDamEIA: 'environmental_impact_doc',
      constructionDamEngineeringPlans: 'technical_drawings',
      constructionDamFeasibilityStudy: 'other',
      // Infrastructure documents
      infrastructureGeneralRequirements: 'other',
      infrastructureEIA: 'environmental_impact_doc',
      infrastructureEngineeringPlans: 'technical_drawings',
      infrastructureFeasibilityStudy: 'other',
      // Recreation documents
      recreationGeneralRequirements: 'other',
      recreationEIA: 'environmental_impact_doc',
      recreationManagementPlan: 'other',
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
      // Unlinked-permit identity proof
      legacyPermitIdentityProof: 'identification_doc',
    };

    const requiredFieldNames = (() => {
      const intendedActivities = formData.intendedActivities || [];
      const irrigationArea = formData.irrigationTotalArea || 0;
      const req = getRequiredAttachmentFieldNames(intendedActivities, { irrigationTotalArea: irrigationArea });
      // Always required core docs for this UI flow
      req.add("identificationDoc");
      if (formData.ownsAllLand === false) req.add("landAccessDocuments");
      const isTransferForm = Boolean(formData.permitNumber && formData.transfereeName);
      if (isTransferForm) {
        req.add("certifiedLetter");
        req.add("registrationCertificate");
      }
      return req;
    })();
    
    for (const [fieldName, documentType] of Object.entries(documentTypes)) {
      const file = formData[fieldName];
      
      if (file && file instanceof File) {
        try {
          // Upload file to storage
          const uploadResult = await uploadDocument(file, applicationId, fieldName);
          
          if (uploadResult) {
            // Upsert by fieldName in file_path (NOT by type) to avoid collisions for shared types.
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
              console.error(`❌ Error checking existing document ${fieldName}:`, checkError);
              continue;
            }

            const upsertPayload = {
              application_id: applicationId,
              name: file.name,
              type: documentType,
              file_path: uploadResult.path,
              file_size: file.size,
              mime_type: file.type,
              verification_status: 'pending' as const,
              is_required: requiredFieldNames.has(fieldName),
              uploaded_by: uploaderId,
              upload_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any;

            const { data: documentRecord, error: dbError } = existingDoc
              ? await supabase.from('documents').update(upsertPayload).eq('id', existingDoc.id).select().single()
              : await supabase.from('documents').insert(upsertPayload).select().single();
              
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
              uploadFailures.push({ fieldName, reason: dbError.message || 'DB insert/update failed' });
            } else {
              console.log(`✅ Successfully saved document ${fieldName} to database`);
              uploadedDocuments.push(documentRecord);
            }
          } else {
            console.error(`Failed to upload ${fieldName}`);
            uploadFailures.push({ fieldName, reason: 'Storage upload failed' });
          }
        } catch (error) {
          console.error(`Error processing document ${fieldName}:`, error);
          uploadFailures.push({ fieldName, reason: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    }

    // Handle additional documents (dynamic attachments)
    console.log('📎 additionalDocuments check:', {
      exists: !!formData.additionalDocuments,
      isArray: Array.isArray(formData.additionalDocuments),
      length: formData.additionalDocuments?.length ?? 0,
      raw: formData.additionalDocuments
    });
    
    if (formData.additionalDocuments && Array.isArray(formData.additionalDocuments)) {
      console.log('📎 Processing additional documents:', formData.additionalDocuments.length);

      for (const additionalDoc of formData.additionalDocuments) {
        console.log('📎 Checking additionalDoc:', {
          id: additionalDoc?.id,
          name: additionalDoc?.name,
          hasFile: !!additionalDoc?.file,
          fileIsFile: additionalDoc?.file instanceof File,
          fileType: additionalDoc?.file?.constructor?.name
        });
        
        if (additionalDoc?.file && additionalDoc.file instanceof File) {
          try {
            const fieldName = `additional_${additionalDoc.id}`;
            console.log(`🔄 Uploading additional document ${additionalDoc.name} to storage...`);
            const uploadResult = await uploadDocument(additionalDoc.file, applicationId, fieldName);

            if (!uploadResult) {
              console.error(`Failed to upload additional document ${additionalDoc.name}`);
              continue;
            }

            // Upsert by fieldName in file_path to avoid collisions if two docs share the same name.
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
              console.error(`❌ Error checking existing additional document ${additionalDoc.name}:`, checkError);
              continue;
            }

            const upsertPayload = {
              application_id: applicationId,
              name: additionalDoc.name,
              type: 'other' as const,
              file_path: uploadResult.path,
              file_size: additionalDoc.file.size,
              mime_type: additionalDoc.file.type,
              verification_status: 'pending' as const,
              is_required: false,
              uploaded_by: uploaderId,
              upload_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any;

            const { data: documentRecord, error: dbError } = existingDoc
              ? await supabase.from('documents').update(upsertPayload).eq('id', existingDoc.id).select().single()
              : await supabase.from('documents').insert(upsertPayload).select().single();

            if (dbError) {
              console.error(`❌ Error saving additional document ${additionalDoc.name} to database:`, dbError);
              uploadFailures.push({ fieldName, reason: dbError.message || 'DB insert/update failed' });
            } else {
              uploadedDocuments.push(documentRecord);
            }
          } catch (error) {
            console.error(`Error processing additional document ${additionalDoc?.name}:`, error);
            const fieldName = `additional_${additionalDoc?.id ?? 'unknown'}`;
            uploadFailures.push({ fieldName, reason: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }
    }

    // If anything failed to persist, throw so callers can surface it to the user.
    if (uploadFailures.length > 0) {
      const details = uploadFailures
        .slice(0, 6)
        .map((f) => `${f.fieldName}: ${f.reason}`)
        .join('; ');
      throw new Error(
        `Some documents failed to persist. ${uploadFailures.length} failure(s). ${details}${
          uploadFailures.length > 6 ? '…' : ''
        }`
      );
    }
    
    return uploadedDocuments;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
  }
}

function buildInitialDocumentMapFromRecords(documents: Document[]): Record<string, { url: string; name: string }> {
  const documentMap: Record<string, { url: string; name: string }> = {};

  for (const doc of documents) {
    if (!doc?.file_path || !doc?.name) continue;

    const publicUrl = getDocumentUrl(doc.file_path);
    if (!publicUrl) continue;

    const rawFileName = (() => {
      try {
        if (doc.file_path.startsWith("http://") || doc.file_path.startsWith("https://")) {
          return new URL(doc.file_path).pathname.split("/").pop() || "";
        }
      } catch {}
      return doc.file_path.split("/").pop() || "";
    })();

    // Additional documents are rendered from `additionalDocuments` state.
    if (rawFileName.startsWith("additional_")) continue;

    const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
    documentMap[fieldName] = {
      url: publicUrl,
      name: doc.name,
    };
  }

  return documentMap;
}

function inferAdditionalDocumentCategoryFromId(id?: string): string {
  if (!id || typeof id !== "string") return "additional";
  if (id.startsWith("recreation_activities_")) return "recreation_activities";
  if (id.startsWith("construction_of_infrastructures_")) return "construction_of_infrastructures";
  if (id.startsWith("gaz_extraction_")) return "gaz_extraction";
  if (id.startsWith("livestock_")) return "livestock";
  if (id.startsWith("other_")) return "other";
  return "additional";
}

// Inner component that uses useSearchParams
function NewApplicationContent() {
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const toUuidOrNull = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return UUID_PATTERN.test(normalized) ? normalized : null;
  };
  const pickNonTransferAppType = (
    candidateType: unknown,
    fallbackActivity: unknown
  ): Application["application_type"] => {
    if (typeof candidateType === "string" && candidateType.trim() && candidateType !== "transfer") {
      return candidateType as Application["application_type"];
    }
    return formatApplicationTypeForDB(typeof fallbackActivity === "string" ? fallbackActivity : "");
  };

  type SelectedPermitRuntimeMeta = {
    permitReference?: PermitReference;
    legacyIdentityProofFile?: File | null;
  };

  const createManualSelectedPermit = useCallback((payload: ManualPermitSelectionPayload) => {
    const nowIso = new Date().toISOString();
    const todayDateOnly = nowIso.split("T")[0];
    const toDateOnly = (value?: string | null): string | null => {
      if (typeof value !== "string" || !value.trim()) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString().split("T")[0];
    };
    const registryIssueDate = toDateOnly(payload.permitReference.registrySnapshot?.issued_date);
    const registryExpiryDate = toDateOnly(payload.permitReference.registrySnapshot?.expiry_date);
    const issuedDate = registryIssueDate ?? todayDateOnly;
    const fallbackExpiryDate = (() => {
      const issue = new Date(`${issuedDate}T00:00:00.000Z`);
      issue.setUTCFullYear(issue.getUTCFullYear() + 5);
      return issue.toISOString().split("T")[0];
    })();
    const expiryDate = registryExpiryDate ?? fallbackExpiryDate;
    const normalized = payload.permitReference.normalizedPermitNumber || payload.permitReference.inputPermitNumber;
    return {
      id: `manual-${normalized}`,
      application_id: "",
      permit_number: payload.permitReference.inputPermitNumber,
      status: "active",
      water_source: "other",
      purpose: "other",
      water_allowance: 0,
      allowance_unit: "m³/year",
      issuing_authority: "Rwanda Water Resources Board",
      issued_date: "",
      expiry_date: expiryDate,
      is_renewal: false,
      is_transfer: false,
      is_modification: false,
      created_at: nowIso,
      updated_at: nowIso,
      application: {
        id: "",
        project_title: payload.permitReference.manualActivity || "",
        province: "",
        district: "",
        sector: "",
        cell: "",
        village: "",
      },
      permitReference: payload.permitReference,
      legacyIdentityProofFile: payload.identityProofFile,
    };
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const draftId = searchParams.get('id'); // Check if we're editing an existing draft
  const modeParam = searchParams.get('mode'); // Check if mode is specified (new or transfer)
  const renewalApplicationId = searchParams.get('applicationId'); // For loading existing renewal drafts
  const renewalPermitId = searchParams.get('permitId'); // For loading existing renewal drafts
  const { userProfile } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!draftId);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const loadedDraftIdRef = useRef<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  
  // Application type state (new application vs transfer vs modification vs renewal)
  const [applicationMode, setApplicationMode] = useState<ApplicationMode | null>(
    modeParam === 'transfer' ? 'transfer' : modeParam === 'modification' ? 'modification' : modeParam === 'renewal' ? 'renewal' : modeParam === 'new' ? 'new' : null
  );
  const [selectedPermit, setSelectedPermit] = useState<PermitWithApplication | null>(null);
  const [transferStep, setTransferStep] = useState<'select-permit' | 'fill-form'>('select-permit');
  const [currentTransferApplication, setCurrentTransferApplication] = useState<Application | null>(null);
  
  // Modification-specific state
  const [modificationStep, setModificationStep] = useState<'select-permit' | 'fill-form'>('select-permit');
  const [selectedPermitForModification, setSelectedPermitForModification] = useState<PermitWithApplication | null>(null);
  const [originalApplicationData, setOriginalApplicationData] = useState<any>(null);
  const [currentModificationApplication, setCurrentModificationApplication] = useState<Application | null>(null);
  
  // Renewal-specific state
  const [renewalStep, setRenewalStep] = useState<'select-permit' | 'fill-form'>('select-permit');
  const [selectedPermitForRenewal, setSelectedPermitForRenewal] = useState<RenewalPermitWithApplication | null>(null);
  const [currentRenewalApplication, setCurrentRenewalApplication] = useState<Application | null>(null);
  const [loadingRenewalDraft, setLoadingRenewalDraft] = useState(!!renewalApplicationId);
  
  const { createApplication, updateApplication, getApplication } = useApplications();
  const { getDocuments } = useDocuments();
  
  // Load existing renewal application if applicationId and permitId are provided
  useEffect(() => {
    const loadRenewalDraft = async () => {
      if (!renewalApplicationId || applicationMode !== 'renewal') {
        setLoadingRenewalDraft(false);
        return;
      }
      
      try {
        setLoadingRenewalDraft(true);
        setError(null);
        
        const application = await getApplication(renewalApplicationId);
        if (!application) {
          setError('Failed to load renewal application data');
          return;
        }

        // Linked-system renewal: load permit row normally.
        if (renewalPermitId && !renewalPermitId.startsWith("manual-")) {
          const permitResult = await supabase
            .from('permits')
            .select(`
              *,
              application:applications!application_id (
                id,
                application_number,
                application_type,
                project_title,
                province,
                district,
                sector,
                cell,
                village,
                water_source,
                water_purpose,
                water_body_name,
                max_daily_volume_m3,
                max_yearly_volume_m3,
                concession_area,
                internal_notes,
                intended_activities,
                applicant:users!applicant_id (
                  id,
                  email,
                  phone,
                  first_name,
                  last_name,
                  company_name,
                  company_address,
                  company_phone,
                  account_type
                )
              )
            `)
            .eq('id', renewalPermitId)
            .single();

          if (permitResult.data) {
            setCurrentRenewalApplication(application);
            setSelectedPermitForRenewal(permitResult.data as RenewalPermitWithApplication);
            setRenewalStep('fill-form');
            return;
          }
        }

        // Manual/unlinked renewal: rebuild pseudo permit from saved permitReference.
        let permitReference: PermitReference | undefined;
        try {
          const notes = application.internal_notes ? JSON.parse(application.internal_notes) : {};
          if (notes && typeof notes === "object" && notes.permitReference) {
            permitReference = notes.permitReference as PermitReference;
          }
        } catch {
          permitReference = undefined;
        }

        if (permitReference) {
          setCurrentRenewalApplication(application);
          setSelectedPermitForRenewal(
            createManualSelectedPermit({
              permitReference,
              identityProofFile: null,
            }) as unknown as RenewalPermitWithApplication
          );
          setRenewalStep('fill-form');
          return;
        }

        setError('Failed to load renewal application data');
      } catch (err) {
        console.error('Error loading renewal draft:', err);
        setError(err instanceof Error ? err.message : 'Failed to load renewal draft');
      } finally {
        setLoadingRenewalDraft(false);
      }
    };
    
    loadRenewalDraft();
  }, [renewalApplicationId, renewalPermitId, applicationMode, getApplication, createManualSelectedPermit]);
  
  // Load existing draft if draftId is provided - OPTIMIZED
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) {
        loadedDraftIdRef.current = null;
        setLoadingDraft(false);
        return;
      }

      // Prevent duplicate reload of same draft, which causes skeleton flicker.
      if (loadedDraftIdRef.current === draftId) {
        return;
      }
      
      try {
        // Keep existing form visible if already hydrated.
        if (!initialFormData) {
          setLoadingDraft(true);
        }
        setError(null);
        
        // ⚡ PERFORMANCE: Load application and documents in parallel
        const [application, documents] = await Promise.all([
          getApplication(draftId),
          getDocuments(draftId)
        ]);
        
        if (application) {
          setCurrentApplication(application);
          
          // ✅ Restore form state from stored internal_notes JSON (drafts store the full form payload there)
          const restored: any = (() => {
            try {
              const parsed = JSON.parse((application as any).internal_notes || "{}");
              return parsed && typeof parsed === "object" ? parsed : {};
            } catch {
              return {};
            }
          })();

          // If the stored JSON is missing activities (older drafts), fall back to DB column.
          if (
            (!Array.isArray(restored.intendedActivities) || restored.intendedActivities.length === 0) &&
            Array.isArray((application as any).intended_activities) &&
            (application as any).intended_activities.length > 0
          ) {
            restored.intendedActivities = (application as any).intended_activities;
          }

          // Back-compat: normalize legacy single polygon into waterSourcePolygons
          if (!Array.isArray(restored.waterSourcePolygons) || restored.waterSourcePolygons.length === 0) {
            if (Array.isArray(restored.waterSourceCoordinates)) {
              restored.waterSourcePolygons = [restored.waterSourceCoordinates];
            } else {
              restored.waterSourcePolygons = [
                [
                  { latitude: "", longitude: "" },
                  { latitude: "", longitude: "" },
                  { latitude: "", longitude: "" }
                ]
              ];
            }
          }

          // Backfill LAT/LONG from stored geometry if internal_notes didn't include it (older drafts)
          if (
            (restored.waterSourceLatitude == null || String(restored.waterSourceLatitude).trim() === "") &&
            (restored.waterSourceLongitude == null || String(restored.waterSourceLongitude).trim() === "")
          ) {
            const geom: any = (application as any).coordinates;
            if (geom && geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
              const [lng, lat] = geom.coordinates;
              restored.waterSourceLatitude = String(lat ?? "");
              restored.waterSourceLongitude = String(lng ?? "");
            }
          }

          if (!Array.isArray(restored.additionalDocuments)) {
            restored.additionalDocuments = [];
          }
          
          // ⚡ PERFORMANCE: Process documents efficiently
          const documentMap: Record<string, { url: string; name: string }> = {};
          const additionalDocsFromDb: Array<{ id?: string; name: string; url: string }> = [];

          console.log('📄 Processing documents from DB:', documents.length);
          for (const doc of documents) {
            console.log('📄 Document:', { name: doc.name, type: doc.type, file_path: doc.file_path });
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                // Detect dynamic "additional documents" (uploaded as additional_{id}-timestamp.ext)
                const rawFileName = (() => {
                  try {
                    if (doc.file_path.startsWith("http://") || doc.file_path.startsWith("https://")) {
                      return new URL(doc.file_path).pathname.split("/").pop() || "";
                    }
                  } catch {}
                  return doc.file_path.split("/").pop() || "";
                })();

                console.log('📄 Raw filename:', rawFileName, 'starts with additional_:', rawFileName.startsWith("additional_"));

                if (rawFileName.startsWith("additional_")) {
                  const m = rawFileName.match(/^additional_(.+?)-\d+\./);
                  console.log('📄 Matched additional doc ID:', m?.[1]);
                  additionalDocsFromDb.push({ id: m?.[1], name: doc.name, url: publicUrl });
                } else {
                  const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                  documentMap[fieldName] = {
                    url: publicUrl,
                    name: doc.name
                  };
                }
              }
            }
          }
          console.log('📄 Additional docs from DB:', additionalDocsFromDb);

          // Merge additional documents (kept in internal_notes) with their uploaded URLs (from documents table)
          if (additionalDocsFromDb.length > 0) {
            const existing = Array.isArray(restored.additionalDocuments) ? restored.additionalDocuments : [];
            const byId = new Map<string, any>();
            const byName = new Map<string, any>();
            for (const d of existing) {
              if (d?.id) byId.set(String(d.id), d);
              if (d?.name) byName.set(String(d.name), d);
            }

            for (const dbDoc of additionalDocsFromDb) {
              const match =
                (dbDoc.id ? byId.get(String(dbDoc.id)) : undefined) ||
                byName.get(String(dbDoc.name));

              if (match) {
                match.url = dbDoc.url;
                match.file = null;
                if (!match.category) {
                  match.category = inferAdditionalDocumentCategoryFromId(dbDoc.id);
                }
              } else {
                existing.push({
                  id: dbDoc.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                  name: dbDoc.name,
                  category: inferAdditionalDocumentCategoryFromId(dbDoc.id),
                  description: "",
                  file: null,
                  url: dbDoc.url,
                });
              }
            }

            restored.additionalDocuments = existing;
          }
          
          // Set initial form data after documents are processed/merged
          setInitialFormData(restored);
          setInitialDocuments(documentMap);
          loadedDraftIdRef.current = draftId;
        } else {
          setError('Draft application not found');
        }
      } catch (err) {
        console.error('Error loading draft:', err);
        setError('Failed to load draft application');
      } finally {
        setLoadingDraft(false);
      }
    };
    
    loadDraft();
  }, [draftId, getApplication, getDocuments, initialFormData]);
  
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

  const isBulkApplicant = !!(userProfile as any)?.is_bulk_applicant;

  // ⚡ PERFORMANCE: Memoize submit handler to prevent re-renders
  const handleSubmitApplication = useCallback(async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Form data received:', formData);
      
      // Debug: Log all file fields in formData
      const fileFields = Object.entries(formData).filter(([_, value]) => value instanceof File);
      console.log('📎 File fields in formData:', fileFields.map(([key, file]) => ({ key, name: (file as File).name, size: (file as File).size })));
      
      // ⚡ PERFORMANCE: Run storage bucket check and data mapping in parallel
      const [_, applicationData] = await Promise.all([
        ensureStorageBucket(),
        Promise.resolve(mapFormDataToApplication(formData, status, userProfile?.id))
      ]);
      
      console.log('📊 Mapped application data:', applicationData);
      
      // Create the application first
      const newApplication = await createApplication(applicationData);
      
      if (newApplication) {
        console.log('✅ Application created successfully:', newApplication);

        // Fire-and-forget: send submission SMS + email (idempotent server-side)
        try {
          fetch('/api/notifications/send-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: newApplication.id }),
          }).catch(() => null)
        } catch {}
        
        // Upload documents and WAIT for completion before showing success
        console.log('🚀 Starting document upload process...');
        try {
          const uploadedDocuments = await uploadApplicationDocuments(newApplication.id, formData, userProfile?.id);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
        } catch (docError) {
          console.error('⚠️ Document upload failed:', docError);
          setError('Application created but some documents failed to upload. Please contact support.');
          setIsLoading(false);
          return;
        }
        
        // Show success message (redirect is handled by useEffect)
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed to submit application');
      }
    } catch (error) {
      console.error('❌ Error submitting application:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  }, [createApplication, userProfile?.id, router]);

  // ⚡ PERFORMANCE: Memoize draft handler and optimize operations
  const handleSaveAsDraft = useCallback(async (formData: any, status: 'draft', draftId: string | null = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Validate essential form data
      if (!formData) {
        throw new Error('No form data provided');
      }
      
      // Debug: Log all file fields in formData
      const fileFields = Object.entries(formData).filter(([_, value]) => value instanceof File);
      console.log('📎 File fields in formData:', fileFields.map(([key, file]) => ({ key, name: (file as File).name, size: (file as File).size })));
      
      // ⚡ PERFORMANCE: Run bucket check and data mapping in parallel
      const [_, applicationData] = await Promise.all([
        ensureStorageBucket(),
        Promise.resolve(mapFormDataToApplication(formData, status, userProfile?.id))
      ]);
      
      let result;
      
      if (draftId) {
        // Update existing draft
        // Never attempt to update ownership fields from the client (can violate RLS/policies)
        const { applicant_id, ...updateData } = applicationData as any;
        result = await updateApplication(draftId, updateData);
      } else {
        // Create new draft
        result = await createApplication(applicationData);
      }
      
      if (result) {
        // Upload documents and WAIT for completion
        console.log('🚀 Starting document upload process for draft...');
        let uploadedDocuments: Document[] = [];
        try {
          uploadedDocuments = await uploadApplicationDocuments(result.id, formData, userProfile?.id);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
          if (uploadedDocuments.length > 0) {
            const freshMap = buildInitialDocumentMapFromRecords(uploadedDocuments);
            if (Object.keys(freshMap).length > 0) {
              setInitialDocuments(prev => ({ ...prev, ...freshMap }));
            }
          }
        } catch (docError) {
          console.error('⚠️ Document upload failed:', docError);
          setError('Draft saved but some documents failed to upload. Please try uploading them again.');
        }

        // Keep in-memory document URLs synchronized so the form reflects saved uploads immediately.
        try {
          const latestDocuments = await getDocuments(result.id);
          const latestMap = buildInitialDocumentMapFromRecords(
            Array.isArray(latestDocuments) ? (latestDocuments as Document[]) : []
          );
          if (Object.keys(latestMap).length > 0) {
            setInitialDocuments(prev => ({ ...prev, ...latestMap }));
          }
        } catch (docRefreshError) {
          console.warn('⚠️ Failed to refresh draft document map (non-blocking):', docRefreshError);
        }
        
        // Re-fetch the full application (includes applicant join from users table)
        // so that the payment tab can read applicant contact details.
        const fullApplication = await getApplication(result.id);

        // Update URL with draft ID if this is a new draft
        if (!draftId && result.id) {
          const newUrl = `/dashboard/new-application?id=${result.id}`;
          window.history.replaceState(
            { ...window.history.state, as: newUrl, url: newUrl },
            '',
            newUrl
          );
        }

        setCurrentApplication(fullApplication ?? result);
        
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
        
        return fullApplication ?? result;
      } else {
        throw new Error('Failed to save draft - no result returned from database operation');
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to save draft';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [createApplication, updateApplication, getApplication, getDocuments, userProfile?.id, router]);

  // Auto-redirect ONLY after submit (draft saves must not redirect)
  useEffect(() => {
    if (submitSuccess) {
      const timer = setTimeout(() => {
        router.push("/dashboard?tab=applications&success=application-submitted");
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [submitSuccess, router]);

  // Handle application mode selection
  const handleModeSelect = useCallback((mode: ApplicationMode) => {
    setApplicationMode(mode);
    if (mode === 'new') {
      // Update URL to reflect mode
      const newUrl = `/dashboard/new-application?mode=new`;
      window.history.replaceState(
        { ...window.history.state, as: newUrl, url: newUrl },
        '',
        newUrl
      );
    } else if (mode === 'transfer') {
      setTransferStep('select-permit');
    } else if (mode === 'modification') {
      setModificationStep('select-permit');
    } else if (mode === 'renewal') {
      setRenewalStep('select-permit');
    }
  }, []);

  // Handle permit selection for transfer
  const handlePermitSelect = useCallback((permit: PermitWithApplication) => {
    setSelectedPermit(permit);
    setTransferStep('fill-form');
  }, [createManualSelectedPermit]);

  const handleManualTransferPermitSelect = useCallback((payload: ManualPermitSelectionPayload) => {
    setCurrentTransferApplication(null);
    setSelectedPermit(createManualSelectedPermit(payload) as unknown as PermitWithApplication);
    setTransferStep('fill-form');
  }, [createManualSelectedPermit]);

  // Handle transfer cancellation
  const handleTransferCancel = useCallback(() => {
    setSelectedPermit(null);
    setTransferStep('select-permit');
    setApplicationMode(null);
  }, [createManualSelectedPermit]);

  const buildTransferCustomerSnapshot = useCallback((formData: any) => {
    const profileLike = userProfile as unknown as Record<string, unknown> | null | undefined;
    const profilePhone =
      (typeof profileLike?.phone === 'string' && profileLike.phone.trim()) ||
      (typeof profileLike?.mobile_phone === 'string' && profileLike.mobile_phone.trim()) ||
      (typeof profileLike?.company_phone === 'string' && profileLike.company_phone.trim()) ||
      (typeof profileLike?.landline_phone === 'string' && profileLike.landline_phone.trim()) ||
      '';

    const profileName =
      `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() ||
      userProfile?.company_name ||
      '';

    return {
      email: String(formData?.transferorEmail || userProfile?.email || '').trim(),
      phone: String(formData?.transferorPhone || profilePhone || '').trim(),
      name: String(formData?.transferorName || profileName || '').trim(),
    };
  }, [userProfile]);

  // Handle transfer form submission
  const handleTransferSubmit = useCallback(async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Transfer form data received:', formData);
      
      // Create a transfer application in the applications table
      // Uses 'transfer' type to follow same status flow but skip field reports
      const permitReference =
        (selectedPermit as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermit?.permit_number || "",
          normalizedPermitNumber: selectedPermit?.permit_number || "",
          lookupStatus: "found" as const,
        };
      const customerSnapshot = buildTransferCustomerSnapshot(formData);
      const normalizedWaterSource = formatWaterSourceForDB(
        formData.waterSourceType || selectedPermit?.water_source || 'other'
      );
      const normalizedWaterPurpose = formatWaterPurposeForDB(
        formData.waterPurpose || selectedPermit?.purpose || 'other'
      );
      const originalActivities = Array.isArray(selectedPermit?.application?.intended_activities)
        ? selectedPermit.application.intended_activities
        : [];
      // For manual permits, derive intended_activities from the form's waterPurpose so that
      // isConcessionApplication() works correctly on the terms/permit pages.
      const isManualSelectedPermit = typeof selectedPermit?.id === 'string' && selectedPermit.id.startsWith('manual-');
      const manualActivities = isManualSelectedPermit && formData.waterPurpose ? [formData.waterPurpose] : [];
      const resolvedActivities = originalActivities.length > 0 ? originalActivities : manualActivities;

      // Concession area from form (used for concession permits: fish farming in lakes, recreation)
      const pureConcessionPurposes = ["fish_farming_lakes", "recreation_activities", "port_construction"];
      const isConcessionTransfer = pureConcessionPurposes.includes(formData.waterPurpose || "") ||
        formData.waterUseCategory === "concession";
      const concessionAreaValue = formData.concessionArea ? parseFloat(formData.concessionArea) : undefined;

      const transferApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'pending_payment',
        application_type: 'transfer',
        water_source: normalizedWaterSource,
        water_purpose: normalizedWaterPurpose,
        province: formData.permitLocationProvince || selectedPermit?.application?.province || 'Kigali',
        district: formData.permitLocationDistrict || selectedPermit?.application?.district || '',
        sector: formData.permitLocationSector || selectedPermit?.application?.sector || '',
        cell: formData.permitLocationCell || selectedPermit?.application?.cell || '',
        village: formData.permitLocationVillage || selectedPermit?.application?.village || '',
        water_body_name: formData.waterSourceName || selectedPermit?.application?.water_body_name || '',
        project_title: `Transfer: ${formData.transfereeName} Water Permit Application`,
        project_description: `Permit transfer request for permit ${formData.permitNumber || selectedPermit?.permit_number}`,
        sla_status: 'on_time',
        water_taking_method: !isConcessionTransfer ? (formData.abstractionMethod || selectedPermit?.application?.water_taking_method || '') : '',
        flow_rate_m3_per_second: !isConcessionTransfer && formData.flowRate ? parseFloat(formData.flowRate) : (selectedPermit?.application?.flow_rate_m3_per_second ?? undefined),
        ...(resolvedActivities.length > 0 ? { intended_activities: resolvedActivities } : {}),
        ...(isConcessionTransfer && concessionAreaValue && !isNaN(concessionAreaValue) && concessionAreaValue > 0
          ? { concession_area: concessionAreaValue }
          : {}),
        // Save polygon geometry to DB coordinates field for concession transfer permits
        ...(isConcessionTransfer && Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0 ? (() => {
          try {
            const geoFeature = polygonsToGeoJSON(formData.waterSourcePolygons);
            return geoFeature ? { coordinates: geoFeature.geometry } : {};
          } catch { return {}; }
        })() : {}),
        internal_notes: JSON.stringify({
          isTransfer: true,
          originalPermitId: selectedPermit?.id,
          originalPermitNumber: selectedPermit?.permit_number,
          transferFormData: formData,
          customerSnapshot,
          waterSourceLatitude: !isConcessionTransfer ? (formData.waterSourceLatitude || '') : '',
          waterSourceLongitude: !isConcessionTransfer ? (formData.waterSourceLongitude || '') : '',
          ...(isConcessionTransfer && concessionAreaValue ? { concessionArea: concessionAreaValue, concessionAreaUnit: formData.concessionAreaUnit || 'ha' } : {}),
          ...(isConcessionTransfer && Array.isArray(formData.waterSourcePolygons) ? { waterSourcePolygons: formData.waterSourcePolygons } : {}),
          ...(permitReference ? { permitReference } : {}),
        }),
      };
      
      const newApplication = await createApplication(transferApplicationData);
      
      if (newApplication) {
        console.log('✅ Transfer application created:', newApplication);

        // Create transferee-facing transfer request + notify transferee (email/SMS).
        // Non-blocking: transfer submission should not fail if notifications fail.
        try {
          const resp = await fetch('/api/transfers/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationId: newApplication.id,
              originalPermitId: selectedPermit?.id,
              transfereeEmail: formData?.transfereeEmail,
              transfereePhone: formData?.transfereePhone,
            }),
          });
          const json = await resp.json().catch(() => null);
          if (!resp.ok || !json?.success) {
            console.warn('⚠️ Failed to create/notify transfer request (non-blocking):', json?.message || resp.statusText);
          } else {
            console.log('✅ Transfer request created and transferee notified');
          }
        } catch (e) {
          console.warn('⚠️ Transfer request notification crashed (non-blocking):', e);
        }
        
        // Upload documents
        await ensureStorageBucket();
        const uploadedDocs = await uploadApplicationDocuments(newApplication.id, {
          ...formData,
          legacyPermitIdentityProof: (selectedPermit as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
        }, userProfile?.id);
        console.log(`📎 ${uploadedDocs.length} documents uploaded`);
        
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed to create transfer application');
      }
    } catch (error) {
      console.error('❌ Error submitting transfer:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit transfer request');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermit, userProfile?.id, createApplication, buildTransferCustomerSnapshot]);

  // Handle transfer draft save
  const handleTransferSaveAsDraft = useCallback(async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Uses 'transfer' type to follow same status flow but skip field reports
      const permitReference =
        (selectedPermit as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermit?.permit_number || "",
          normalizedPermitNumber: selectedPermit?.permit_number || "",
          lookupStatus: "found" as const,
        };
      const customerSnapshot = buildTransferCustomerSnapshot(formData);
      const normalizedWaterSource = formatWaterSourceForDB(
        formData.waterSourceType || selectedPermit?.water_source || 'other'
      );
      const normalizedWaterPurpose = formatWaterPurposeForDB(
        formData.waterPurpose || selectedPermit?.purpose || 'other'
      );
      const draftOriginalActivities = Array.isArray(selectedPermit?.application?.intended_activities)
        ? selectedPermit.application.intended_activities
        : [];
      // For manual permits, derive intended_activities from waterPurpose so isConcessionApplication() works
      const isDraftManualPermit = typeof selectedPermit?.id === 'string' && selectedPermit.id.startsWith('manual-');
      const draftManualActivities = isDraftManualPermit && formData.waterPurpose ? [formData.waterPurpose] : [];
      const draftResolvedActivities = draftOriginalActivities.length > 0 ? draftOriginalActivities : draftManualActivities;

      const draftPureConcessionPurposes = ["fish_farming_lakes", "recreation_activities", "port_construction"];
      const isDraftConcession = draftPureConcessionPurposes.includes(formData.waterPurpose || "") ||
        formData.waterUseCategory === "concession";
      const draftConcessionArea = formData.concessionArea ? parseFloat(formData.concessionArea) : undefined;

      const transferApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: 'transfer',
        water_source: normalizedWaterSource,
        water_purpose: normalizedWaterPurpose,
        province: formData.permitLocationProvince || selectedPermit?.application?.province || 'Kigali',
        district: formData.permitLocationDistrict || selectedPermit?.application?.district || '',
        sector: formData.permitLocationSector || selectedPermit?.application?.sector || '',
        cell: formData.permitLocationCell || selectedPermit?.application?.cell || '',
        village: formData.permitLocationVillage || selectedPermit?.application?.village || '',
        water_body_name: formData.waterSourceName || selectedPermit?.application?.water_body_name || '',
        project_title: `Transfer: ${formData.transfereeName || formData.facilityProjectName || selectedPermit?.permit_number} Water Permit Application`,
        project_description: `Permit transfer request for permit ${formData.permitNumber || selectedPermit?.permit_number}`,
        sla_status: 'on_time',
        water_taking_method: !isDraftConcession ? (formData.abstractionMethod || selectedPermit?.application?.water_taking_method || '') : '',
        flow_rate_m3_per_second: !isDraftConcession && formData.flowRate ? parseFloat(formData.flowRate) : (selectedPermit?.application?.flow_rate_m3_per_second ?? undefined),
        ...(draftResolvedActivities.length > 0 ? { intended_activities: draftResolvedActivities } : {}),
        ...(isDraftConcession && draftConcessionArea && !isNaN(draftConcessionArea) && draftConcessionArea > 0
          ? { concession_area: draftConcessionArea }
          : {}),
        ...(isDraftConcession && Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0 ? (() => {
          try {
            const geoFeature = polygonsToGeoJSON(formData.waterSourcePolygons);
            return geoFeature ? { coordinates: geoFeature.geometry } : {};
          } catch { return {}; }
        })() : {}),
        internal_notes: JSON.stringify({
          isTransfer: true,
          originalPermitId: selectedPermit?.id,
          originalPermitNumber: selectedPermit?.permit_number,
          transferFormData: formData,
          customerSnapshot,
          waterSourceLatitude: !isDraftConcession ? (formData.waterSourceLatitude || '') : '',
          waterSourceLongitude: !isDraftConcession ? (formData.waterSourceLongitude || '') : '',
          ...(isDraftConcession && draftConcessionArea ? { concessionArea: draftConcessionArea, concessionAreaUnit: formData.concessionAreaUnit || 'ha' } : {}),
          ...(isDraftConcession && Array.isArray(formData.waterSourcePolygons) ? { waterSourcePolygons: formData.waterSourcePolygons } : {}),
          ...(permitReference ? { permitReference } : {}),
        }),
      };

      let result: Application | null = null;

      if (currentTransferApplication?.id) {
        // Update existing draft instead of creating duplicates
        const { applicant_id, ...updateData } = transferApplicationData as any;
        result = await updateApplication(currentTransferApplication.id, updateData);
      } else {
        result = await createApplication(transferApplicationData);
      }

      if (!result) {
        throw new Error('Failed to save transfer draft — database returned no data.');
      }
      
      await ensureStorageBucket();
      await uploadApplicationDocuments(result.id, {
        ...formData,
        legacyPermitIdentityProof: (selectedPermit as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
      }, userProfile?.id);
      
      // Track the current transfer application for payment tab
      setCurrentTransferApplication(result);
      
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
      
      return result;
    } catch (error) {
      console.error('Error saving transfer draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermit, userProfile?.id, createApplication, updateApplication, currentTransferApplication, buildTransferCustomerSnapshot]);

  // User data for transfer form
  const transferUserData = useMemo(() => ({
    email: userProfile?.email || "",
    name: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() || userProfile?.company_name || "",
    phone:
      (
        (
          (userProfile as unknown as Record<string, unknown> | null | undefined)?.phone ||
          (userProfile as unknown as Record<string, unknown> | null | undefined)?.mobile_phone ||
          (userProfile as unknown as Record<string, unknown> | null | undefined)?.company_phone ||
          (userProfile as unknown as Record<string, unknown> | null | undefined)?.landline_phone ||
          ""
        ) as string
      ).trim(),
    address: userProfile?.company_address || "",
    account_type: userProfile?.account_type || 'individual',
  }), [userProfile]);

  // Handle permit selection for modification
  const handleModificationPermitSelect = useCallback(async (permit: PermitWithApplication) => {
    setSelectedPermitForModification(permit);
    
    // Load original application data AND documents for comparison
    try {
      if (permit.application_id) {
        // Load application and documents in parallel
        const [originalApplication, documents] = await Promise.all([
          getApplication(permit.application_id),
          getDocuments(permit.application_id)
        ]);

        if (originalApplication) {
          // Parse internal_notes to get the original form data
          const originalFormData = (() => {
            try {
              const parsed = JSON.parse((originalApplication as any).internal_notes || "{}");
              return parsed && typeof parsed === "object" ? parsed : {};
            } catch {
              return {};
            }
          })();
          
          // If internal_notes doesn't have all data, fall back to application fields
          if (!originalFormData.intendedActivities && (originalApplication as any).intended_activities) {
            originalFormData.intendedActivities = (originalApplication as any).intended_activities;
          }

          // Backfill permitLengthYears from proposed_duration_years if internal_notes didn't include it
          if (originalFormData.permitLengthYears == null && (originalApplication as any).proposed_duration_years != null) {
            originalFormData.permitLengthYears = Number((originalApplication as any).proposed_duration_years);
          }

          // Back-compat: normalize legacy single polygon into waterSourcePolygons
          if (!Array.isArray(originalFormData.waterSourcePolygons) || originalFormData.waterSourcePolygons.length === 0) {
            if (Array.isArray(originalFormData.waterSourceCoordinates)) {
              originalFormData.waterSourcePolygons = [originalFormData.waterSourceCoordinates];
            }
          }

          // Backfill LAT/LONG from stored geometry if internal_notes didn't include it
          if (
            (originalFormData.waterSourceLatitude == null || String(originalFormData.waterSourceLatitude).trim() === "") &&
            (originalFormData.waterSourceLongitude == null || String(originalFormData.waterSourceLongitude).trim() === "")
          ) {
            const geom: any = (originalApplication as any).coordinates;
            if (geom && geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
              const [lng, lat] = geom.coordinates;
              originalFormData.waterSourceLatitude = String(lat ?? "");
              originalFormData.waterSourceLongitude = String(lng ?? "");
            }
          }

          if (!Array.isArray(originalFormData.additionalDocuments)) {
            originalFormData.additionalDocuments = [];
          }

          const transferFormData = (() => {
            const raw = (originalFormData as Record<string, unknown>)?.transferFormData;
            return raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : null;
          })();
          const sourceIsTransfer =
            (originalApplication as any).application_type === "transfer" ||
            (originalFormData as Record<string, unknown>)?.isTransfer === true ||
            Boolean(transferFormData);
          if (sourceIsTransfer && transferFormData) {
            const hasText = (value: unknown) =>
              typeof value === "string" && value.trim().length > 0;
            const transfereePhone = typeof transferFormData.transfereePhone === "string" ? transferFormData.transfereePhone.trim() : "";
            const transfereeEmail = typeof transferFormData.transfereeEmail === "string" ? transferFormData.transfereeEmail.trim() : "";

            if (!hasText(originalFormData.telephoneContact) && transfereePhone) {
              originalFormData.telephoneContact = transfereePhone;
            }
            if (!hasText(originalFormData.emailAddress) && transfereeEmail) {
              originalFormData.emailAddress = transfereeEmail;
            }
            if (!hasText(originalFormData.telephoneContactOffice) && transfereePhone) {
              originalFormData.telephoneContactOffice = transfereePhone;
            }
          }

          // Process documents from the original application (same logic as loadDraft)
          const documentMap: Record<string, { url: string; name: string }> = {};
          const additionalDocsFromDb: Array<{ id?: string; name: string; url: string }> = [];

          console.log('📄 [Modification] Processing documents from DB:', documents.length);
          for (const doc of documents) {
            console.log('📄 [Modification] Document:', { name: doc.name, type: doc.type, file_path: doc.file_path });
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const rawFileName = (() => {
                  try {
                    if (doc.file_path.startsWith("http://") || doc.file_path.startsWith("https://")) {
                      return new URL(doc.file_path).pathname.split("/").pop() || "";
                    }
                  } catch {}
                  return doc.file_path.split("/").pop() || "";
                })();

                if (rawFileName.startsWith("additional_")) {
                  const m = rawFileName.match(/^additional_(.+?)-\d+\./);
                  additionalDocsFromDb.push({ id: m?.[1], name: doc.name, url: publicUrl });
                } else {
                  const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                  documentMap[fieldName] = {
                    url: publicUrl,
                    name: doc.name
                  };
                }
              }
            }
          }

          // Merge additional documents
          if (additionalDocsFromDb.length > 0) {
            const existing = Array.isArray(originalFormData.additionalDocuments) ? originalFormData.additionalDocuments : [];
            const byId = new Map<string, any>();
            const byName = new Map<string, any>();
            for (const d of existing) {
              if (d?.id) byId.set(String(d.id), d);
              if (d?.name) byName.set(String(d.name), d);
            }

            for (const dbDoc of additionalDocsFromDb) {
              const match =
                (dbDoc.id ? byId.get(String(dbDoc.id)) : undefined) ||
                byName.get(String(dbDoc.name));

              if (match) {
                match.url = dbDoc.url;
                match.file = null;
                if (!match.category) {
                  match.category = inferAdditionalDocumentCategoryFromId(dbDoc.id);
                }
              } else {
                existing.push({
                  id: dbDoc.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                  name: dbDoc.name,
                  category: inferAdditionalDocumentCategoryFromId(dbDoc.id),
                  description: "",
                  file: null,
                  url: dbDoc.url,
                });
              }
            }

            originalFormData.additionalDocuments = existing;
          }

          console.log('✅ [Modification] Document map:', Object.keys(documentMap));
          
          setOriginalApplicationData(originalFormData);
          setInitialFormData(originalFormData);
          setInitialDocuments(documentMap);
        }
      }
    } catch (error) {
      console.error('❌ Error loading original application data:', error);
    }
    
    setModificationStep('fill-form');
  }, [getApplication, getDocuments]);

  const handleManualModificationPermitSelect = useCallback((payload: ManualPermitSelectionPayload) => {
    const manualPermit = createManualSelectedPermit(payload) as unknown as PermitWithApplication;
    const profileName =
      `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim() ||
      userProfile?.company_name ||
      "";
    const profilePhone = userProfile?.phone || userProfile?.company_phone || "";
    const applicantCategory =
      userProfile?.account_type === "company"
        ? "company"
        : userProfile?.account_type === "individual"
          ? "individual"
          : payload.permitReference.manualHolderType === "company_org"
            ? "company"
            : "individual";
    const applicantName = profileName || payload.permitReference.manualHolderName || "";
    const registryPurpose = payload.permitReference.registrySnapshot?.purpose || "";
    const registrySource = payload.permitReference.registrySnapshot?.water_source || "";
    setCurrentModificationApplication(null);
    setSelectedPermitForModification(manualPermit);
    setOriginalApplicationData({
      fullNameApplicant: applicantName,
      categoryApplicant: applicantCategory,
      telephoneContact: profilePhone,
      telephoneContactOffice: userProfile?.company_phone || "",
      emailAddress: userProfile?.email || "",
      officeProvince: "",
      officeDistrict: "",
      officeSector: "",
      officeCell: "",
      officeVillage: "",
      waterSourceType: "",
      nameSourceWater: "",
      waterSourceProvince: "",
      waterSourceDistrict: "",
      waterSourceSector: "",
      waterSourceCell: "",
      waterSourceVillage: "",
      intendedActivities: [],
      permitLengthYears: undefined,
      waterAbstractionDetails: [{ maxAverageYearly: undefined }],
      permitReference: payload.permitReference,
    });
    setInitialFormData({
      fullNameApplicant: applicantName,
      categoryApplicant: applicantCategory,
      telephoneContact: profilePhone,
      telephoneContactOffice: userProfile?.company_phone || "",
      emailAddress: userProfile?.email || "",
      officeProvince: "",
      officeDistrict: "",
      officeSector: "",
      officeCell: "",
      officeVillage: "",
      waterSourceType: "",
      nameSourceWater: "",
      tributaryToMain: "",
      intendedActivityOther: "",
      waterSourceProvince: "",
      waterSourceDistrict: "",
      waterSourceSector: "",
      waterSourceCell: "",
      waterSourceVillage: "",
      waterSourceLatitude: "",
      waterSourceLongitude: "",
      intendedActivities: [],
      permitLengthYears: undefined,
      waterAbstractionDetails: [{ maxAverageYearly: undefined }],
      permitReference: payload.permitReference,
      // Optional helper context for applicant (still requires final explicit selections)
      _registryHintPurpose: registryPurpose,
      _registryHintWaterSource: registrySource,
      modificationReason: "",
    });
    setInitialDocuments({});
    setModificationStep('fill-form');
  }, [createManualSelectedPermit, userProfile]);

  // Handle modification cancellation
  const handleModificationCancel = useCallback(() => {
    setSelectedPermitForModification(null);
    setModificationStep('select-permit');
    setApplicationMode(null);
    setOriginalApplicationData(null);
  }, []);

  // Handle permit selection for renewal
  const handleRenewalPermitSelect = useCallback(async (permit: RenewalPermitWithApplication) => {
    // Starting a NEW renewal flow should not inherit any previously-loaded draft
    // application state from another renewal session.
    setCurrentRenewalApplication(null);
    setSelectedPermitForRenewal(permit);
    setRenewalStep('fill-form');
  }, []);

  const handleManualRenewalPermitSelect = useCallback((payload: ManualPermitSelectionPayload) => {
    setCurrentRenewalApplication(null);
    setSelectedPermitForRenewal(createManualSelectedPermit(payload) as unknown as RenewalPermitWithApplication);
    setRenewalStep('fill-form');
  }, [createManualSelectedPermit]);

  // Handle renewal cancellation
  const handleRenewalCancel = useCallback(() => {
    setSelectedPermitForRenewal(null);
    setRenewalStep('select-permit');
    setApplicationMode(null);
  }, []);

  // Handle renewal form submission
  const handleRenewalSubmit = useCallback(async (formData: any) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Renewal form data received:', formData);

      const report = formData?.waterUseReport;
      const requiredReportSections = [
        'section3',
        'section3_quarterly',
        'section4',
        'section5_monitoring',
        'section6_employment',
        'section6_ohs',
        'section7',
        'section8',
        'section9_declaration',
      ];
      const hasAllReportSections = requiredReportSections.every((sectionKey) => {
        const value = report?.[sectionKey];
        return value !== null && value !== undefined;
      });
      const hasValidDeclaration =
        Boolean(report?.section9_declaration?.declarantName) &&
        Boolean(report?.section9_declaration?.declarationDate) &&
        report?.section9_declaration?.agreed === true;

      if (!hasAllReportSections || !hasValidDeclaration) {
        throw new Error('Complete and submit all Water Use Report sections before submitting renewal.');
      }

      const hasLegacyIdentityProof = Boolean(
        (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile,
      );
      let hasRenewalLetter = Boolean(formData?.renewalLetter) || hasLegacyIdentityProof;

      if (!hasRenewalLetter && currentRenewalApplication?.id) {
        const { data: existingLetter, error: existingLetterError } = await supabase
          .from('documents')
          .select('id')
          .eq('application_id', currentRenewalApplication.id)
          .eq('type', 'renewal_request_letter')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingLetterError) {
          console.error('❌ Failed to verify existing renewal letter document:', existingLetterError);
        }

        const existingLetterRecord = existingLetter as { id?: string } | null;
        hasRenewalLetter = Boolean(existingLetterRecord?.id);
      }

      if (!hasRenewalLetter) {
        throw new Error('Upload the required renewal request letter before submitting renewal.');
      }

      // 🔒 Normalize water_purpose: DB may have migrated 'aquaculture' → 'fish_farming_lakes'.
      const rawPurpose: string = selectedPermitForRenewal?.purpose || 'other';
      const normalizedPurpose = rawPurpose === 'aquaculture' ? 'fish_farming_lakes' : rawPurpose;

      // Strip File objects from internal_notes payload
      const safeFormData = { ...formData };
      delete safeFormData.renewalLetter;
      const permitReference =
        (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermitForRenewal?.permit_number || "",
          normalizedPermitNumber: selectedPermitForRenewal?.permit_number || "",
          lookupStatus: "found" as const,
        };
      
      // Prefer permit details entered by user (manual permits) over permit object
      const pd = formData.permitDetails;

      const corePayload: Record<string, unknown> = {
        applicant_id: userProfile?.id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        application_type: pickNonTransferAppType(
          (selectedPermitForRenewal?.application as any)?.application_type,
          pd?.intendedActivity ||
            selectedPermitForRenewal?.application?.water_purpose ||
            selectedPermitForRenewal?.purpose
        ),
        water_source: pd?.waterSourceType || selectedPermitForRenewal?.water_source || 'other',
        water_purpose: pd?.waterPurpose || normalizedPurpose,
        province: pd?.province || selectedPermitForRenewal?.application?.province || 'Kigali',
        district: pd?.district || selectedPermitForRenewal?.application?.district || '',
        sector: pd?.sector || selectedPermitForRenewal?.application?.sector || '',
        cell: pd?.cell || selectedPermitForRenewal?.application?.cell || '',
        village: pd?.village || selectedPermitForRenewal?.application?.village || '',
        water_body_name: pd?.waterSourceName || selectedPermitForRenewal?.application?.water_body_name || '',
        project_title: `Renewal: ${selectedPermitForRenewal?.application?.project_title || selectedPermitForRenewal?.permit_number}`,
        project_description: `Permit renewal request for permit ${selectedPermitForRenewal?.permit_number}`,
        sla_status: 'on_time',
        internal_notes: JSON.stringify({
          isRenewal: true,
          originalPermitId: selectedPermitForRenewal?.id,
          originalPermitNumber: selectedPermitForRenewal?.permit_number,
          originalApplicationId: selectedPermitForRenewal?.application_id,
          waterUseReport: formData.waterUseReport,
          renewalFormData: safeFormData,
          permitDetails: pd || null,
          ...(permitReference ? { permitReference } : {}),
        }),
      };

      // Migration-dependent columns — added optimistically.
      const optionalColumns: Record<string, unknown> = { is_renewal: true };
      const renewedFromPermitId = toUuidOrNull(selectedPermitForRenewal?.id);
      if (renewedFromPermitId) {
        optionalColumns.renewed_from_permit_id = renewedFromPermitId;
      }
      const activities = pd?.intendedActivity
        ? [pd.intendedActivity]
        : selectedPermitForRenewal?.application?.intended_activities;
      if (activities) {
        optionalColumns.intended_activities = activities;
      }
      if (pd?.abstractionMethod) {
        optionalColumns.water_taking_method = pd.abstractionMethod;
      }
      if (pd?.flowRate != null) {
        optionalColumns.flow_rate_m3_per_second = pd.flowRate;
      }
      if (pd?.maxDailyVolume != null) {
        optionalColumns.max_daily_volume_m3 = pd.maxDailyVolume;
      }
      if (pd?.maxYearlyVolume != null) {
        optionalColumns.max_yearly_volume_m3 = pd.maxYearlyVolume;
      }
      if (pd?.concessionArea != null) {
        optionalColumns.concession_area = pd.concessionArea;
      }

      const renewalApplicationData = { ...corePayload, ...optionalColumns };
      
      let resultApplication: Application | null = null;
      
      // If we already have a draft renewal application, update it to submitted
      if (currentRenewalApplication?.id) {
        const { applicant_id, ...updateData } = renewalApplicationData;
        resultApplication = await updateApplication(currentRenewalApplication.id, updateData as Partial<Application>);
        console.log('✅ Renewal application updated to submitted:', resultApplication?.id);
      } else {
        resultApplication = await createApplication(renewalApplicationData as Partial<Application>);
        console.log('✅ Renewal application created:', resultApplication?.id);
      }
      
      if (resultApplication) {
        // Fire-and-forget: send submission SMS + email
        try {
          fetch('/api/notifications/send-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: resultApplication.id }),
          }).catch(() => null)
        } catch {}
        
        // Upload renewal letter document
        await ensureStorageBucket();
        if (formData.renewalLetter || (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile) {
          const uploadedDocs = await uploadApplicationDocuments(resultApplication.id, {
            renewalRequestLetter: formData.renewalLetter,
            legacyPermitIdentityProof: (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
          }, userProfile?.id);
          console.log(`📎 ${uploadedDocs.length} documents uploaded`);
        }
        
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed to submit renewal application — database returned no data.');
      }
    } catch (error) {
      console.error('❌ Error submitting renewal:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit renewal request');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermitForRenewal, userProfile?.id, createApplication, updateApplication, currentRenewalApplication]);

  // Handle renewal draft save
  const handleRenewalSaveAsDraft = useCallback(async (formData: any, _status: string): Promise<void> => {
    console.log('📋 handleRenewalSaveAsDraft ENTERED', {
      hasFormData: !!formData,
      status: _status,
      hasSelectedPermit: !!selectedPermitForRenewal,
      permitId: selectedPermitForRenewal?.id,
      userId: userProfile?.id,
      hasCurrentApp: !!currentRenewalApplication,
    });
    try {
      setIsLoading(true);
      setError(null);

      // 🔒 Normalize water_purpose: DB may have migrated 'aquaculture' → 'fish_farming_lakes'.
      const rawWaterPurpose: string = selectedPermitForRenewal?.purpose || 'other';
      const normalizedWaterPurpose = rawWaterPurpose === 'aquaculture' ? 'fish_farming_lakes' : rawWaterPurpose;

      // Strip non-serializable File objects from the data stored in internal_notes
      // to keep the JSON payload clean and small.
      const safeFormDataForNotes = { ...formData };
      delete safeFormDataForNotes.renewalLetter; // File objects serialize to {}
      const permitReference =
        (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermitForRenewal?.permit_number || "",
          normalizedPermitNumber: selectedPermitForRenewal?.permit_number || "",
          lookupStatus: "found" as const,
        };
      
      // Prefer permit details entered by user (manual permits) over permit object
      const pd = formData.permitDetails;

      const corePayload: Record<string, unknown> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: pickNonTransferAppType(
          (selectedPermitForRenewal?.application as any)?.application_type,
          pd?.intendedActivity ||
            selectedPermitForRenewal?.application?.water_purpose ||
            selectedPermitForRenewal?.purpose
        ),
        water_source: pd?.waterSourceType || selectedPermitForRenewal?.water_source || 'other',
        water_purpose: pd?.waterPurpose || normalizedWaterPurpose,
        province: pd?.province || selectedPermitForRenewal?.application?.province || 'Kigali',
        district: pd?.district || selectedPermitForRenewal?.application?.district || '',
        sector: pd?.sector || selectedPermitForRenewal?.application?.sector || '',
        cell: pd?.cell || selectedPermitForRenewal?.application?.cell || '',
        village: pd?.village || selectedPermitForRenewal?.application?.village || '',
        water_body_name: pd?.waterSourceName || selectedPermitForRenewal?.application?.water_body_name || '',
        project_title: `Renewal: ${selectedPermitForRenewal?.application?.project_title || selectedPermitForRenewal?.permit_number}`,
        project_description: `Permit renewal request for permit ${selectedPermitForRenewal?.permit_number}`,
        sla_status: 'on_time',
        internal_notes: JSON.stringify({
          isRenewal: true,
          originalPermitId: selectedPermitForRenewal?.id,
          originalPermitNumber: selectedPermitForRenewal?.permit_number,
          originalApplicationId: selectedPermitForRenewal?.application_id,
          waterUseReport: formData.waterUseReport,
          renewalFormData: safeFormDataForNotes,
          permitDetails: pd || null,
          ...(permitReference ? { permitReference } : {}),
        }),
      };

      // Migration-dependent columns — added optimistically, stripped on retry.
      const optionalColumns: Record<string, unknown> = {};
      const renewedFromPermitId = toUuidOrNull(selectedPermitForRenewal?.id);
      if (renewedFromPermitId) {
        optionalColumns.renewed_from_permit_id = renewedFromPermitId;
      }
      optionalColumns.is_renewal = true;
      const draftActivities = pd?.intendedActivity
        ? [pd.intendedActivity]
        : selectedPermitForRenewal?.application?.intended_activities;
      if (draftActivities) {
        optionalColumns.intended_activities = draftActivities;
      }
      if (pd?.abstractionMethod) {
        optionalColumns.water_taking_method = pd.abstractionMethod;
      }
      if (pd?.flowRate != null) {
        optionalColumns.flow_rate_m3_per_second = pd.flowRate;
      }
      if (pd?.maxDailyVolume != null) {
        optionalColumns.max_daily_volume_m3 = pd.maxDailyVolume;
      }
      if (pd?.maxYearlyVolume != null) {
        optionalColumns.max_yearly_volume_m3 = pd.maxYearlyVolume;
      }

      const renewalApplicationData: Record<string, unknown> = { ...corePayload, ...optionalColumns };

      console.log('📋 Renewal draft payload:', {
        application_type: renewalApplicationData.application_type,
        water_source: renewalApplicationData.water_source,
        water_purpose: renewalApplicationData.water_purpose,
        province: renewalApplicationData.province,
        is_renewal: renewalApplicationData.is_renewal,
        has_renewed_from_permit_id: !!renewalApplicationData.renewed_from_permit_id,
      });
      
      let result: Application | null = null;
      
      // If we already have a renewal application, update it; otherwise create new
      if (currentRenewalApplication?.id) {
        // Update existing - don't send applicant_id on updates (can violate RLS)
        const { applicant_id, ...updateData } = renewalApplicationData;
        result = await updateApplication(currentRenewalApplication.id, updateData as Partial<Application>);
      } else {
        result = await createApplication(renewalApplicationData as Partial<Application>);
      }

      if (!result) {
        throw new Error('Failed to save renewal draft — database returned no data.');
      }

      // ✅ Ensure the draft is immediately visible in any cached applicant application lists.
      const savedApp: Application = result;
      try {
        queryClient.setQueriesData<Application[]>(
          { queryKey: applicationKeys.lists() },
          (old) => {
            const prev = Array.isArray(old) ? old : [];
            const next = [savedApp, ...prev.filter((a) => a.id !== savedApp.id)];
            next.sort((a, b) => {
              const at = new Date(a.created_at || 0).getTime();
              const bt = new Date(b.created_at || 0).getTime();
              return bt - at;
            });
            return next;
          }
        );
      } catch (e) {
        console.warn('⚠️ Failed to update React Query cache (non-fatal):', e);
      }
      
      await ensureStorageBucket();
      if (formData.renewalLetter || (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile) {
        await uploadApplicationDocuments(result.id, {
          renewalRequestLetter: formData.renewalLetter,
          legacyPermitIdentityProof: (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
        }, userProfile?.id);
      }
      
      // Track the current renewal application for payment tab
      setCurrentRenewalApplication(result);

      // ✅ Persist the renewal draft in the URL so refresh/back can reload it,
      // and subsequent saves update the same row instead of creating duplicates.
      try {
        const permitId = selectedPermitForRenewal?.id;
        const permitReference = (selectedPermitForRenewal as any as SelectedPermitRuntimeMeta | null)?.permitReference;
        if (result.id) {
          const permitIdQuery = permitReference?.source === "registry_unlinked" ? "" : (permitId ? `&permitId=${permitId}` : "");
          const newUrl = `/dashboard/new-application?mode=renewal&applicationId=${result.id}${permitIdQuery}`;
          window.history.replaceState(
            { ...window.history.state, as: newUrl, url: newUrl },
            '',
            newUrl
          );
        }
      } catch (e) {
        console.warn('⚠️ Failed to update URL with renewal draft ids (non-fatal):', e);
      }
      
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);

      // Ensure applicant dashboard list refetches.
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      
      return;
    } catch (error) {
      console.error('❌ Error saving renewal draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermitForRenewal, userProfile?.id, createApplication, updateApplication, currentRenewalApplication]);

  // User data for renewal form
  const renewalUserData = useMemo(() => ({
    id: userProfile?.id,
    email: userProfile?.email || "",
    first_name: userProfile?.first_name || "",
    last_name: userProfile?.last_name || "",
    phone: userProfile?.phone || userProfile?.company_phone || "",
    company_name: userProfile?.company_name || "",
    account_type: userProfile?.account_type || 'individual',
  }), [userProfile]);

  // Handle modification form submission
  const handleModificationSubmit = useCallback(async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Modification form data received:', formData);
      
      // Build modification application data
      // Use the actual application type based on intended activities, not 'modification'
      const primaryActivity = formData.intendedActivities?.[0];
      const permitReference =
        (selectedPermitForModification as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermitForModification?.permit_number || "",
          normalizedPermitNumber: selectedPermitForModification?.permit_number || "",
          lookupStatus: "found" as const,
        };
      const modificationApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        application_type: pickNonTransferAppType(
          selectedPermitForModification?.application?.application_type,
          primaryActivity ||
            selectedPermitForModification?.application?.water_purpose ||
            selectedPermitForModification?.purpose
        ),
        water_source: formatWaterSourceForDB(formData.waterSourceType) || selectedPermitForModification?.water_source || 'other',
        water_purpose: formatWaterPurposeForDB(primaryActivity) || selectedPermitForModification?.purpose || 'other',
        province: formatProvinceForDB(formData.waterSourceProvince) || selectedPermitForModification?.application?.province || 'Kigali',
        district: formData.waterSourceDistrict || selectedPermitForModification?.application?.district || '',
        sector: formData.waterSourceSector || selectedPermitForModification?.application?.sector || '',
        cell: formData.waterSourceCell || selectedPermitForModification?.application?.cell || '',
        project_title: formData.fullNameApplicant ? `Modification: ${formData.fullNameApplicant}` : `Modification: ${selectedPermitForModification?.permit_number}`,
        project_description: formData.projectDescription || `Permit modification request for permit ${selectedPermitForModification?.permit_number}`,
        sla_status: 'on_time',
        is_modification: true,
        modified_from_application_id: toUuidOrNull(selectedPermitForModification?.application_id) || undefined,
        modification_changes: formData.modificationChanges || {},
        modification_reason: formData.modificationReason || undefined,
        // Save key permit-affecting fields at the application level (not just in internal_notes)
        // so they are properly picked up when the modification is approved and the permit is updated.
        proposed_duration_years: formData.permitLengthYears || undefined,
        estimated_usage_volume: formData.waterAbstractionDetails?.[0]?.maxAverageYearly || undefined,
        usage_unit: 'm³/year',
        water_taking_method: formData.waterAbstractionDetails?.[0]?.abstractionMethod || undefined,
        village: formData.waterSourceVillage || selectedPermitForModification?.application?.village || '',
        internal_notes: JSON.stringify({
          ...formData,
          isModification: true,
          originalPermitId: selectedPermitForModification?.id,
          originalPermitNumber: selectedPermitForModification?.permit_number,
          originalApplicationId: selectedPermitForModification?.application_id,
          ...(permitReference ? { permitReference } : {}),
        }),
        intended_activities: formData.intendedActivities,
      };
      
      let resultApplication;
      
      // If we already have a draft modification application, update it to submitted
      if (currentModificationApplication?.id) {
        const { applicant_id, ...updateData } = modificationApplicationData as any;
        resultApplication = await updateApplication(currentModificationApplication.id, updateData);
        console.log('✅ Modification application updated to submitted:', resultApplication);
      } else {
        // Create new modification application
        resultApplication = await createApplication(modificationApplicationData);
        console.log('✅ Modification application created:', resultApplication);
      }
      
      if (resultApplication) {
        // Fire-and-forget: send submission SMS + email
        try {
          fetch('/api/notifications/send-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: resultApplication.id }),
          }).catch(() => null)
        } catch {}
        
        // Upload documents (new File objects)
        await ensureStorageBucket();
        const uploadedDocs = await uploadApplicationDocuments(resultApplication.id, {
          ...formData,
          legacyPermitIdentityProof: (selectedPermitForModification as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
        }, userProfile?.id);
        console.log(`📎 ${uploadedDocs.length} new documents uploaded`);

        // Copy over documents from the original application that weren't re-uploaded.
        // This ensures the modification application has a complete set of document records.
        const originalAppId = selectedPermitForModification?.application_id;
        if (originalAppId) {
          try {
            // Get the set of fieldNames that were freshly uploaded
            const uploadedFieldNames = new Set<string>();
            for (const doc of uploadedDocs) {
              if (doc.file_path) {
                const rawName = doc.file_path.split('/').pop() || '';
                const m = rawName.match(/^([a-zA-Z_]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                if (m) uploadedFieldNames.add(m[1]);
              }
            }

            // Fetch original application's documents
            const { data: originalDocs, error: origDocsErr } = await supabase
              .from('documents')
              .select('*')
              .eq('application_id', originalAppId);

            if (!origDocsErr && originalDocs) {
              let copiedCount = 0;
              for (const origDoc of originalDocs) {
                // Determine the fieldName of this original doc
                const rawName = (origDoc.file_path || '').split('/').pop() || '';
                const m = rawName.match(/^([a-zA-Z_]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                const fieldName = m?.[1] || origDoc.type || '';

                // Skip if we already uploaded a new version for this field
                if (uploadedFieldNames.has(fieldName)) continue;

                // Create a copy record pointing to the same storage file
                const { error: copyErr } = await supabase.from('documents').insert({
                  application_id: resultApplication.id,
                  name: origDoc.name,
                  type: origDoc.type,
                  file_path: origDoc.file_path,
                  file_size: origDoc.file_size,
                  mime_type: origDoc.mime_type,
                  verification_status: 'pending',
                  is_required: origDoc.is_required,
                  uploaded_by: userProfile?.id || origDoc.uploaded_by,
                  upload_date: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                if (!copyErr) copiedCount++;
              }
              console.log(`📎 ${copiedCount} documents copied from original application`);
            }
          } catch (copyError) {
            console.error('⚠️ Non-critical: failed to copy original documents:', copyError);
          }
        }
        
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed to submit modification application');
      }
    } catch (error) {
      console.error('❌ Error submitting modification:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit modification request');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermitForModification, userProfile?.id, createApplication, updateApplication, currentModificationApplication]);

  // Handle modification draft save
  const handleModificationSaveAsDraft = useCallback(async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use the actual application type based on intended activities, not 'modification'
      const primaryActivity = formData.intendedActivities?.[0];
      const permitReference =
        (selectedPermitForModification as any as SelectedPermitRuntimeMeta | null)?.permitReference ||
        {
          source: "linked_system" as const,
          inputPermitNumber: selectedPermitForModification?.permit_number || "",
          normalizedPermitNumber: selectedPermitForModification?.permit_number || "",
          lookupStatus: "found" as const,
        };
      const modificationApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: pickNonTransferAppType(
          selectedPermitForModification?.application?.application_type,
          primaryActivity ||
            selectedPermitForModification?.application?.water_purpose ||
            selectedPermitForModification?.purpose
        ),
        water_source: formatWaterSourceForDB(formData.waterSourceType) || selectedPermitForModification?.water_source || 'other',
        water_purpose: formatWaterPurposeForDB(primaryActivity) || selectedPermitForModification?.purpose || 'other',
        province: formatProvinceForDB(formData.waterSourceProvince) || selectedPermitForModification?.application?.province || 'Kigali',
        district: formData.waterSourceDistrict || selectedPermitForModification?.application?.district || '',
        sector: formData.waterSourceSector || selectedPermitForModification?.application?.sector || '',
        cell: formData.waterSourceCell || selectedPermitForModification?.application?.cell || '',
        project_title: formData.fullNameApplicant ? `Modification: ${formData.fullNameApplicant}` : `Modification: ${selectedPermitForModification?.permit_number}`,
        project_description: formData.projectDescription || `Permit modification request for permit ${selectedPermitForModification?.permit_number}`,
        sla_status: 'on_time',
        is_modification: true,
        modified_from_application_id: toUuidOrNull(selectedPermitForModification?.application_id) || undefined,
        modification_changes: formData.modificationChanges || {},
        modification_reason: formData.modificationReason || undefined,
        // Save key permit-affecting fields at the application level (not just in internal_notes)
        proposed_duration_years: formData.permitLengthYears || undefined,
        estimated_usage_volume: formData.waterAbstractionDetails?.[0]?.maxAverageYearly || undefined,
        usage_unit: 'm³/year',
        water_taking_method: formData.waterAbstractionDetails?.[0]?.abstractionMethod || undefined,
        village: formData.waterSourceVillage || selectedPermitForModification?.application?.village || '',
        internal_notes: JSON.stringify({
          ...formData,
          isModification: true,
          originalPermitId: selectedPermitForModification?.id,
          originalPermitNumber: selectedPermitForModification?.permit_number,
          originalApplicationId: selectedPermitForModification?.application_id,
          ...(permitReference ? { permitReference } : {}),
        }),
        intended_activities: formData.intendedActivities,
      };
      
      let result;
      
      // If we already have a modification application, update it; otherwise create new
      if (currentModificationApplication?.id) {
        // Update existing - don't send applicant_id on updates (can violate RLS)
        const { applicant_id, ...updateData } = modificationApplicationData as any;
        result = await updateApplication(currentModificationApplication.id, updateData);
      } else {
        // Create new modification application
        result = await createApplication(modificationApplicationData);
      }
      
      if (result) {
        await ensureStorageBucket();
        const uploadedDocs = await uploadApplicationDocuments(result.id, {
          ...formData,
          legacyPermitIdentityProof: (selectedPermitForModification as any as SelectedPermitRuntimeMeta | null)?.legacyIdentityProofFile || undefined,
        }, userProfile?.id);
        if (uploadedDocs.length > 0) {
          const freshMap = buildInitialDocumentMapFromRecords(uploadedDocs);
          if (Object.keys(freshMap).length > 0) {
            setInitialDocuments(prev => ({ ...prev, ...freshMap }));
          }
        }

        // Copy over documents from the original application that weren't re-uploaded
        const originalAppId = selectedPermitForModification?.application_id;
        if (originalAppId) {
          try {
            const uploadedFieldNames = new Set<string>();
            for (const doc of uploadedDocs) {
              if (doc.file_path) {
                const rawName = doc.file_path.split('/').pop() || '';
                const m = rawName.match(/^([a-zA-Z_]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                if (m) uploadedFieldNames.add(m[1]);
              }
            }

            // Also gather field names already in the new application's documents table
            const { data: existingNewDocs } = await supabase
              .from('documents')
              .select('file_path')
              .eq('application_id', result.id);
            if (existingNewDocs) {
              for (const d of existingNewDocs) {
                const rawName = (d.file_path || '').split('/').pop() || '';
                const m = rawName.match(/^([a-zA-Z_]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                if (m) uploadedFieldNames.add(m[1]);
              }
            }

            const { data: originalDocs, error: origDocsErr } = await supabase
              .from('documents')
              .select('*')
              .eq('application_id', originalAppId);

            if (!origDocsErr && originalDocs) {
              let copiedCount = 0;
              for (const origDoc of originalDocs) {
                const rawName = (origDoc.file_path || '').split('/').pop() || '';
                const m = rawName.match(/^([a-zA-Z_]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                const fieldName = m?.[1] || origDoc.type || '';
                if (uploadedFieldNames.has(fieldName)) continue;

                const { error: copyErr } = await supabase.from('documents').insert({
                  application_id: result.id,
                  name: origDoc.name,
                  type: origDoc.type,
                  file_path: origDoc.file_path,
                  file_size: origDoc.file_size,
                  mime_type: origDoc.mime_type,
                  verification_status: 'pending',
                  is_required: origDoc.is_required,
                  uploaded_by: userProfile?.id || origDoc.uploaded_by,
                  upload_date: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                if (!copyErr) {
                  copiedCount++;
                  uploadedFieldNames.add(fieldName);
                }
              }
              console.log(`📎 ${copiedCount} documents copied from original application (draft save)`);
            }
          } catch (copyError) {
            console.error('⚠️ Non-critical: failed to copy original documents:', copyError);
          }
        }
        
        // Keep reference to the current modification application (used to keep edits on the same row)
        setCurrentModificationApplication(result);

        // Ensure copied + uploaded docs are reflected without page refresh.
        try {
          const latestDocuments = await getDocuments(result.id);
          const latestMap = buildInitialDocumentMapFromRecords(
            Array.isArray(latestDocuments) ? (latestDocuments as Document[]) : []
          );
          if (Object.keys(latestMap).length > 0) {
            setInitialDocuments(prev => ({ ...prev, ...latestMap }));
          }
        } catch (docRefreshError) {
          console.warn('⚠️ Failed to refresh modification draft document map (non-blocking):', docRefreshError);
        }
        
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
        
        return result;
      }
    } catch (error) {
      console.error('Error saving modification draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermitForModification, userProfile?.id, createApplication, updateApplication, currentModificationApplication, getDocuments]);
  
  if (loadingDraft && !initialFormData) {
    return (
      <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            {/* ⚡ PERFORMANCE: Optimized loading skeleton */}
            <div className="space-y-6">
              <div className="flex items-center mb-6">
                <div className="h-9 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="space-y-4">
                <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse"></div>
                <div className="h-6 w-1/2 bg-gray-100 rounded animate-pulse"></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-96 bg-gray-100 rounded-lg animate-pulse"></div>
                <div className="h-96 bg-gray-100 rounded-lg animate-pulse"></div>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (submitSuccess) {
    return (
      <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
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
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-green-700 mb-4">
                Your application has been submitted successfully.
              </p>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to dashboard...
              </p>
            </motion.div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }
  
  // Determine what to render based on application mode and state
  const renderContent = () => {
    // If we have a draft ID, always show the regular application form (no mode selection)
    if (draftId) {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Edit Water Permit Application
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Continue editing your water permit application. Your changes are automatically saved.
            </p>
            {currentApplication && (
              <div className="mt-2 p-2 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700">
                  📝 Editing draft application • ID: {currentApplication.id.slice(0, 8)}... • 
                  Status: {currentApplication.status} • 
                  Last updated: {new Date(currentApplication.updated_at || currentApplication.created_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
          
          <ApplicationForm
            userData={userData}
            onSubmit={handleSubmitApplication}
            onSaveAsDraft={(formData, status) => handleSaveAsDraft(formData, status, currentApplication?.id || draftId)}
            isLoading={isLoading}
            initialData={initialFormData}
            initialDocuments={initialDocuments}
            mode="edit"
            currentApplication={currentApplication}
            isBulkApplicant={isBulkApplicant}
          />
        </>
      );
    }

    // No mode selected - show the application type selector
    if (!applicationMode) {
      return (
        <>
          <div className="text-center mb-8">
            <h1 className="text-primary leading-tighter max-w-2xl mx-auto text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Water Permit Application
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2 max-w-xl mx-auto">
              Select the type of application you want to submit. You can apply for a new water use permit, modify an existing permit, or transfer a permit to another holder.
            </p>
          </div>
          
          <ApplicationTypeSelector onSelect={handleModeSelect} />
        </>
      );
    }

    // Transfer mode - permit selection step
    if (applicationMode === 'transfer' && transferStep === 'select-permit') {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Transfer Water Use Permit
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Select the permit you want to transfer. You can search by permit number, project name, or current holder.
            </p>
          </div>
          
          <PermitSelectForTransfer 
            userId={userProfile?.id}
            onPermitSelect={handlePermitSelect}
            onManualPermitSelect={handleManualTransferPermitSelect}
            onCancel={handleTransferCancel}
          />
        </>
      );
    }

    // Transfer mode - fill form step
    if (applicationMode === 'transfer' && transferStep === 'fill-form' && selectedPermit) {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Transfer Permit: {selectedPermit.permit_number}
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Complete the transfer form for the selected permit. All fields marked with an asterisk (*) are required.
            </p>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferStep('select-permit')}
                className="text-sm"
              >
                ← Select a different permit
              </Button>
            </div>
          </div>
          
          <PermitTransferForm 
            permit={selectedPermit}
            userData={transferUserData}
            onSubmit={handleTransferSubmit}
            onSaveAsDraft={handleTransferSaveAsDraft}
            isLoading={isLoading}
            currentApplication={currentTransferApplication}
          />
        </>
      );
    }

    // Modification mode - permit selection step
    if (applicationMode === 'modification' && modificationStep === 'select-permit') {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Modify Water Use Permit
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Select the permit you want to modify. Only your active permits can be modified. The permit number will remain the same.
            </p>
          </div>
          
          <PermitSelectForModification 
            userId={userProfile?.id}
            onPermitSelect={handleModificationPermitSelect}
            onManualPermitSelect={handleManualModificationPermitSelect}
            onCancel={handleModificationCancel}
          />
        </>
      );
    }

    // Modification mode - fill form step
    if (applicationMode === 'modification' && modificationStep === 'fill-form' && selectedPermitForModification) {
      const isManualModificationPermit = selectedPermitForModification?.id?.startsWith("manual-");
      const modPermitRef = (selectedPermitForModification as any)?.permitReference as import("@/lib/permit/permit-reference").PermitReference | undefined;
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Modify Permit: {selectedPermitForModification.permit_number}
            </h1>

            {isManualModificationPermit && (
              <Alert className="mt-4 border-indigo-200 bg-indigo-50">
                <FileSearch className="h-4 w-4 text-indigo-700" />
                <AlertDescription className="text-indigo-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={modPermitRef?.lookupStatus === "found" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                      {modPermitRef?.lookupStatus === "found" ? "Registry match found" : "Not found in registry"}
                    </Badge>
                    <span>Manual entry &mdash; this permit is not linked in the system.</span>
                  </div>
                  <p className="mt-1 text-sm">
                    Fill in all permit details below. Staff will verify against registry records during review.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {!isManualModificationPermit && (
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
                Update the details of your existing permit. Modified fields will be tracked and reviewed. The permit number remains unchanged.
              </p>
            )}
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModificationStep('select-permit')}
                className="text-sm"
              >
                ← Select a different permit
              </Button>
            </div>
          </div>
          
          <ApplicationForm
            userData={userData}
            onSubmit={handleModificationSubmit}
            onSaveAsDraft={handleModificationSaveAsDraft}
            isLoading={isLoading}
            initialData={initialFormData}
            initialDocuments={initialDocuments}
            mode="edit"
            currentApplication={currentModificationApplication}
            isModification={true}
            originalApplicationData={originalApplicationData}
            excludeApplicationIds={[selectedPermitForModification?.application_id].filter(Boolean) as string[]}
            isBulkApplicant={isBulkApplicant}
          />
        </>
      );
    }

    // Renewal mode - loading existing draft
    if (applicationMode === 'renewal' && loadingRenewalDraft) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-sm text-muted-foreground">Loading renewal application...</span>
        </div>
      );
    }

    // Renewal mode - permit selection step (only if not loading from existing application)
    if (applicationMode === 'renewal' && renewalStep === 'select-permit' && !renewalApplicationId) {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Renew Water Use Permit
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Select the permit you want to renew. Permits nearing expiration or recently expired are shown with urgency indicators.
            </p>
          </div>
          
          <PermitSelectForRenewal 
            userId={userProfile?.id}
            onPermitSelect={handleRenewalPermitSelect}
            onManualPermitSelect={handleManualRenewalPermitSelect}
            onCancel={handleRenewalCancel}
          />
        </>
      );
    }

    // Renewal mode - fill form step
    if (applicationMode === 'renewal' && renewalStep === 'fill-form' && selectedPermitForRenewal) {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Renew Permit: {selectedPermitForRenewal.permit_number}
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Complete the renewal process for your water use permit. Submit your water use report, required documents, and payment.
            </p>
            {/* Only show "Select different permit" if this is a new renewal, not editing existing */}
            {!renewalApplicationId && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRenewalStep('select-permit')}
                  className="text-sm"
                >
                  {tx("← Select a different permit")}
                </Button>
              </div>
            )}
          </div>
          
          <PermitRenewalForm 
            permit={selectedPermitForRenewal}
            userData={renewalUserData}
            onSubmit={handleRenewalSubmit}
            onSaveAsDraft={handleRenewalSaveAsDraft}
            isLoading={isLoading}
            currentApplication={currentRenewalApplication}
          />
        </>
      );
    }

    // New application mode - show regular form
    return (
      <>
        <div>
          <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
            {tx("New Water Permit Application")}
          </h1>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
            {tx("Fill out all required information to apply for your water permit. All fields marked with an asterisk (*) are required.")}
          </p>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApplicationMode(null)}
              className="text-sm"
            >
              {tx("← Change application type")}
            </Button>
          </div>
        </div>
        
        <ApplicationForm
          userData={userData}
          onSubmit={handleSubmitApplication}
          onSaveAsDraft={(formData, status) => handleSaveAsDraft(formData, status, currentApplication?.id || draftId)}
          isLoading={isLoading}
          initialData={initialFormData}
          initialDocuments={initialDocuments}
          mode="create"
          currentApplication={currentApplication}
          isBulkApplicant={isBulkApplicant}
        />
      </>
    );
  };

  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                {tx("Back to Dashboard")}
              </Button>
            </Link>
          </div>
        
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Draft Saved Alert (non-blocking) */}
            {draftSaved && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {tx("✅ Draft saved.")}
                </AlertDescription>
              </Alert>
            )}

            {renderContent()}
          </motion.div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Loading fallback for Suspense
function NewApplicationLoading() {
  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="space-y-6">
            <div className="flex items-center mb-6">
              <div className="h-9 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="space-y-4">
              <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse"></div>
              <div className="h-6 w-1/2 bg-gray-100 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Main export wrapped in Suspense for useSearchParams
export default function NewApplicationPage() {
  return (
    <Suspense fallback={<NewApplicationLoading />}>
      <NewApplicationContent />
    </Suspense>
  );
} 