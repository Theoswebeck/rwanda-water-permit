"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { 
  ArrowLeft, 
  X, 
  Send, 
  AlertTriangle,
  Loader2,
  XCircle,
  ClipboardCheck,
  CheckCircle
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { DocumentVerificationComponent, VerificationStatus } from "@/components/inspection/document-verification";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import type { VerificationChecklist, RecommendationData } from "@/components/inspection/verification-summary";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";

// Lazy load the ApplicationForm component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new").then(mod => ({ default: mod.ApplicationForm })),
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

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

type DocReviewMeta = {
  eligibilityConfirmed: boolean;
  eligibilityConfirmedAt?: string;
  completenessConfirmed: boolean;
  completenessConfirmedAt?: string;
};

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
    
    // Ensure polygons are properly formatted (back-compat with legacy waterSourceCoordinates)
    if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
      // ok
    } else if (Array.isArray(formData.waterSourceCoordinates)) {
      formData.waterSourcePolygons = [formData.waterSourceCoordinates];
    } else {
      formData.waterSourcePolygons = [
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
    
    // Contact information
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
    
    // Water source location
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
    formData.waterReliability = 'water_always_available';
    
    // Intended activities - reverse map from water_purpose
    const purposeToActivity: Record<string, string> = {
      'domestic': 'water_supply',
      'irrigation': 'irrigation',
      'fish_farming_lakes': 'fish_farming_lakes',
      'fish_farming_ponds': 'fish_farming_ponds',
      'industrial': 'industry',
      'electricity_generation': 'electricity_generation',
      'mining': 'mining',
      'recreation': 'recreation_activities',
      'livestock': 'livestock'
    };
    
    if (Array.isArray((application as any).intended_activities) && (application as any).intended_activities.length > 0) {
      formData.intendedActivities = (application as any).intended_activities;
    } else {
      const mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
      formData.intendedActivities = [mappedActivity];
    }
    
    // Water abstraction details
    formData.waterAbstractionDetails = [{
      activity: mappedActivity,
      flowRate: '',
      flowRateUnit: 'm³/s',
      maxAverageYearly: application.estimated_usage_volume || 0,
      abstractionMethod: application.water_taking_method || 'pump'
    }];
    
    // Land ownership
    formData.ownsAllLand = true;
    formData.hasLandAccess = true;
    
    // Annexes
    if (application.electricity_generation_capacity) {
      formData.annexF_electricityDetails = application.electricity_generation_capacity;
    }
    if (application.mining_operations_type) {
      formData.annexG_miningDetails = application.mining_operations_type;
    }
  
    // Certification
    formData.certificationAgreement = true;
  }
  
  return formData;
}

