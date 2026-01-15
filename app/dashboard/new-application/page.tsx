"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";

// Lazy load the heavy form component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new").then(mod => ({ default: mod.ApplicationForm })),
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

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import type { Application, Document } from "@/types/database";
import { mapFormDataToApplication } from "@/lib/application-utils";
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
async function uploadApplicationDocuments(applicationId: string, formData: any): Promise<Document[]> {
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
      // Gaz extraction documents
      gazExtractionGeneralRequirements: 'other',
      gazExtractionEIA: 'environmental_impact_doc',
      gazExtractionFeasibilityStudy: 'other',
      // Livestock documents
      livestockGeneralRequirements: 'other',
      livestockFeasibilityStudy: 'other'
    };

    const requiredFieldNames = (() => {
      const intendedActivities = formData.intendedActivities || [];
      const irrigationArea = formData.irrigationTotalArea || 0;
      const req = getRequiredAttachmentFieldNames(intendedActivities, { irrigationTotalArea: irrigationArea });
      // Always required core docs for this UI flow
      req.add("identificationDoc");
      if (formData.ownsAllLand === false) req.add("landAccessDocuments");
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
              uploaded_by: '550e8400-e29b-41d4-a716-446655440001', // Sample user ID
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
            } else {
              console.log(`✅ Successfully saved document ${fieldName} to database`);
              uploadedDocuments.push(documentRecord);
            }
          } else {
            console.error(`Failed to upload ${fieldName}`);
          }
        } catch (error) {
          console.error(`Error processing document ${fieldName}:`, error);
        }
      }
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
  const { userProfile } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!draftId);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  
  const { createApplication, updateApplication, getApplication } = useApplications();
  const { getDocuments } = useDocuments();
  
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

          setInitialFormData(restored);
          
          // ⚡ PERFORMANCE: Process documents efficiently
          const documentMap: Record<string, { url: string; name: string }> = {};

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

          for (const doc of documents) {
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const fieldName = fieldNameFromFilePath(doc.file_path) || typeMapping[doc.type] || doc.type;
                documentMap[fieldName] = {
                  url: publicUrl,
                  name: doc.name
                };
              }
            }
          }
          
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
          const uploadedDocuments = await uploadApplicationDocuments(newApplication.id, formData);
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
          const uploadedDocuments = await uploadApplicationDocuments(result.id, formData);
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
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              {draftId ? 'Edit Water Permit Application' : 'New Water Permit Application'}
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              {draftId 
                ? 'Continue editing your water permit application. Your changes are automatically saved.'
                : 'Fill out all required information to apply for your water permit. All fields marked with an asterisk (*) are required.'
              }
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
          

          <ApplicationForm 
            userData={userData}
            onSubmit={handleSubmitApplication}
            onSaveAsDraft={(formData, status) => handleSaveAsDraft(formData, status, currentApplication?.id || draftId)}
            isLoading={isLoading}
            initialData={initialFormData}
            initialDocuments={initialDocuments}
            mode={draftId || currentApplication ? 'edit' : 'create'}
            currentApplication={currentApplication}
          />
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