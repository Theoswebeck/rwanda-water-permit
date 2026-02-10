"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
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
        <span className="ml-3 text-sm text-muted-foreground">Loading form...</span>
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
        <span className="ml-3 text-sm text-muted-foreground">Loading transfer form...</span>
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
        <span className="ml-3 text-sm text-muted-foreground">Loading renewal form...</span>
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import type { Application, Document } from "@/types/database";
import { mapFormDataToApplication, formatProvinceForDB, formatWaterSourceForDB, formatWaterPurposeForDB, formatApplicationTypeForDB } from "@/lib/application-utils";
import { getRequiredAttachmentFieldNames } from "@/lib/annex-requirements";

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
        fileSizeLimit: 10485760 // 10MB
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
      // Navigation documents
      navigationGeneralRequirements: 'other',
      navigationEIA: 'environmental_impact_doc',
      navigationManagementPlan: 'other',
      // Recreation documents
      recreationGeneralRequirements: 'other',
      recreationEIA: 'environmental_impact_doc',
      recreationManagementPlan: 'other',
      recreationPolygonAreaMap: 'intake_discharge_map',
      // Gaz extraction documents
      gazExtractionGeneralRequirements: 'other',
      gazExtractionEIA: 'environmental_impact_doc',
      gazExtractionFeasibilityStudy: 'other',
      // Livestock documents
      livestockGeneralRequirements: 'other',
      livestockFeasibilityStudy: 'other',
      // Transfer documents
      applicationLetter: 'transfer_application_letter',
      signedTransferForm: 'signed_transfer_form',
      registrationCertificate: 'registration_certificate',
      existingPermitCopy: 'existing_permit_copy'
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
        req.add("applicationLetter");
        req.add("signedTransferForm");
        req.add("registrationCertificate");
        req.add("existingPermitCopy");
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
            const { data: existingDoc, error: checkError } = await supabase
              .from('documents')
              .select('id,file_path,created_at')
              .eq('application_id', applicationId)
              .ilike('file_path', `%applications/${applicationId}/${fieldName}-%`)
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
            const { data: existingDoc, error: checkError } = await supabase
              .from('documents')
              .select('id,file_path,created_at')
              .eq('application_id', applicationId)
              .ilike('file_path', `%applications/${applicationId}/${fieldName}-%`)
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

