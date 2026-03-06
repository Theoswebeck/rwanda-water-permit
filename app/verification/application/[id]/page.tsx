"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, normalizeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";
import { AssessorRecommendations } from "@/components/inspection/assessor-recommendations";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { enrichModificationChanges } from "@/lib/application-utils";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import type { RecommendationData } from "@/components/inspection/verification-summary";
import { ArrowLeft, Loader2, XCircle, ClipboardCheck, Check, X, CheckCircle, AlertTriangle } from "lucide-react";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import { RegistryPermitComparisonCard } from "@/components/inspection/registry-permit-comparison-card";

const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading application form...</span>
      </div>
    ),
    ssr: false,
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

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

type BannerKind = "success" | "error" | "info";
type UIBanner = {
  scope: string;
  kind: BannerKind;
  title: string;
  description?: string;
};

const BANNER_STORAGE_KEY = "waterpermit:verification:uiBanner";

function persistBanner(banner: UIBanner) {
  // Intentionally no-op: do not persist UI state in browser session storage.
  void banner;
}

// Transform Application data back to form format for viewing (copied from other staff pages)
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};

  const notes = application.internal_notes || "";
  try {
    const storedFormData = JSON.parse(notes);
    if (storedFormData && storedFormData.fullNameApplicant !== undefined) {
      Object.assign(formData, storedFormData);
    }
  } catch {
    // Legacy fallback: best-effort
    formData.fullNameApplicant = application.project_title?.replace(" Water Permit Application", "") || "Application";
    formData.nameSourceWater = application.water_body_name || "";
    formData.tributaryToMain = application.tributary_name || "";
    formData.waterSourceType = "stream_river";
  }

  // Ensure polygons are properly formatted (back-compat with legacy waterSourceCoordinates)
  if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
    // ok
  } else if (Array.isArray(formData.waterSourceCoordinates)) {
    formData.waterSourcePolygons = [formData.waterSourceCoordinates];
  } else {
    try {
      const polys = geometryToCoordinatePolygons(application.coordinates);
      formData.waterSourcePolygons = polys && polys.length > 0 ? polys : [[{ latitude: "", longitude: "" }]];
    } catch {
      formData.waterSourcePolygons = [[{ latitude: "", longitude: "" }]];
    }
  }

  if (userProfile) {
    formData.telephoneContact = userProfile.phone || userProfile.company_phone || formData.telephoneContact;
    formData.emailAddress = userProfile.email || formData.emailAddress;
  }

  return formData;
}

