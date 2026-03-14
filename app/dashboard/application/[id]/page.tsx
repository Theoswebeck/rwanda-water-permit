"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";
import { 
  ArrowLeft, 
  Loader2, 
  AlertTriangle,
  Edit,
  CheckCircle,
  User2,
  Download,
  FileText
} from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { getDocumentUrl, downloadFromDocumentsBucket } from "@/lib/supabase-storage";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { supabase } from "@/lib/supabase";
import type { Application, User as UserType, Document, Review } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";

// Lazy load the ApplicationForm component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading application form...</span>
      </div>
    ),
    ssr: false
  }
);

// Lazy load the PermitRenewalForm component for renewal applications
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

// Lazy load the PermitTransferForm component for transfer applications
const PermitTransferForm = dynamic(
  () => import("@/components/dashboard/permit-transfer-form").then(mod => ({ default: mod.PermitTransferForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading transfer details...</span>
      </div>
    ),
    ssr: false
  }
);

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
  approval_conditions?: string;
}

interface IssuedPermitMeta {
  id: string;
  permitNumber: string;
  permitPdfPath: string | null;
}

// Transform Application data back to form format for viewing
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
    
  } else {
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
    let waterSourcePolygons: any[] = [];
    let singlePointLatitude: string | undefined = undefined;
    let singlePointLongitude: string | undefined = undefined;
    
    try {
      const polys = geometryToCoordinatePolygons(application.coordinates);
      if (polys && polys.length > 0) {
        waterSourcePolygons = polys;
        // If it's a single point, extract lat/lng for direct use as well
        if (polys.length === 1 && polys[0].length === 1) {
          singlePointLatitude = polys[0][0].latitude?.toString();
          singlePointLongitude = polys[0][0].longitude?.toString();
        }
      } else if ((application.coordinates as any)?.type === 'Point' && Array.isArray((application.coordinates as any)?.coordinates)) {
        // Fallback for direct Point coordinates in the application object
        const [lng, lat] = (application.coordinates as any).coordinates;
        singlePointLatitude = lat.toString();
        singlePointLongitude = lng.toString();
        waterSourcePolygons = [[{ latitude: lat.toString(), longitude: lng.toString() }]];
      }
    } catch (error) {
      console.warn('Error parsing coordinates:', error);
    }
    
    formData.waterSourcePolygons = waterSourcePolygons.length > 0 ? waterSourcePolygons : [[{ latitude: "", longitude: "" }]];
    // Also populate individual lat/lng fields if they aren't already set from internal notes
    if (!formData.waterSourceLatitude && singlePointLatitude) formData.waterSourceLatitude = singlePointLatitude;
    if (!formData.waterSourceLongitude && singlePointLongitude) formData.waterSourceLongitude = singlePointLongitude;
  
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
      'aquaculture': 'aquaculture',
      'industrial': 'industry',
      'electricity_generation': 'electricity',
      'mining': 'mining',
      'recreation': 'recreation'
    };
    
    const intendedActivities = Array.isArray((application as any).intended_activities)
      ? (application as any).intended_activities
      : [];
    formData.intendedActivities =
      intendedActivities.length > 0 ? intendedActivities : [purposeToActivity[application.water_purpose] || 'water_supply'];

    const mappedActivity = formData.intendedActivities?.[0] || 'water_supply';
    
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
  }
  
  return formData;
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferTermsBlocked, setTransferTermsBlocked] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const [renewalPermit, setRenewalPermit] = useState<PermitWithApplication | null>(null);
  const [loadingRenewalPermit, setLoadingRenewalPermit] = useState(false);
  const [transferPermit, setTransferPermit] = useState<PermitWithApplication | null>(null);
  const [loadingTransferPermit, setLoadingTransferPermit] = useState(false);
  const [transferFormData, setTransferFormData] = useState<any>(null);
  const [isTransferApp, setIsTransferApp] = useState(false);
  const [issuedPermit, setIssuedPermit] = useState<IssuedPermitMeta | null>(null);
  const [isDownloadingPermit, setIsDownloadingPermit] = useState(false);
  const [isDownloadingTerms, setIsDownloadingTerms] = useState(false);
  const { getApplication, loading, refresh } = useApplications();
  const { getDocuments } = useDocuments();
  const loadedTransferPermitKeyRef = useRef<string | null>(null);
  const profileDependencyKey = `${userProfile?.id ?? ""}|${userProfile?.email ?? ""}|${userProfile?.phone ?? ""}|${userProfile?.company_phone ?? ""}`;

  const downloadBlobAsFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const getAcceptedTermsPdfPath = (app: ApplicationWithRelations | null): string | null => {
    if (!app?.internal_notes) return null;
    try {
      const parsed = JSON.parse(app.internal_notes);
      const termsPath = parsed?.accepted_terms_pdf_url;
      return typeof termsPath === "string" && termsPath.trim().length > 0 ? termsPath : null;
    } catch {
      return null;
    }
  };

  const handleDownloadPermit = async () => {
    if (!application || application.status !== "approved") return;

    try {
      setIsDownloadingPermit(true);

      if (issuedPermit?.permitPdfPath) {
        const blob = await downloadFromDocumentsBucket(issuedPermit.permitPdfPath);
        if (blob) {
          downloadBlobAsFile(blob, `permit-${issuedPermit.permitNumber}.pdf`);
          return;
        }
      }

      if (issuedPermit?.permitNumber) {
        window.open(`/permit/view/${encodeURIComponent(issuedPermit.permitNumber)}`, "_blank");
        return;
      }

      alert("Permit is not available yet. Please try again shortly.");
    } catch (err) {
      console.error("❌ Failed to download permit PDF:", err);
      alert("Failed to download permit. Please try again.");
    } finally {
      setIsDownloadingPermit(false);
    }
  };

  const handleDownloadTerms = async () => {
    if (!application || application.status !== "approved") return;

    try {
      setIsDownloadingTerms(true);

      const termsPdfPath = getAcceptedTermsPdfPath(application);
      if (termsPdfPath) {
        const blob = await downloadFromDocumentsBucket(termsPdfPath);
        if (blob) {
          const suffix = issuedPermit?.permitNumber || application.application_number || application.id;
          downloadBlobAsFile(blob, `terms-and-conditions-${suffix}.pdf`);
          return;
        }
      }

      if (issuedPermit?.permitNumber) {
        window.open(`/contract/terms/${encodeURIComponent(issuedPermit.permitNumber)}`, "_blank");
        return;
      }

      alert("Terms and conditions are not available yet. Please try again shortly.");
    } catch (err) {
      console.error("❌ Failed to download terms and conditions PDF:", err);
      alert("Failed to download terms and conditions. Please try again.");
    } finally {
      setIsDownloadingTerms(false);
    }
  };

  const canDownloadPermit = Boolean(issuedPermit?.permitPdfPath || issuedPermit?.permitNumber);
  const canDownloadTerms = Boolean(getAcceptedTermsPdfPath(application) || issuedPermit?.permitNumber);
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        const applicationId = params.id as string;
        console.log('Fetching application details for ID:', applicationId);
        
        // Load application and documents in parallel
        const [app, documents] = await Promise.all([
          getApplication(applicationId),
          getDocuments(applicationId)
        ]);
        
        if (app) {
          const appWithRelations = app as ApplicationWithRelations;
          setApplication(appWithRelations);
          console.log('✅ Application details loaded:', appWithRelations);

          const parsedNotes = (() => {
            try {
              return (appWithRelations as any).internal_notes ? JSON.parse((appWithRelations as any).internal_notes) : null;
            } catch {
              return null;
            }
          })();
          const transferDetected =
            appWithRelations.application_type === "transfer" ||
            parsedNotes?.isTransfer === true;
          setIsTransferApp(transferDetected);

          if (transferDetected) {
            setTransferFormData(parsedNotes?.transferFormData || null);
            const originalPermitId = parsedNotes?.originalPermitId;
            const originalPermitNumber = parsedNotes?.originalPermitNumber;
            const transferPermitKey = originalPermitId
              ? `id:${originalPermitId}`
              : originalPermitNumber
                ? `number:${originalPermitNumber}`
                : null;

            if (transferPermitKey) {
              const hasCurrentPermitLoaded =
                loadedTransferPermitKeyRef.current === transferPermitKey && !!transferPermit;

              if (hasCurrentPermitLoaded) {
                setLoadingTransferPermit(false);
              } else {
                setLoadingTransferPermit(true);
                try {
                  let permitQuery = supabase
                    .from("permits")
                    .select(`
                      *,
                      application:applications!application_id (
                        id,
                        project_title,
                        province,
                        district,
                        sector,
                        cell,
                        water_source,
                        water_purpose,
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
                    `);

                  if (originalPermitId) {
                    permitQuery = permitQuery.eq("id", originalPermitId);
                  } else if (originalPermitNumber) {
                    permitQuery = permitQuery.eq("permit_number", originalPermitNumber);
                  }

                  const { data: permitData, error: permitError } = await permitQuery.maybeSingle();
                  if (permitError) throw permitError;
                  setTransferPermit((permitData as PermitWithApplication) || null);
                  loadedTransferPermitKeyRef.current = transferPermitKey;
                } catch (permitErr) {
                  console.error("Error fetching original permit for transfer:", permitErr);
                  setTransferPermit(null);
                  loadedTransferPermitKeyRef.current = null;
                } finally {
                  setLoadingTransferPermit(false);
                }
              }
            } else {
              setTransferPermit(null);
              loadedTransferPermitKeyRef.current = null;
            }
          } else {
            setTransferFormData(null);
            setTransferPermit(null);
            setLoadingTransferPermit(false);
            loadedTransferPermitKeyRef.current = null;
          }

          const { data: permitRows, error: permitLookupError } = await supabase
            .from("permits")
            .select("id, permit_number, permit_pdf_url, created_at")
            .eq("application_id", appWithRelations.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (permitLookupError) {
            console.warn("⚠️ Failed to load permit reference for application:", permitLookupError);
            setIssuedPermit(null);
          } else {
            const permitRow = Array.isArray(permitRows) ? (permitRows[0] as any) : null;
            if (permitRow?.id && permitRow?.permit_number) {
              setIssuedPermit({
                id: permitRow.id,
                permitNumber: permitRow.permit_number,
                permitPdfPath: permitRow.permit_pdf_url ?? null,
              });
            } else {
              setIssuedPermit(null);
            }
          }
          
          // Transform application data to form format
          const formData = mapApplicationToFormData(appWithRelations, userProfile);
          setInitialFormData(formData);
          
          // Process documents for form (smart classification by file path when possible)
          const documentMap: Record<string, { url: string; name: string }> = {};
          const processDocsIntoMap = (docs: any[]) => {
            for (const doc of docs) {
              if (!doc.file_path || !doc.name) continue;
              const publicUrl = getDocumentUrl(doc.file_path);
              if (!publicUrl) continue;

              const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
              if (!fieldName.startsWith('additional_') && !documentMap[fieldName]) {
                documentMap[fieldName] = { url: publicUrl, name: doc.name };
              }
            }
          };

          // 1. Process this application's own documents first
          processDocsIntoMap(documents);

          // 2. For modifications: also load documents from the original application
          const isModification = (appWithRelations as any).is_modification === true || parsedNotes?.isModification === true;
          if (isModification) {
            const originalAppId = (appWithRelations as any).modified_from_application_id || parsedNotes?.originalApplicationId;
            if (originalAppId) {
              try {
                const originalDocs = await getDocuments(originalAppId);
                if (originalDocs) processDocsIntoMap(originalDocs);
              } catch (e) {
                console.error('⚠️ Failed to load original application documents:', e);
              }
            }
          }
          
          setInitialDocuments(documentMap);
          
          console.log('📄 Documents found:', documents.length, 'documents');
          
          // Redirect to Terms page if status is approved_pending_permit.
          // Special case: for transfer applications, only the transferee who approved the transfer request
          // can accept Terms & Conditions.
          if (appWithRelations.status === 'approved_pending_permit') {
            const isTransfer =
              (appWithRelations as any).application_type === 'transfer' ||
              parsedNotes?.isTransfer === true;

            if (!isTransfer) {
              setTransferTermsBlocked(false);
              router.push(`/dashboard/application/${params.id}/terms`);
            } else {
              const approval = parsedNotes?.transferApproval;
              const transfereeApproved =
                approval?.transfereeApproved === true &&
                typeof approval?.transfereeUserId === 'string' &&
                approval.transfereeUserId === userProfile?.id;

              setTransferTermsBlocked(!transfereeApproved);
              if (transfereeApproved) {
                router.push(`/dashboard/application/${params.id}/terms`);
              }
            }
          } else {
            setTransferTermsBlocked(false);
          }
        } else {
          setError('Application not found');
        }
      } catch (err) {
        console.error('❌ Error fetching application:', err);
        setError('Failed to load application details');
      }
    };
    
    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id, getApplication, getDocuments, profileDependencyKey]);

  // Load renewal permit data if this is a renewal application
  useEffect(() => {
    const loadRenewalPermit = async () => {
      if (!application) return;
      
      // Check if this is a renewal application
      const isRenewal = (application as any).is_renewal;
      const permitId = (application as any).renewed_from_permit_id;
      
      if (!isRenewal || !permitId) {
        setRenewalPermit(null);
        return;
      }
      
      try {
        setLoadingRenewalPermit(true);
        
        const { data: permit, error: permitError } = await supabase
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
          .eq('id', permitId)
          .single();
          
        if (permitError) {
          console.error('Error loading renewal permit:', permitError);
        } else {
          setRenewalPermit(permit as PermitWithApplication);
          console.log('✅ Renewal permit loaded:', permit);
        }
      } catch (err) {
        console.error('Error loading renewal permit:', err);
      } finally {
        setLoadingRenewalPermit(false);
      }
    };
    
    loadRenewalPermit();
  }, [application]);

  // Create userData object for the form (similar to new-application page)
  const userData = {
    email: userProfile?.email || "",
    name: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() || userProfile?.company_name || "",
    phone: userProfile?.phone || userProfile?.company_phone || "",
    address: userProfile?.company_address || "",
    idNumber: userProfile?.id_number || "",
    account_type: userProfile?.account_type || 'individual' as const,
    id_number: userProfile?.id_number || "",
    company_tin: userProfile?.company_tin,
  };

  // Dummy handlers for read-only form (these won't be called in view mode)
  const handleSubmitApplication = async (_data: any, _status: string) => {};
  const handleSaveAsDraft = async (_data: any, _status: string, _draftId?: string | null) => {};

  // Function to render the correct status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200">Draft</Badge>;
      case "submitted":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">Submitted</Badge>;
      case "under_review":
        return <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Under Review</Badge>;
      case "pending_inspection":
        return <Badge variant="outline" className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">Pending Inspection</Badge>;
      case "pending_assessment":
        return <Badge variant="outline" className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">Pending Assessment</Badge>;
      case "pending_review":
        return <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Pending Review</Badge>;
      case "pending_verification":
        return <Badge variant="outline" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200">Pending Verification</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Approved</Badge>;
      case "approved_pending_permit":
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Approved - Pending Terms</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Rejected</Badge>;
      case "pending_payment":
        return <Badge variant="outline" className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Pending Payment</Badge>;
      case "revision_required":
        return <Badge variant="outline" className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Returned for Review</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  
  // Format application type for display
  const formatApplicationType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Helper function to extract coordinates from PostGIS data
  const formatCoordinates = (coordinates: any) => {
    try {
      if (coordinates && typeof coordinates === 'object') {
        // Handle PostGIS Point geometry (legacy)
        if (coordinates.type === 'Point' && coordinates.coordinates) {
          const [lng, lat] = coordinates.coordinates;
          return `${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`;
        }
        
        // Handle PostGIS Polygon geometry
        if (coordinates.type === 'Polygon' && coordinates.coordinates && coordinates.coordinates[0]) {
          const polygonPoints = coordinates.coordinates[0];
          return `Polygon with ${polygonPoints.length} points`;
        }

        // Handle PostGIS MultiPolygon geometry
        if (coordinates.type === 'MultiPolygon' && Array.isArray(coordinates.coordinates)) {
          return `MultiPolygon with ${coordinates.coordinates.length} polygons`;
        }
      }
      return JSON.stringify(coordinates);
    } catch (error) {
      return 'Invalid coordinates';
    }
  };

  // Helper function to render detailed polygon coordinates
  const renderPolygonCoordinates = (coordinates: any) => {
    try {
      if (coordinates?.type === 'Polygon' && coordinates.coordinates?.[0]) {
        const points = coordinates.coordinates[0];
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Water Source Area (Polygon - {points.length} points):
            </div>
            <div className="grid gap-2">
              {points.slice(0, 10).map((point: number[], index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                  <span className="font-medium">Point {index + 1}:</span>
                  <span>{point[1].toFixed(6)}°N, {point[0].toFixed(6)}°E</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (coordinates?.type === 'MultiPolygon' && Array.isArray(coordinates.coordinates)) {
        const polys = coordinates.coordinates as number[][][][];
        return (
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              Water Source Area (MultiPolygon - {polys.length} polygons):
            </div>
            <div className="space-y-4">
              {polys.map((poly, polyIdx) => {
                const ring = poly?.[0] || [];
                return (
                  <div key={polyIdx} className="space-y-2">
                    <div className="text-sm font-medium">Polygon {polyIdx + 1} ({ring.length} points)</div>
                    <div className="grid gap-2">
                      {ring.slice(0, 10).map((point: number[], index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                        >
                          <span className="font-medium">Point {index + 1}:</span>
                          <span>{point[1].toFixed(6)}°N, {point[0].toFixed(6)}°E</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      
      if (coordinates?.type === 'Point' && coordinates.coordinates) {
        const [lng, lat] = coordinates.coordinates;
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Water Source Location (Point):
            </div>
            <div className="p-2 bg-muted/50 rounded text-sm">
              {lat.toFixed(6)}°N, {lng.toFixed(6)}°E
            </div>
          </div>
        );
      }
      
      return <div className="text-sm text-muted-foreground">No coordinates available</div>;
    } catch (error) {
      return <div className="text-sm text-red-500">Invalid coordinate data</div>;
    }
  };

  // Helper function to format application ID
  const formatApplicationId = (application: ApplicationWithRelations) => {
    // Only show the RWB format application number, no UUID fallback
    return application.application_number || 'Pending Assignment';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading application details...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-red-600 mb-4">Error</h2>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">{error}</p>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!application) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-4">Application Not Found</h2>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">
              Application not found. Please check the application ID and try again.
            </p>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
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
          {/* Application Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">{application.project_title}</h1>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
                Application submitted on {formatDate(application.created_at)} • Read-only view
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex items-center gap-2">
                {getStatusBadge(application.status)}
                {(application.status === 'revision_required' || application.status === 'draft') && (
                  <Link href={
                    (application as any).is_renewal 
                      ? `/dashboard/new-application?mode=renewal&applicationId=${application.id}&permitId=${(application as any).renewed_from_permit_id}`
                      : `/dashboard/edit-application/${application.id}`
                  }>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Application
                    </Button>
                  </Link>
                )}
              </div>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">
                Application ID: <span className="font-mono text-foreground font-semibold">{formatApplicationId(application)}</span>
              </p>
            </div>
          </div>

          {/* Transfer terms gate (transferor cannot accept terms) */}
          {application.status === 'approved_pending_permit' &&
            isTransferApp &&
            transferTermsBlocked && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-amber-900">
                  This is a <strong>permit transfer</strong>. Only the <strong>transferee</strong> (matching email + phone) can approve the request and accept the Terms &amp; Conditions at this stage.
                </AlertDescription>
              </Alert>
            )}
          

          {/* Rejection Alert — distinguish between RWB rejection and applicant T&C rejection */}
          {application.status === 'rejected' && (
            <Alert className={(application as any).terms_status === 'rejected'
              ? "border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 shadow-sm"
              : "border-red-200 bg-red-50"
            }>
              {(application as any).terms_status === 'rejected' ? (
                <User2 className="h-5 w-5 text-orange-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    {(application as any).terms_status === 'rejected' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-orange-900 text-base">You Declined the Terms and Conditions</p>
                          <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-100 text-xs">
                            Terms Declined
                          </Badge>
                        </div>
                        <p className="text-orange-800">
                          You declined the Terms and Conditions for this application. The application has been rejected as a result. You may submit a new application if you wish to proceed.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-red-800">Application Rejected by RWB</p>
                          <Badge variant="destructive" className="text-xs">
                            RWB Decision
                          </Badge>
                        </div>
                        <p className="text-red-700">
                          Your water permit application has been rejected by Rwanda Water Resources Board.
                          {application.rejection_reason && (
                            <span className="block mt-2 font-medium">Reason: {application.rejection_reason}</span>
                          )}
                        </p>
                      </>
                    )}

                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Approval Alert */}
          {application.status === 'approved' && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium text-green-800">Application Approved!</p>
                    <p className="text-green-700">
                      Congratulations! Your water permit application has been approved by Rwanda Water Resources Board.
                    </p>
                    {(canDownloadPermit || canDownloadTerms) ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canDownloadPermit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-white hover:bg-green-100 border-green-300 text-green-800"
                            onClick={handleDownloadPermit}
                            disabled={isDownloadingPermit}
                          >
                            {isDownloadingPermit ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            {isDownloadingPermit ? "Downloading Permit..." : "Download Permit"}
                          </Button>
                        )}
                        {canDownloadTerms && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-white hover:bg-green-100 border-green-300 text-green-800"
                            onClick={handleDownloadTerms}
                            disabled={isDownloadingTerms}
                          >
                            {isDownloadingTerms ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4 mr-2" />
                            )}
                            {isDownloadingTerms ? "Downloading Terms..." : "Download Terms & Conditions"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-green-700 pt-1">
                        Permit documents are being prepared and will appear here shortly.
                      </p>
                    )}
                    {application.approval_conditions && (
                      <div className="mt-2">
                        <p className="font-medium text-green-800">Approval Conditions:</p>
                        <p className="text-green-700 whitespace-pre-line">{application.approval_conditions}</p>
                      </div>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Revision Notes Alert */}
          {application.status === 'revision_required' && application.revision_notes && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium text-orange-800">Application Returned for Revision</p>
                    <p className="text-orange-700">{application.revision_notes}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={
                      (application as any).is_renewal 
                        ? `/dashboard/new-application?mode=renewal&applicationId=${application.id}&permitId=${(application as any).renewed_from_permit_id}`
                        : `/dashboard/edit-application/${application.id}`
                    }>
                      <Button variant="outline" size="sm" className="bg-white hover:bg-orange-50 border-orange-300">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Application
                      </Button>
                    </Link>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Application Form in Read-only Mode */}
          {/* For renewal applications, show the renewal form */}
          {isTransferApp ? (
            loadingTransferPermit ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <span className="ml-3 text-sm text-muted-foreground">Loading transfer details...</span>
              </div>
            ) : transferPermit ? (
              <PermitTransferForm
                permit={transferPermit}
                userData={userData}
                onSubmit={async () => {}}
                onSaveAsDraft={async () => {}}
                isLoading={false}
                initialData={transferFormData || undefined}
                initialDocuments={initialDocuments}
                mode="view"
                readOnly={true}
                currentApplication={application}
              />
            ) : (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Original permit details could not be loaded for this transfer.
                </AlertDescription>
              </Alert>
            )
          ) : (application as any).is_renewal && renewalPermit ? (
            <PermitRenewalForm 
              permit={renewalPermit}
              userData={userData}
              onSubmit={async () => {}}
              onSaveAsDraft={async () => {}}
              isLoading={false}
              currentApplication={application}
              readOnly={true}
            />
          ) : loadingRenewalPermit && (application as any).is_renewal ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-sm text-muted-foreground">Loading renewal details...</span>
            </div>
          ) : initialFormData && Object.keys(initialFormData).length > 0 ? (
            <ApplicationForm 
              userData={userData}
              onSubmit={handleSubmitApplication}
              onSaveAsDraft={handleSaveAsDraft}
              isLoading={false}
              initialData={initialFormData}
              initialDocuments={initialDocuments}
              mode="view"
              readOnly={true}
              currentApplication={application} // Pass the application object to handle payment tab correctly
            />
          ) : null}

        </motion.div>
      </div>

    </DashboardLayout>
    </ProtectedRoute>
  );
} 