// Inner component that uses useSearchParams
function NewApplicationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      if (!renewalApplicationId || !renewalPermitId || applicationMode !== 'renewal') {
        setLoadingRenewalDraft(false);
        return;
      }
      
      try {
        setLoadingRenewalDraft(true);
        setError(null);
        
        // Load the application and permit data in parallel
        const [application, permitResult] = await Promise.all([
          getApplication(renewalApplicationId),
          supabase
            .from('permits')
            .select(`
              *,
              application:applications!application_id (
                id,
                application_number,
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
            .single()
        ]);
        
        if (application && permitResult.data) {
          setCurrentRenewalApplication(application);
          setSelectedPermitForRenewal(permitResult.data as RenewalPermitWithApplication);
          setRenewalStep('fill-form');
        } else {
          setError('Failed to load renewal application data');
        }
      } catch (err) {
        console.error('Error loading renewal draft:', err);
        setError(err instanceof Error ? err.message : 'Failed to load renewal draft');
      } finally {
        setLoadingRenewalDraft(false);
      }
    };
    
    loadRenewalDraft();
  }, [renewalApplicationId, renewalPermitId, applicationMode, getApplication]);
  
  // Load existing draft if draftId is provided - OPTIMIZED
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) {
        setLoadingDraft(false);
        return;
      }
      
      try {
        setLoadingDraft(true);
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

          // Prefer extracting the exact fieldName from the stored storage path:
          // applications/{applicationId}/{fieldName}-{timestamp}.{ext}
          // This is the only 100% reliable way to map docs back to the correct form field,
          // since multiple different fields can share the same `doc.type` (e.g. "other", "geological_survey").
          const fieldNameFromFilePath = (filePath: string): string | null => {
            const rawFileName = (() => {
              try {
                if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
                  return new URL(filePath).pathname.split("/").pop() || "";
                }
              } catch {}
              return filePath.split("/").pop() || "";
            })();

            const m = rawFileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
            return m?.[1] ?? null;
          };

          // Fallback mapping (legacy rows that stored only doc.type)
          const typeMapping: Record<string, string> = {
            identification_doc: "identificationDoc",
            land_ownership_doc: "landOwnershipDoc",
            technical_drawings: "technicalDrawings",
            environmental_impact_doc: "environmentalImpactDoc",
            payment_proof: "paymentProof",
            intake_discharge_map: "intakeDischargeMap",
            business_license: "miningLicense",
            geological_survey: "miningHydrologicalReport",
            water_quality_report: "waterQualityReport",
            other: "waterSupplyGeneralRequirements",
          };

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
                  const fieldName = fieldNameFromFilePath(doc.file_path) || typeMapping[doc.type] || doc.type;
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
              } else {
                existing.push({
                  id: dbDoc.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                  name: dbDoc.name,
                  category: "additional",
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
  }, [draftId, getApplication, getDocuments, userProfile]);
  
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
        try {
          const uploadedDocuments = await uploadApplicationDocuments(result.id, formData, userProfile?.id);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
        } catch (docError) {
          console.error('⚠️ Document upload failed:', docError);
          // Don't fail the whole save, but warn the user
          setError('Draft saved but some documents failed to upload. Please try uploading them again.');
        }
        
        // Update URL with draft ID if this is a new draft
        // IMPORTANT: Use history.replaceState instead of router.replace to avoid re-render
        // This preserves the current activeTab state (especially important for payment flow)
        if (!draftId && result.id) {
          const newUrl = `/dashboard/new-application?id=${result.id}`;
          // Use native history API to update URL without triggering Next.js re-render
          window.history.replaceState(
            { ...window.history.state, as: newUrl, url: newUrl },
            '',
            newUrl
          );
          setCurrentApplication(result);
        }
        
        // Draft saves should NOT redirect away (payment flow depends on staying on this page)
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
        
        return result;
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
  }, [createApplication, updateApplication, userProfile?.id, router]);

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
  }, []);

  // Handle transfer cancellation
  const handleTransferCancel = useCallback(() => {
    setSelectedPermit(null);
    setTransferStep('select-permit');
    setApplicationMode(null);
  }, []);

  // Handle transfer form submission
  const handleTransferSubmit = useCallback(async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Transfer form data received:', formData);
      
      // Create a transfer application in the applications table
      // Uses 'transfer' type to follow same status flow but skip field reports
      const transferApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'submitted',
        application_type: 'transfer',
        water_source: selectedPermit?.water_source || 'other',
        water_purpose: selectedPermit?.purpose || 'other',
        province: selectedPermit?.application?.province || 'Kigali',
        district: selectedPermit?.application?.district || '',
        sector: selectedPermit?.application?.sector || '',
        cell: selectedPermit?.application?.cell || '',
        project_title: `Transfer: ${selectedPermit?.application?.project_title || selectedPermit?.permit_number}`,
        project_description: `Permit transfer request for permit ${selectedPermit?.permit_number}`,
        sla_status: 'on_time',
        internal_notes: JSON.stringify({
          isTransfer: true,
          originalPermitId: selectedPermit?.id,
          originalPermitNumber: selectedPermit?.permit_number,
          transferFormData: formData,
        }),
      };
      
      const newApplication = await createApplication(transferApplicationData);
      
      if (newApplication) {
        console.log('✅ Transfer application created:', newApplication);
        
        // Upload documents
        await ensureStorageBucket();
        const uploadedDocs = await uploadApplicationDocuments(newApplication.id, formData, userProfile?.id);
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
  }, [selectedPermit, userProfile?.id, createApplication]);

  // Handle transfer draft save
  const handleTransferSaveAsDraft = useCallback(async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Uses 'transfer' type to follow same status flow but skip field reports
      const transferApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: 'transfer',
        water_source: selectedPermit?.water_source || 'other',
        water_purpose: selectedPermit?.purpose || 'other',
        province: selectedPermit?.application?.province || 'Kigali',
        district: selectedPermit?.application?.district || '',
        sector: selectedPermit?.application?.sector || '',
        cell: selectedPermit?.application?.cell || '',
        project_title: `Transfer: ${selectedPermit?.application?.project_title || selectedPermit?.permit_number}`,
        project_description: `Permit transfer request for permit ${selectedPermit?.permit_number}`,
        sla_status: 'on_time',
        internal_notes: JSON.stringify({
          isTransfer: true,
          originalPermitId: selectedPermit?.id,
          originalPermitNumber: selectedPermit?.permit_number,
          transferFormData: formData,
        }),
      };
      
      const result = await createApplication(transferApplicationData);
      
      if (result) {
        await ensureStorageBucket();
        await uploadApplicationDocuments(result.id, formData, userProfile?.id);
        
        // Track the current transfer application for payment tab
        setCurrentTransferApplication(result);
        
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
        
        return result;
      }
    } catch (error) {
      console.error('Error saving transfer draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermit, userProfile?.id, createApplication]);

  // User data for transfer form
  const transferUserData = useMemo(() => ({
    email: userProfile?.email || "",
    name: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() || userProfile?.company_name || "",
    phone: userProfile?.phone || userProfile?.company_phone || "",
    address: userProfile?.company_address || "",
    account_type: userProfile?.account_type || 'individual',
  }), [userProfile]);

  // Handle permit selection for modification
  const handleModificationPermitSelect = useCallback(async (permit: PermitWithApplication) => {
    setSelectedPermitForModification(permit);
    
    // Load original application data for comparison
    try {
      if (permit.application_id) {
        const originalApplication = await getApplication(permit.application_id);
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
          
          setOriginalApplicationData(originalFormData);
          setInitialFormData(originalFormData);
        }
      }
    } catch (error) {
      console.error('Error loading original application data:', error);
    }
    
    setModificationStep('fill-form');
  }, [getApplication]);

  // Handle modification cancellation
  const handleModificationCancel = useCallback(() => {
    setSelectedPermitForModification(null);
    setModificationStep('select-permit');
    setApplicationMode(null);
    setOriginalApplicationData(null);
  }, []);

  // Handle permit selection for renewal
  const handleRenewalPermitSelect = useCallback(async (permit: RenewalPermitWithApplication) => {
    setSelectedPermitForRenewal(permit);
    setRenewalStep('fill-form');
  }, []);

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
      
      // Create a renewal application in the applications table
      const renewalApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        application_type: selectedPermitForRenewal?.application?.application_type || 'domestic',
        water_source: selectedPermitForRenewal?.water_source || 'other',
        water_purpose: selectedPermitForRenewal?.purpose || 'other',
        province: selectedPermitForRenewal?.application?.province || 'Kigali',
        district: selectedPermitForRenewal?.application?.district || '',
        sector: selectedPermitForRenewal?.application?.sector || '',
        cell: selectedPermitForRenewal?.application?.cell || '',
        project_title: `Renewal: ${selectedPermitForRenewal?.application?.project_title || selectedPermitForRenewal?.permit_number}`,
        project_description: `Permit renewal request for permit ${selectedPermitForRenewal?.permit_number}`,
        sla_status: 'on_time',
        is_renewal: true,
        renewed_from_permit_id: selectedPermitForRenewal?.id,
        internal_notes: JSON.stringify({
          isRenewal: true,
          originalPermitId: selectedPermitForRenewal?.id,
          originalPermitNumber: selectedPermitForRenewal?.permit_number,
          originalApplicationId: selectedPermitForRenewal?.application_id,
          waterUseReport: formData.waterUseReport,
          renewalFormData: formData,
        }),
        intended_activities: selectedPermitForRenewal?.application?.intended_activities,
      };
      
      let resultApplication;
      
      // If we already have a draft renewal application, update it to submitted
      if (currentRenewalApplication?.id) {
        const { applicant_id, ...updateData } = renewalApplicationData as any;
        resultApplication = await updateApplication(currentRenewalApplication.id, updateData);
        console.log('✅ Renewal application updated to submitted:', resultApplication);
      } else {
        // Create new renewal application
        resultApplication = await createApplication(renewalApplicationData);
        console.log('✅ Renewal application created:', resultApplication);
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
        if (formData.renewalLetter) {
          const uploadedDocs = await uploadApplicationDocuments(resultApplication.id, {
            renewalRequestLetter: formData.renewalLetter,
          }, userProfile?.id);
          console.log(`📎 ${uploadedDocs.length} documents uploaded`);
        }
        
        setSubmitSuccess(true);
      } else {
        throw new Error('Failed to submit renewal application');
      }
    } catch (error) {
      console.error('❌ Error submitting renewal:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit renewal request');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermitForRenewal, userProfile?.id, createApplication, updateApplication, currentRenewalApplication]);

  // Handle renewal draft save
  const handleRenewalSaveAsDraft = useCallback(async (formData: any, status: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const renewalApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: selectedPermitForRenewal?.application?.application_type || 'domestic',
        water_source: selectedPermitForRenewal?.water_source || 'other',
        water_purpose: selectedPermitForRenewal?.purpose || 'other',
        province: selectedPermitForRenewal?.application?.province || 'Kigali',
        district: selectedPermitForRenewal?.application?.district || '',
        sector: selectedPermitForRenewal?.application?.sector || '',
        cell: selectedPermitForRenewal?.application?.cell || '',
        project_title: `Renewal: ${selectedPermitForRenewal?.application?.project_title || selectedPermitForRenewal?.permit_number}`,
        project_description: `Permit renewal request for permit ${selectedPermitForRenewal?.permit_number}`,
        sla_status: 'on_time',
        is_renewal: true,
        renewed_from_permit_id: selectedPermitForRenewal?.id,
        internal_notes: JSON.stringify({
          isRenewal: true,
          originalPermitId: selectedPermitForRenewal?.id,
          originalPermitNumber: selectedPermitForRenewal?.permit_number,
          originalApplicationId: selectedPermitForRenewal?.application_id,
          waterUseReport: formData.waterUseReport,
          renewalFormData: formData,
        }),
        intended_activities: selectedPermitForRenewal?.application?.intended_activities,
      };
      
      let result;
      
      // If we already have a renewal application, update it; otherwise create new
      if (currentRenewalApplication?.id) {
        // Update existing - don't send applicant_id on updates (can violate RLS)
        const { applicant_id, ...updateData } = renewalApplicationData as any;
        result = await updateApplication(currentRenewalApplication.id, updateData);
      } else {
        // Create new renewal application
        result = await createApplication(renewalApplicationData);
      }
      
      if (result) {
        await ensureStorageBucket();
        if (formData.renewalLetter) {
          await uploadApplicationDocuments(result.id, {
            renewalRequestLetter: formData.renewalLetter,
          }, userProfile?.id);
        }
        
        // Track the current renewal application for payment tab
        setCurrentRenewalApplication(result);
        
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
        
        return result;
      }
    } catch (error) {
      console.error('Error saving renewal draft:', error);
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
      const modificationApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        application_type: formatApplicationTypeForDB(primaryActivity) || selectedPermitForModification?.application?.application_type || 'domestic',
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
        modified_from_application_id: selectedPermitForModification?.application_id,
        modification_changes: formData.modificationChanges || {},
        internal_notes: JSON.stringify({
          ...formData,
          isModification: true,
          originalPermitId: selectedPermitForModification?.id,
          originalPermitNumber: selectedPermitForModification?.permit_number,
          originalApplicationId: selectedPermitForModification?.application_id,
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
        
        // Upload documents
        await ensureStorageBucket();
        const uploadedDocs = await uploadApplicationDocuments(resultApplication.id, formData, userProfile?.id);
        console.log(`📎 ${uploadedDocs.length} documents uploaded`);
        
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
      const modificationApplicationData: Partial<Application> = {
        applicant_id: userProfile?.id,
        status: 'draft',
        application_type: formatApplicationTypeForDB(primaryActivity) || selectedPermitForModification?.application?.application_type || 'domestic',
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
        modified_from_application_id: selectedPermitForModification?.application_id,
        modification_changes: formData.modificationChanges || {},
        internal_notes: JSON.stringify({
          ...formData,
          isModification: true,
          originalPermitId: selectedPermitForModification?.id,
          originalPermitNumber: selectedPermitForModification?.permit_number,
          originalApplicationId: selectedPermitForModification?.application_id,
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
        await uploadApplicationDocuments(result.id, formData, userProfile?.id);
        
        // Track the current modification application for payment tab
        setCurrentModificationApplication(result);
        
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
  }, [selectedPermitForModification, userProfile?.id, createApplication, updateApplication, currentModificationApplication]);
  
  if (loadingDraft) {
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
            onCancel={handleModificationCancel}
          />
        </>
      );
    }

    // Modification mode - fill form step
    if (applicationMode === 'modification' && modificationStep === 'fill-form' && selectedPermitForModification) {
      return (
        <>
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Modify Permit: {selectedPermitForModification.permit_number}
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Update the details of your existing permit. Modified fields will be tracked and reviewed. The permit number remains unchanged.
            </p>
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
                  ← Select a different permit
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
            New Water Permit Application
          </h1>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
            Fill out all required information to apply for your water permit. All fields marked with an asterisk (*) are required.
          </p>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApplicationMode(null)}
              className="text-sm"
            >
              ← Change application type
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
                Back to Dashboard
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
                  ✅ Draft saved.
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