export default function VerificationApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Omit<UIBanner, "scope"> | null>(null);

  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});

  // Renewal permit state (for renewal applications)
  const [renewalPermit, setRenewalPermit] = useState<PermitWithApplication | null>(null);
  const [loadingRenewalPermit, setLoadingRenewalPermit] = useState(false);

  // Transfer permit state (for transfer applications)
  const [transferPermit, setTransferPermit] = useState<PermitWithApplication | null>(null);
  const [loadingTransferPermit, setLoadingTransferPermit] = useState(false);
  const [transferFormData, setTransferFormData] = useState<any>(null);
  const [isTransferApp, setIsTransferApp] = useState(false);
  const [isModificationApp, setIsModificationApp] = useState(false);
  const [originalModificationApp, setOriginalModificationApp] = useState<any>(null);

  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [assessmentSubmittedDate, setAssessmentSubmittedDate] = useState("");

  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  const [recommendation, setRecommendation] = useState<RecommendationData>({ recommendation: null, explanationText: "" });
  const [reportType, setReportType] = useState<ReportType>("abstraction");
  
  // Assessor Recommendations State (read-only for verifiers)
  const [requestedDurationYears, setRequestedDurationYears] = useState<number | undefined>(undefined);
  const [requestedVolumeM3, setRequestedVolumeM3] = useState<number | undefined>(undefined);
  const [originalBaselineDurationYears, setOriginalBaselineDurationYears] = useState<number | undefined>(undefined);
  const [originalBaselineVolumeM3, setOriginalBaselineVolumeM3] = useState<number | undefined>(undefined);
  const [recommendedDurationYears, setRecommendedDurationYears] = useState<number | undefined>(undefined);
  const [recommendedVolumeM3, setRecommendedVolumeM3] = useState<number | undefined>(undefined);

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showSendToApproverDialog, setShowSendToApproverDialog] = useState(false);

  useEffect(() => {
    // Do not restore persisted UI state from browser storage.
  }, [params.id]);

  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const applicationNumber = params.id as string;

        const { data: appData, error: appError } = await supabase
          .from("applications")
          .select(
            `
            *,
            applicant:users!applicant_id(*),
            documents(*),
            reviews:reviews!application_id(*)
          `
          )
          .neq("status", "draft")
          .eq("application_number", applicationNumber)
          .single();

        if (appError) throw appError;
        setApplication(appData);

        const formData = mapApplicationToFormData(appData, null);
        setInitialFormData(formData);

        // Handle transfer/modification applications: load transfer data and original permit details
        const parsedNotes = (() => {
          try {
            return appData.internal_notes ? JSON.parse(appData.internal_notes) : null;
          } catch {
            return null;
          }
        })();
        const transferDetected = appData.application_type === 'transfer' || parsedNotes?.isTransfer === true;
        const modificationDetected = (appData as any).is_modification === true || parsedNotes?.isModification === true;
        setIsTransferApp(transferDetected);
        setIsModificationApp(modificationDetected);

        // For modification apps: fetch the original application to reconstruct missing previous values
        if (modificationDetected) {
          const origAppId = (appData as any).modified_from_application_id || parsedNotes?.originalApplicationId;
          if (origAppId) {
            try {
              const { data: origApp } = await supabase
                .from('applications')
                .select('internal_notes, proposed_duration_years, intended_activities')
                .eq('id', origAppId)
                .maybeSingle();
              setOriginalModificationApp(origApp || null);
            } catch (err) {
              console.error('⚠️ Could not fetch original application for modification enrichment:', err);
            }
          }
        }

        if (transferDetected) {
          setTransferFormData(parsedNotes?.transferFormData || null);
          const originalPermitId = parsedNotes?.originalPermitId;
          const originalPermitNumber = parsedNotes?.originalPermitNumber;

          if (originalPermitId || originalPermitNumber) {
            setLoadingTransferPermit(true);
            try {
              let permitQuery = supabase
                .from('permits')
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
                permitQuery = permitQuery.eq('id', originalPermitId);
              } else if (originalPermitNumber) {
                permitQuery = permitQuery.eq('permit_number', originalPermitNumber);
              }

              const { data: permitData, error: permitError } = await permitQuery.maybeSingle();
              if (permitError) throw permitError;
              setTransferPermit(permitData || null);
            } catch (permitErr) {
              console.error('Error fetching original permit for transfer:', permitErr);
              setTransferPermit(null);
            } finally {
              setLoadingTransferPermit(false);
            }
          }
        }

        // Process documents for ApplicationForm
        const documentMap: Record<string, { url: string; name: string }> = {};
        const processDocsIntoMap = (docs: any[]) => {
          for (const doc of docs) {
            if (!doc.file_path || !doc.name) continue;
            const publicUrl = getDocumentUrl(doc.file_path);
            if (!publicUrl) continue;

            const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
            if (!fieldName.startsWith("additional_") && !documentMap[fieldName]) {
              documentMap[fieldName] = { url: publicUrl, name: doc.name };
            }
          }
        };

        // 1. Process this application's own documents first
        if (appData.documents && Array.isArray(appData.documents)) {
          processDocsIntoMap(appData.documents);
        }

        // 2. For modifications: also load documents from the original application
        if (modificationDetected) {
          const originalAppId = (appData as any).modified_from_application_id || parsedNotes?.originalApplicationId;
          if (originalAppId) {
            try {
              const { data: originalDocs } = await supabase
                .from('documents')
                .select('*')
                .eq('application_id', originalAppId)
                .order('created_at', { ascending: false });
              if (originalDocs) {
                processDocsIntoMap(originalDocs);
              }
            } catch (e) {
              console.error('⚠️ Failed to load original application documents:', e);
            }
          }
        }

        setInitialDocuments(documentMap);

        // Load latest technical assessment as read-only evidence for verifier
        const { data: existingAssessment } = await supabase
          .from("technical_assessments")
          .select("*")
          .eq("application_id", appData.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let savedAssessmentReportData: Partial<AssessmentReportData> | null | undefined = null;

        if (existingAssessment) {
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          setInspectorName(existingAssessment.inspector_name || "");
          setInspectionDate(existingAssessment.inspection_date || "");
          setAssessmentSubmittedDate(
            toDateInputValue(
              existingAssessment.forwarded_at ||
              existingAssessment.updated_at ||
              existingAssessment.created_at
            )
          );
          setRecommendation({
            recommendation: existingAssessment.recommendation as "yes" | "no" | null,
            explanationText: existingAssessment.explanation_text || "",
          });
          if (existingAssessment.field_report_files && Array.isArray(existingAssessment.field_report_files)) {
            const files = existingAssessment.field_report_files.map((path: string) => {
              const name = path.split("/").pop() || "File";
              return {
                id: Math.random().toString(36).slice(2),
                name: name.replace(/^\d+-/, ""),
                path,
                size: 0,
                type: name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
                uploadedAt: existingAssessment.created_at,
              };
            });
            setFieldReportFiles(files);
          }

          savedAssessmentReportData = normalizeAssessmentReportData(
            (existingAssessment as any)?.assessment_report_data
          );
          if (savedAssessmentReportData) {
            console.log("✅ Loaded saved assessment report data:", savedAssessmentReportData);
          } else {
            console.log("⚠️ No usable assessment_report_data found in existing assessment");
          }

          const rt: ReportType = determineReportType(
            (appData as any)?.intended_activities as string[] | null,
            appData.water_purpose || null
          );
          setReportType(rt);
          const prefilled = prefillAssessmentReportFromApplication(appData, formData, appData.documents || []);
          const merged = mergeAssessmentReportData(prefilled, savedAssessmentReportData || null);
          console.log('🔄 Merged assessment report data:', merged);
          setAssessmentReportData(merged);
          
          // Initialize Assessor Recommendations values (read-only for verifiers)
          // Only use _assessorAdjustments from this application's saved assessment, not stale
          // values that may have been carried over from a previous submission cycle (modifications).
          const assessorAdjustments = formData._assessorAdjustments || {};
          const originalRequestedValues = formData._originalRequestedValues || {};
          
          // REQUESTED VALUES for assessor comparison (always current submission values)
          const currentRequestedDuration = formData.permitLengthYears;
          if (typeof currentRequestedDuration === 'number' && currentRequestedDuration >= 1 && currentRequestedDuration <= 15) {
            setRequestedDurationYears(currentRequestedDuration);
          }
          const currentRequestedVolume =
            formData.waterAbstractionDetails?.[0]?.maxAverageYearly
            || appData.max_yearly_volume_m3
            || appData.estimated_usage_volume;
          if (typeof currentRequestedVolume === 'number' && Number.isFinite(currentRequestedVolume)) {
            setRequestedVolumeM3(currentRequestedVolume);
          }

          // Original baseline values for historical reference rows
          const baselineDuration = originalRequestedValues.permitLengthYears;
          if (typeof baselineDuration === 'number' && baselineDuration >= 1 && baselineDuration <= 15) {
            setOriginalBaselineDurationYears(baselineDuration);
          } else {
            setOriginalBaselineDurationYears(undefined);
          }
          const baselineVolume = originalRequestedValues.volumeM3;
          if (typeof baselineVolume === 'number' && Number.isFinite(baselineVolume)) {
            setOriginalBaselineVolumeM3(baselineVolume);
          } else {
            setOriginalBaselineVolumeM3(undefined);
          }
          
          // ASSESSOR RECOMMENDED VALUES (from assessor adjustments)
          const assessorDuration = assessorAdjustments.permitLengthYears 
            || (typeof currentRequestedDuration === 'number' ? currentRequestedDuration : undefined);
          if (typeof assessorDuration === 'number' && assessorDuration >= 1 && assessorDuration <= 15) {
            setRecommendedDurationYears(assessorDuration);
          }
          const assessorVolume = assessorAdjustments.recommendedVolumeM3 
            || (typeof currentRequestedVolume === 'number' ? currentRequestedVolume : undefined);
          if (typeof assessorVolume === 'number' && Number.isFinite(assessorVolume)) {
            setRecommendedVolumeM3(assessorVolume);
          }
        } else {
          setAssessmentSubmittedDate("");
          // Still set report type for rendering
          setReportType(determineReportType((appData as any)?.intended_activities as string[] | null, appData.water_purpose || null));
        }
      } catch (e) {
        console.error("❌ Error fetching verification application:", e);
        setError(e instanceof Error ? e.message : "Failed to fetch application");
      } finally {
        setLoading(false);
      }
    };

    if (params.id) fetchApplicationDetails();
  }, [params.id]);

  // Load renewal permit data if this is a renewal application
  useEffect(() => {
    const loadRenewalPermit = async () => {
      if (!application) return;
      
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
        }
      } catch (err) {
        console.error('Error loading renewal permit:', err);
      } finally {
        setLoadingRenewalPermit(false);
      }
    };
    
    loadRenewalPermit();
  }, [application]);

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      pending_verification: { label: "Pending Verification", variant: "default" },
      pending_review: { label: "Pending Review", variant: "secondary" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      // Returned statuses
      returned_to_assessment: { label: "🔄 Returned to Assessor", variant: "secondary" },
      returned_to_review: { label: "🔄 Returned to Reviewer", variant: "secondary" },
      returned_to_verification: { label: "🔄 Returned to Verifier", variant: "secondary" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleForwardToApprover = async () => {
    if (!application) return;
    if (actionLoading) return;
    try {
      setActionLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { error: appError } = await supabase
        .from("applications")
        .update({ status: "pending_final_approval", updated_at: new Date().toISOString() })
        .eq("id", application.id);
      if (appError) throw appError;

      await supabase.from("workflow_history").insert({
        application_id: application.id,
        from_status: application.status,
        to_status: "pending_final_approval",
        action: "verification_completed",
        comment: "Verifier recommended proceeding to final approval.",
        user_id: user?.id,
      });

      setShowSendToApproverDialog(false);
      const nextBanner: UIBanner = {
        scope: application.application_number,
        kind: "success",
        title: "Sent to approver",
        description: "The application has been forwarded for final approval.",
      };
      persistBanner(nextBanner);
      // Navigate back to dashboard to confirm action was successful
      router.push('/verification');
    } catch (e) {
      console.error("❌ Failed to forward to approver:", e);
      setBanner({
        kind: "error",
        title: "Failed to send to approver",
        description: "Please try again.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToReviewer = async () => {
    if (!application || !returnNotes.trim()) return;
    if (actionLoading) return;
    try {
      setActionLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { error: appError } = await supabase
        .from("applications")
        .update({ status: "returned_to_review", updated_at: new Date().toISOString() })
        .eq("id", application.id);
      if (appError) throw appError;

      await supabase.from("reviews").insert([{
        application_id: application.id,
        reviewer_id: user?.id,
        review_stage: "verification",
        overall_comments: returnNotes.trim(),
        status: "returned",
      }]);

      setShowReturnDialog(false);
      setReturnNotes("");
      const nextBanner: UIBanner = {
        scope: application.application_number,
        kind: "success",
        title: "Returned to reviewer",
        description: "The reviewer has been notified with your notes.",
      };
      persistBanner(nextBanner);
      // Navigate back to dashboard to confirm action was successful
      router.push('/verification');
    } catch (e) {
      console.error("❌ Failed to return to reviewer:", e);
      setBanner({
        kind: "error",
        title: "Failed to return to reviewer",
        description: "Please try again.",
      });
    } finally {
      setActionLoading(false);
    }
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

  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading application</p>
              <p className="text-muted-foreground text-sm mt-1">{error || "Application not found"}</p>
              <Button onClick={() => router.push("/verification")} className="mt-4" variant="outline">
                Back to Verifier Dashboard
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["verifier", "admin", "approver"]} requireProfile={true}>
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
            <div className="space-y-6">
              <div className="flex items-center">
                <Link href="/verification">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                  </Button>
                </Link>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-primary text-3xl font-semibold tracking-tight">
                    Verification: {application.application_number}
                  </h1>
                  {getStatusBadge(application.status)}
                </div>
                <p className="text-muted-foreground">Verify completeness and consistency before final approval</p>
              </div>
            </div>

            {/* Verifier Actions (aligned with Review/Assessment UX) */}
            {application.status === "pending_verification" && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
                <div className="flex items-center gap-2 mr-auto">
                  <Badge
                    variant="outline"
                    className="h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                    Verifier Actions
                  </Badge>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowReturnDialog(true)}
                  disabled={actionLoading}
                >
                  <X className="h-4 w-4" />
                  Return to Reviewer
                </Button>

                <Button
                  size="sm"
                  className="bg-black hover:bg-gray-800 text-white gap-2"
                  onClick={() => setShowSendToApproverDialog(true)}
                  disabled={actionLoading}
                >
                  <Check className="h-4 w-4" />
                  Send to Approver
                </Button>
              </div>
            )}

            <Tabs defaultValue="application_details" className="space-y-6">
              <TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-2' : 'grid-cols-3'} h-auto p-1 bg-muted/80`}>
                <TabsTrigger value="application_details" className="py-2.5">
                  Application Details
                </TabsTrigger>
                {!isTransferApp && (
                <TabsTrigger value="field_report" className="py-2.5">
                  Assessment Report
                </TabsTrigger>
                )}
                <TabsTrigger value="internal_notes" className="py-2.5">
                  History & Notes
                </TabsTrigger>
              </TabsList>

            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {application && <RegistryPermitComparisonCard application={application} />}
              {/* Show Transfer Form for transfer applications */}
              {isTransferApp ? (
                loadingTransferPermit ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-sm text-muted-foreground">Loading transfer details...</span>
                  </div>
                ) : transferPermit ? (
                  <PermitTransferForm
                    permit={transferPermit}
                    userData={{
                      email: application.applicant?.email || "",
                      name:
                        application.applicant?.company_name ||
                        (application.applicant?.first_name && application.applicant?.last_name
                          ? `${application.applicant.first_name} ${application.applicant.last_name}`
                          : ""),
                      phone: application.applicant?.phone || application.applicant?.company_phone || "",
                      address: application.applicant?.company_address || "",
                      account_type: application.applicant?.account_type || "individual",
                    }}
                    onSubmit={async () => {}}
                    onSaveAsDraft={async () => {}}
                    isLoading={false}
                    initialData={transferFormData || undefined}
                    initialDocuments={initialDocuments}
                    mode="view"
                    readOnly={true}
                    currentApplication={application}
                    isStaffView={true}
                  />
                ) : (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      Original permit details could not be loaded for this transfer.
                    </AlertDescription>
                  </Alert>
                )
              ) : isModificationApp ? (
                initialFormData ? (
                  <ApplicationForm
                    userData={{
                      email: application.applicant?.email || "",
                      name:
                        application.applicant?.company_name ||
                        (application.applicant?.first_name && application.applicant?.last_name
                          ? `${application.applicant.first_name} ${application.applicant.last_name}`
                          : ""),
                      phone: application.applicant?.phone || "",
                      address: application.applicant?.address || "",
                      idNumber: "",
                      account_type: "individual" as const,
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
                    currentApplication={application}
                    isStaffView={true}
                    isModification={true}
                    modificationChanges={enrichModificationChanges((application as any).modification_changes, originalModificationApp)}
                  />
                ) : null
              ) : (application as any).is_renewal && renewalPermit ? (
                <PermitRenewalForm 
                  permit={renewalPermit}
                  userData={{
                    id: application.applicant?.id,
                    email: application.applicant?.email || "",
                    phone: application.applicant?.phone || "",
                    first_name: application.applicant?.first_name,
                    last_name: application.applicant?.last_name,
                    company_name: application.applicant?.company_name,
                    account_type: application.applicant?.account_type || 'individual',
                  }}
                  onSubmit={async () => {}}
                  onSaveAsDraft={async () => {}}
                  isLoading={false}
                  currentApplication={application}
                  readOnly={true}
                  isStaffView={true}
                />
              ) : loadingRenewalPermit && (application as any).is_renewal ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-3 text-sm text-muted-foreground">Loading renewal details...</span>
                </div>
              ) : initialFormData ? (
                <ApplicationForm
                  userData={{
                    email: application.applicant?.email || "",
                    name:
                      application.applicant?.company_name ||
                      (application.applicant?.first_name && application.applicant?.last_name
                        ? `${application.applicant.first_name} ${application.applicant.last_name}`
                        : ""),
                    phone: application.applicant?.phone || "",
                    address: application.applicant?.address || "",
                    idNumber: "",
                    account_type: "individual" as const,
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
                  currentApplication={application}
                  isStaffView={true}
                />
              ) : null}
            </TabsContent>

            {/* Assessment Report Tab - Hidden for transfer applications */}
            {!isTransferApp && (
            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              <div className="grid grid-cols-1 gap-6">
                <FieldReportUpload
                  applicationId={application.id}
                  existingFiles={fieldReportFiles}
                  summary={fieldReportSummary}
                  inspectorName={inspectorName}
                  inspectionDate={inspectionDate}
                  assessmentSubmittedDate={assessmentSubmittedDate}
                  onFilesChange={() => {}}
                  onSummaryChange={() => {}}
                  onInspectorNameChange={() => {}}
                  onInspectionDateChange={() => {}}
                  inspectorNameReadOnly={true}
                  readOnly={true}
                  hideSummary={true}
                  showInlineValidation={false}
                  betweenDetailsAndDocuments={
                    <div className="space-y-6">
                      {/* Assessor Recommendations - Read-only for verifiers */}
                      <AssessorRecommendations
                        requestedDurationYears={requestedDurationYears}
                        requestedVolumeM3={requestedVolumeM3}
                        originalBaselineDurationYears={originalBaselineDurationYears}
                        originalBaselineVolumeM3={originalBaselineVolumeM3}
                        recommendedDurationYears={recommendedDurationYears}
                        recommendedVolumeM3={recommendedVolumeM3}
                        readOnly={true}
                      />
                      
                      {/* Assessment Report Form */}
                      <AssessmentReportForm
                        reportData={assessmentReportData}
                        onReportDataChange={() => {}}
                        reportType={reportType}
                        readOnly={true}
                        inspectionDate={inspectionDate}
                        assessmentSubmittedDate={assessmentSubmittedDate}
                        recommendation={recommendation}
                        onRecommendationChange={() => {}}
                      />
                    </div>
                  }
                />
              </div>
            </TabsContent>
            )}


            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              <div className="space-y-6">
                <ApplicationComments 
                  applicationId={application.id}
                  applicationStatus={application.status}
                  applicationSubmittedAt={application.submitted_at ?? undefined}
                  applicationCreatedAt={application.created_at}
                  applicantName={application.applicant?.first_name && application.applicant?.last_name 
                    ? `${application.applicant.first_name} ${application.applicant.last_name}`
                    : application.applicant?.company_name || application.project_title?.replace(' Water Permit Application', '') || undefined}
                />
              </div>
            </TabsContent>
            </Tabs>
          </motion.div>
        </div>

        {/* Success/Error Banner */}
        {banner && (
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-2">
            <Alert
              className={cn(
                "flex items-start justify-between gap-4 border shadow-sm",
                banner.kind === "success" && "border-green-200 bg-green-50/60",
                banner.kind === "error" && "border-red-200 bg-red-50/60",
                banner.kind === "info" && "border-slate-200 bg-slate-50/60"
              )}
            >
              <CheckCircle
                className={cn(
                  "h-4 w-4",
                  banner.kind === "success" && "text-green-700",
                  banner.kind === "error" && "text-red-700",
                  banner.kind === "info" && "text-slate-700"
                )}
              />
              <div className="flex-1">
                <AlertTitle className={cn(banner.kind === "success" && "text-green-900", banner.kind === "error" && "text-red-900")}>
                  {banner.title}
                </AlertTitle>
                {banner.description ? <AlertDescription>{banner.description}</AlertDescription> : null}
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setBanner(null)}>
                Dismiss
              </Button>
            </Alert>
          </div>
        )}

        <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Return to Reviewer</DialogTitle>
              <DialogDescription>Provide a clear reason for returning this application to the reviewer.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="return-notes">Notes *</Label>
              <Textarea
                id="return-notes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                rows={5}
                placeholder="Describe the issue(s) that require reviewer attention..."
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowReturnDialog(false);
                  setReturnNotes("");
                }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleReturnToReviewer} disabled={actionLoading || !returnNotes.trim()} className="gap-2">
                <X className="h-4 w-4" />
                Return
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send to Approver Confirmation Dialog */}
        <Dialog open={showSendToApproverDialog} onOpenChange={setShowSendToApproverDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Confirm Action
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to send this application to the approver? This action will change the application status and notify the approver for final decision.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowSendToApproverDialog(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleForwardToApprover}
                disabled={actionLoading}
                className="bg-black hover:bg-gray-800 text-white gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Yes, Send to Approver
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
}