export default function AssessmentApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  
  // ApplicationForm state
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  
  // Assessment State
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  const [docReviewMeta, setDocReviewMeta] = useState<DocReviewMeta>({
    eligibilityConfirmed: false,
    completenessConfirmed: false,
  });
  const [docReviewSaveLoading, setDocReviewSaveLoading] = useState(false);
  
  // Field Report State
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Verification Checklist State
  const [checklist, setChecklist] = useState<VerificationChecklist>({
    locationVerified: false,
    waterSourceAccessible: false,
    environmentalImpactAssessed: false,
    technicalFeasibilityConfirmed: false,
    infrastructureAdequate: false
  });
  
  // Recommendation State
  const [recommendation, setRecommendation] = useState<RecommendationData>({
    recommendation: null,
    explanationText: ""
  });

  // Assessment Report State (template-backed)
  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});

  // Prevent accidental double-submits / re-entrancy (fast double-clicks, etc.)
  const actionInFlightRef = useRef(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const tabTouchedRef = useRef(false);

  // Allow assessment edits while the application is actively under assessment.
  // Once it's forwarded to the next stage (pending_review or beyond) it must be view-only.
  const isEditableAssessment =
    application?.status === "pending_assessment" ||
    application?.status === "under_review";
  const isReadOnly = application ? !isEditableAssessment : true;
  const defaultTabValue = isReadOnly ? "application_details" : "doc_verification";
  const docReviewLocked = !!docReviewMeta.completenessConfirmed;
  const canProceedPastDocReview =
    isReadOnly || (docReviewMeta.eligibilityConfirmed && docReviewMeta.completenessConfirmed);
  const requiredDocuments = Array.isArray((assessmentReportData as any).requiredDocuments)
    ? ((assessmentReportData as any).requiredDocuments as any[])
    : [];
  const allRequiredDocsProvided =
    requiredDocuments.length > 0 &&
    requiredDocuments.every((d) => d && typeof d === "object" && d.provided === true);
  const isFieldReportComplete =
    isReadOnly ||
    (fieldReportFiles.length > 0 &&
      !!assessmentReportData.waterUseConflict &&
      !!assessmentReportData.wastewaterSystemDescription &&
      !!assessmentReportData.pollutionDescription &&
      !!assessmentReportData.conclusion &&
      !!recommendation.recommendation &&
      (recommendation.recommendation === "yes" || !!recommendation.explanationText));

  useEffect(() => {
    if (tabTouchedRef.current) return;
    setActiveTab(defaultTabValue);
  }, [defaultTabValue]);
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const applicationNumber = params.id as string;

        const formatFullName = (u?: { first_name?: string | null; last_name?: string | null }) => {
          const first = (u?.first_name || "").trim();
          const last = (u?.last_name || "").trim();
          const full = `${first} ${last}`.trim();
          return full;
        };

        // Current logged-in user (assessor)
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        
        // Fetch application with related data
        const { data: appData, error: appError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(*),
            documents(*),
            reviews:reviews!application_id(*)
          `)
          .eq('application_number', applicationNumber)
          .single();

        if (appError) throw appError;

        // If there's an assigned inspector, fetch the assigned user information
        let assignedInspectorName = "";
        if (appData.assigned_inspector_id) {
          const { data: assignedUserData } = await supabase
            .from('users')
            .select('first_name, last_name, role')
            .eq('id', appData.assigned_inspector_id)
            .single();
            
          if (assignedUserData) {
            (appData as any).assigned_to_user = assignedUserData;
            assignedInspectorName = formatFullName(assignedUserData);
          }
        }

        setApplication(appData);

        // Fetch existing assessment if any
        const { data: existingAssessment } = await supabase
          .from('technical_assessments')
          .select('*')
          .eq('application_id', appData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Keep saved report data for merge later (prefill always wins for app-derived read-only fields)
        const savedAssessmentReportData =
          (existingAssessment as any)?.assessment_report_data as Partial<AssessmentReportData> | null | undefined;

        // Compute default inspector name (priority: saved assessment -> current logged-in user -> assigned inspector)
        let currentAssessorName = "";
        if (authUser?.id) {
          const { data: currentUserData } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', authUser.id)
            .maybeSingle();
          currentAssessorName =
            formatFullName(currentUserData || undefined) ||
            (typeof (authUser.user_metadata as any)?.full_name === "string"
              ? String((authUser.user_metadata as any).full_name).trim()
              : "") ||
            (authUser.email || "");
        }

        const defaultInspectorName =
          (existingAssessment?.inspector_name || "").trim() ||
          currentAssessorName ||
          assignedInspectorName;

        // Only set if still empty, so we don't overwrite manual edits
        if (defaultInspectorName) {
          setInspectorName((prev) => (prev ? prev : defaultInspectorName));
        }

        if (existingAssessment) {
          setAssessmentId(existingAssessment.id);
          // document_verifications may contain metadata under "__meta"
          const rawDocVerifications: any = existingAssessment.document_verifications || {};
          const meta: any =
            rawDocVerifications && typeof rawDocVerifications === "object"
              ? (rawDocVerifications.__meta as any)
              : undefined;
          const cleaned: Record<string, { status: VerificationStatus; notes: string }> = {
            ...(rawDocVerifications && typeof rawDocVerifications === "object" ? rawDocVerifications : {}),
          };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete (cleaned as any).__meta;
          setDocumentVerifications(cleaned);
          if (meta && typeof meta === "object") {
            setDocReviewMeta({
              eligibilityConfirmed: !!meta.eligibilityConfirmed,
              eligibilityConfirmedAt: typeof meta.eligibilityConfirmedAt === "string" ? meta.eligibilityConfirmedAt : undefined,
              completenessConfirmed: !!meta.completenessConfirmed,
              completenessConfirmedAt: typeof meta.completenessConfirmedAt === "string" ? meta.completenessConfirmedAt : undefined,
            });
          }
          
          // Restore field report data
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          if (existingAssessment.inspection_date) {
            setInspectionDate(existingAssessment.inspection_date);
          }
          
          // Restore checklist
          setChecklist({
            locationVerified: existingAssessment.location_verified || false,
            waterSourceAccessible: existingAssessment.water_source_accessible || false,
            environmentalImpactAssessed: existingAssessment.environmental_impact_assessed || false,
            technicalFeasibilityConfirmed: existingAssessment.technical_feasibility_confirmed || false,
            infrastructureAdequate: existingAssessment.infrastructure_adequate || false
          });
          
          // Restore recommendation
          setRecommendation({
            recommendation: existingAssessment.recommendation as "yes" | "no" | null,
            explanationText: existingAssessment.explanation_text || ""
          });

          // Restore field report files
          if (existingAssessment.field_report_files && Array.isArray(existingAssessment.field_report_files)) {
            const files = existingAssessment.field_report_files.map((path: string) => {
              const name = path.split('/').pop() || 'File';
              const timestampMatch = name.match(/^(\d+)-/);
              const uploadedAt = timestampMatch 
                ? new Date(parseInt(timestampMatch[1])).toISOString() 
                : existingAssessment.created_at;
                
              return {
                id: Math.random().toString(36).substr(2, 9),
                name: name.replace(/^\d+-/, ''),
                path: path,
                size: 0, // Size is not stored, but could be fetched if needed
                type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', // Approximation
                uploadedAt: uploadedAt
              };
            });
            setFieldReportFiles(files);
          }
        }

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);
        setInitialFormData(formData);

        // Prefill the official assessment report template from application data and merge saved assessor inputs
        const prefilledReport = prefillAssessmentReportFromApplication(appData, formData, appData.documents || []);
        const mergedReport = mergeAssessmentReportData(prefilledReport, savedAssessmentReportData || null);
        setAssessmentReportData(mergedReport);
        
        // Process documents for form
        const documentMap: Record<string, { url: string; name: string }> = {};
        
        if (appData.documents && Array.isArray(appData.documents)) {
          for (const doc of appData.documents) {
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const pathParts = doc.file_path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const fieldNameMatch = fileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);

                if (fieldNameMatch) {
                  const fieldName = fieldNameMatch[1];
                  if (!fieldName.startsWith('additional_')) {
                    documentMap[fieldName] = { url: publicUrl, name: doc.name };
                  }
                } else {
                  // Use document type as fallback key
                  documentMap[doc.type] = { url: publicUrl, name: doc.name };
                }
              }
            }
          }
        }
        
        setInitialDocuments(documentMap);

      } catch (err) {
        console.error('Error fetching application:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch application');
      } finally {
        setLoading(false);
      }
    };
    
    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id]);

  const saveAssessment = async (
    status: 'draft' | 'submitted' | 'forwarded_to_approver' | 'returned_for_revision' = 'draft',
    overrides?: {
      documentVerifications?: Record<string, { status: VerificationStatus; notes: string }>;
      docReviewMeta?: DocReviewMeta;
    }
  ) => {
    if (!application) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mergedDocVerifications = overrides?.documentVerifications ?? documentVerifications;
      const mergedDocReviewMeta = overrides?.docReviewMeta ?? docReviewMeta;

      const assessmentData = {
        application_id: application.id,
        assessor_id: user.id,
        document_verifications: {
          ...mergedDocVerifications,
          __meta: mergedDocReviewMeta,
        },
        field_report_summary: fieldReportSummary,
        field_report_files: fieldReportFiles.map(f => f.path),
        location_verified: checklist.locationVerified,
        water_source_accessible: checklist.waterSourceAccessible,
        environmental_impact_assessed: checklist.environmentalImpactAssessed,
        technical_feasibility_confirmed: checklist.technicalFeasibilityConfirmed,
        infrastructure_adequate: checklist.infrastructureAdequate,
        recommendation: recommendation.recommendation,
        explanation_text: recommendation.explanationText,
        inspector_name: inspectorName,
        inspection_date: inspectionDate,
        assessment_report_data: assessmentReportData,
        status: status,
        updated_at: new Date().toISOString()
      };

      let result;

      // If state wasn't hydrated (or a previous save happened in another tab),
      // re-check for an existing assessment before inserting a new one.
      let existingId = assessmentId;
      if (!existingId) {
        const { data: existingAssessment, error: existingErr } = await supabase
          .from('technical_assessments')
          .select('id')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingErr) throw existingErr;
        if (existingAssessment?.id) {
          existingId = existingAssessment.id;
          setAssessmentId(existingAssessment.id);
        }
      }

      if (existingId) {
        // Update existing
        result = await supabase
          .from('technical_assessments')
          .update(assessmentData)
          .eq('id', existingId)
          .select()
          .single();
      } else {
        // Create new
        result = await supabase
          .from('technical_assessments')
          .insert(assessmentData)
          .select()
          .single();
      }

      if (result.error) throw result.error;
      
      if (result.data) {
        setAssessmentId(result.data.id);
      }

      return result.data;
    } catch (err) {
      console.error('Error saving assessment:', err);
      throw err;
    }
  };

  const getDocsAllVerified = () => {
    const docs = application?.documents || [];
    if (!docs.length) return false;
    return docs.every((d) => (documentVerifications[d.id]?.status || "pending") === "verified");
  };

  const getNonVerifiedDocs = () => {
    const docs = application?.documents || [];
    return docs
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: (documentVerifications[d.id]?.status || "pending") as VerificationStatus,
      }))
      .filter((d) => d.status !== "verified");
  };

  const handleSaveEligibility = async (nextEligibilityConfirmed: boolean) => {
    if (!application) return;
    if (docReviewLocked || isReadOnly) return;
    if (docReviewSaveLoading) return;
    try {
      setDocReviewSaveLoading(true);
      const nextMeta: DocReviewMeta = {
        ...docReviewMeta,
        eligibilityConfirmed: nextEligibilityConfirmed,
        eligibilityConfirmedAt: nextEligibilityConfirmed ? new Date().toISOString() : undefined,
      };
      setDocReviewMeta(nextMeta);
      await saveAssessment("draft", { docReviewMeta: nextMeta });
      alert("✅ Eligibility confirmation saved.");
    } catch (err) {
      console.error("Error saving eligibility confirmation:", err);
      alert("❌ Failed to save eligibility confirmation.");
    } finally {
      setDocReviewSaveLoading(false);
    }
  };

  const handleConfirmCompletenessAndLock = async () => {
    if (!application) return;
    if (docReviewLocked || isReadOnly) return;
    if (docReviewSaveLoading) return;

    if (!docReviewMeta.eligibilityConfirmed) {
      alert("⚠️ Please confirm eligibility first.");
      return;
    }

    const nonVerified = getNonVerifiedDocs();
    if (nonVerified.length > 0) {
      const list = nonVerified
        .map((d) => `- ${d.name} (${d.status})`)
        .join("\n");
      alert(
        `⚠️ Please mark all uploaded documents as ✅ Verified before confirming completeness.\n\nNot verified yet:\n${list}`
      );
      return;
    }

    try {
      setDocReviewSaveLoading(true);
      const nextMeta: DocReviewMeta = {
        ...docReviewMeta,
        completenessConfirmed: true,
        completenessConfirmedAt: new Date().toISOString(),
      };
      setDocReviewMeta(nextMeta);
      await saveAssessment("draft", { docReviewMeta: nextMeta });
      alert("✅ Application marked complete. Document review is now locked.");
    } catch (err) {
      console.error("Error confirming completeness:", err);
      alert("❌ Failed to confirm completeness.");
    } finally {
      setDocReviewSaveLoading(false);
    }
  };

  const handleForwardToApprover = async () => {
    if (!application) return;

    if (actionInFlightRef.current) return;

    if (!canProceedPastDocReview) {
      alert("⚠️ Please confirm eligibility and application completeness in Document Verification before proceeding to Field Report / Recommendation.");
      return;
    }

    // Validate ONLY on submit click
    const missing: string[] = [];
    // Required documents (Section 2) must all be marked provided
    const requiredDocs = Array.isArray((assessmentReportData as any).requiredDocuments)
      ? ((assessmentReportData as any).requiredDocuments as any[])
      : [];
    const allRequiredDocsProvided =
      requiredDocs.length > 0 && requiredDocs.every((d) => d && typeof d === "object" && d.provided === true);
    if (!allRequiredDocsProvided) missing.push("Section 2: Required documents (mark all as Provided)");
    if (!assessmentReportData.waterUseConflict) missing.push("Section 5: Water use conflict");
    if (!assessmentReportData.wastewaterSystemDescription) missing.push("Section 6: Wastewater system description");
    if (!assessmentReportData.pollutionDescription) missing.push("Section 6: Pollution description");
    if (!assessmentReportData.conclusion) missing.push("Section 7: Field report Summary");
    if (!recommendation.recommendation) missing.push("Section 8: Assessor Recommendation");
    if (recommendation.recommendation === "no" && !recommendation.explanationText) {
      missing.push("Section 8: Explanation for Recommendation");
    }

    if (missing.length > 0) {
      alert(`⚠️ Please complete the following before sending for final approval:\n\n${missing.map((m) => `- ${m}`).join("\n")}`);
      tabTouchedRef.current = true;
      setActiveTab("field_report");
      return;
    }

    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;
      
      // 1. Save assessment with forwarded status
      await saveAssessment('forwarded_to_approver');
      
      // 2. Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          status: 'pending_review',
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (appError) throw appError;
      
      // Redirect to assessment dashboard
      router.push('/assessment');
      
    } catch (err) {
      console.error('Error forwarding application:', err);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
          ? (err as any).message
          : "Failed to forward application. Please try again.";
      alert(msg);
    } finally {
      setSubmitLoading(false);
      actionInFlightRef.current = false;
    }
  };

  const handleReturnForRevision = async () => {
    if (!application || !revisionNotes.trim()) return;

    if (actionInFlightRef.current) return;

    if (docReviewLocked) {
      alert("⚠️ This application has already been confirmed complete and can no longer be returned for revision.");
      return;
    }
    
    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;
      
      // 1. Save assessment with revision status
      await saveAssessment('returned_for_revision');
      
      // 2. Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          status: 'revision_required',
          revision_notes: revisionNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (appError) throw appError;
      
      setShowRevisionDialog(false);
      setRevisionNotes("");
      alert("Application returned to applicant for revision.");
      // ⚡ PERFORMANCE: Use router.refresh() instead of full page reload
      router.refresh();
      
    } catch (err) {
      console.error('Error returning application:', err);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
          ? (err as any).message
          : "Failed to return application. Please try again.";
      alert(msg);
    } finally {
      setSubmitLoading(false);
      actionInFlightRef.current = false;
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      pending_payment: { label: "Pending Payment", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
    };
    
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading application details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading application</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
              <Button onClick={() => window.location.href = '/assessment'} className="mt-4" variant="outline">
                Back to Assessment Dashboard
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!application) return null;
  
  return (
    <DashboardLayout>
      <div className="flex justify-end p-6">
        <UserProfileButton />
      </div>
      
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6 pb-8"
        >
          {/* Header */}
          <div className="space-y-6">
            <div className="flex items-center">
              <Link href="/assessment">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
      
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-primary text-3xl font-semibold tracking-tight">
                  Assessment: {application.application_number}
                </h1>
                {getStatusBadge(application.status)}
              </div>

              <p className="text-muted-foreground">
                Perform field assessment and verification for water permit application
              </p>
              
              {(application as any)?.assigned_to_user && (
                <p className="text-sm text-muted-foreground">
                  Assigned to: {(application as any).assigned_to_user.first_name} {(application as any).assigned_to_user.last_name}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mr-auto">
              <Badge
                variant="outline"
                className={
                  isReadOnly
                    ? "h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200"
                    : "h-7 px-3 text-sm font-normal bg-blue-50 text-blue-700 border-blue-200"
                }
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                {isReadOnly ? "View Only" : "Assessment Mode"}
              </Badge>
            </div>

            {!isReadOnly && (
              <Button
                size="sm"
                onClick={handleForwardToApprover}
                disabled={submitLoading}
                className="gap-2 bg-black hover:bg-gray-800 text-white"
              >
                {submitLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send for review
              </Button>
            )}
          </div>

          {/* Main Content with Tabs */}
          <Tabs
            value={activeTab || defaultTabValue}
            onValueChange={(next) => {
              if (!canProceedPastDocReview && next === "field_report") {
                alert("⚠️ Please confirm eligibility and completeness in Document Verification before proceeding.");
                return;
              }
              tabTouchedRef.current = true;
              setActiveTab(next);
            }}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/80">
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              <TabsTrigger value="doc_verification" className="py-2.5">Document Verification</TabsTrigger>
                  <TabsTrigger value="field_report" className="py-2.5" disabled={!canProceedPastDocReview}>
                    Field Report
                  </TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
            </TabsList>

            {/* Application Details Tab */}
            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {initialFormData && (
                <ApplicationForm 
                  userData={{
                    email: application.applicant?.email || "",
                    name: application.applicant?.company_name || 
                          (application.applicant?.first_name && application.applicant?.last_name ? 
                           `${application.applicant.first_name} ${application.applicant.last_name}` : ""),
                    phone: application.applicant?.phone || "",
                    address: application.applicant?.address || "",
                    idNumber: "",
                    account_type: 'individual' as const,
                    id_number: "",
                    company_tin: "",
                  }}
                  onSubmit={async () => {}} 
                  onSaveAsDraft={async () => {}}
                  isLoading={false}
                  initialData={initialFormData}
                  initialDocuments={initialDocuments}
                  mode="view"
                  readOnly={true}
                  isStaffView={true}
                />
              )}
            </TabsContent>

            {/* Document Verification Tab */}
            <TabsContent value="doc_verification" className="space-y-6 focus-visible:outline-none">
              <DocumentVerificationComponent
                documents={application.documents || []}
                verifications={documentVerifications}
                onVerificationsChange={setDocumentVerifications}
                readOnly={isReadOnly || docReviewLocked}
              />

              {!isReadOnly && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Eligibility & Completeness</CardTitle>
                    <CardDescription>
                      Confirm eligibility and completeness before proceeding to Field Report. If incomplete, return the application for revision with comments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {docReviewLocked && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Locked:</strong> Completeness confirmed{docReviewMeta.completenessConfirmedAt ? ` on ${new Date(docReviewMeta.completenessConfirmedAt).toLocaleString()}` : ""}. Document review is read-only and the application can no longer be returned for revision.
                        </AlertDescription>
                      </Alert>
                    )}

                    {!docReviewLocked && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          You can only proceed to <strong>Field Report</strong> after confirming both eligibility and completeness.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="eligibility-confirmed"
                        checked={docReviewMeta.eligibilityConfirmed}
                        disabled={docReviewLocked || docReviewSaveLoading}
                        onCheckedChange={(checked) => handleSaveEligibility(!!checked)}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="eligibility-confirmed" className="text-sm font-medium">
                          I confirm the application and documents are eligible for assessment
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          This is required before confirming completeness.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                      <div className="text-sm text-muted-foreground">
                        <strong>Completeness requires:</strong> all uploaded documents marked as <strong>✅ Verified</strong>.
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowRevisionDialog(true)}
                          disabled={docReviewLocked || docReviewSaveLoading || submitLoading}
                          className="gap-2"
                        >
                          <X className="h-4 w-4" />
                          Return for Revision
                        </Button>
                        <Button
                          onClick={handleConfirmCompletenessAndLock}
                          disabled={docReviewLocked || docReviewSaveLoading || !docReviewMeta.eligibilityConfirmed || !getDocsAllVerified()}
                        >
                          {docReviewSaveLoading ? "Saving..." : "Confirm Completeness & Lock"}
                        </Button>
                      </div>
                    </div>

                    {!docReviewLocked && docReviewMeta.eligibilityConfirmed && getNonVerifiedDocs().length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Still pending:</strong> {getNonVerifiedDocs().length} document(s) are not marked as ✅ Verified yet. Please update their statuses above before confirming completeness.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Field Report Tab */}
            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              {(() => {
                const intended = (application as any)?.intended_activities as string[] | null | undefined;
                const rt: ReportType = determineReportType(intended || null, application.water_purpose || null);
                return (
                  <FieldReportUpload
                    applicationId={application.id}
                    existingFiles={fieldReportFiles}
                    summary={fieldReportSummary}
                    inspectorName={inspectorName}
                    inspectionDate={inspectionDate}
                    onFilesChange={setFieldReportFiles}
                    onSummaryChange={setFieldReportSummary}
                    onInspectorNameChange={setInspectorName}
                    onInspectionDateChange={setInspectionDate}
                    documentsTitle="Supporting Documents"
                    documentsRequired={false}
                    documentsDescription="Upload any supporting documents (optional): PDFs, Word docs, and photos"
                    inspectorNameReadOnly={true}
                    readOnly={isReadOnly}
                    hideSummary={true}
                    showInlineValidation={false}
                    betweenDetailsAndDocuments={
                      <AssessmentReportForm
                        reportData={assessmentReportData}
                        onReportDataChange={setAssessmentReportData}
                        reportType={rt}
                        readOnly={isReadOnly}
                        inspectionDate={inspectionDate}
                        recommendation={recommendation}
                        onRecommendationChange={setRecommendation}
                      />
                    }
                    afterDocuments={
                      isReadOnly ? null : (() => {
                        // If any required doc missing, only allow Return for Revision.
                        if (!allRequiredDocsProvided) {
                          return (
                            <div className="flex justify-end gap-3">
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => setShowRevisionDialog(true)}
                                disabled={submitLoading || docReviewLocked}
                                className="gap-2"
                              >
                                <X className="h-4 w-4" />
                                Return for Revision
                              </Button>
                              <Button
                                size="lg"
                                onClick={handleForwardToApprover}
                                disabled={true}
                                className="gap-2 bg-black/70 hover:bg-black/70 text-white"
                                title="Mark all required documents as Provided in Section 2 to enable submission."
                              >
                                <Send className="h-4 w-4" />
                                Send for review
                              </Button>
                            </div>
                          );
                        }

                        return (
                          <div className="flex justify-end">
                            <Button
                              size="lg"
                              onClick={handleForwardToApprover}
                              disabled={submitLoading}
                              className="gap-2 bg-black hover:bg-gray-800 text-white"
                            >
                              {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              Send for review
                            </Button>
                          </div>
                        );
                      })()
                    }
                  />
                );
              })()}
            </TabsContent>

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              {application.id && <ApplicationComments applicationId={application.id} />}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Return Application for Revision
            </DialogTitle>
            <DialogDescription>
              Provide detailed instructions on what needs to be corrected. The applicant will be notified to make changes and resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Revision Instructions *</Label>
              <Textarea
                id="revision-notes"
                placeholder="E.g., The site plan does not match the coordinates provided. Please update..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={5}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleReturnForRevision}
              disabled={!revisionNotes.trim() || submitLoading}
            >
              {submitLoading ? 'Returning...' : 'Return for Revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
