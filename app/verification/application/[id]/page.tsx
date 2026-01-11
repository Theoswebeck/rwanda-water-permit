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
import { DocumentVerificationComponent, VerificationStatus } from "@/components/inspection/document-verification";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import type { RecommendationData } from "@/components/inspection/verification-summary";
import { ArrowLeft, Loader2, XCircle, ClipboardCheck, Check, X, CheckCircle } from "lucide-react";

const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new").then((mod) => ({ default: mod.ApplicationForm })),
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
  try {
    sessionStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify({ ...banner, ts: Date.now() }));
  } catch {
    // ignore (storage may be unavailable)
  }
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

  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");

  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  const [recommendation, setRecommendation] = useState<RecommendationData>({ recommendation: null, explanationText: "" });
  const [reportType, setReportType] = useState<ReportType>("abstraction");

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Restore any persisted banner after a router.refresh()
    try {
      const raw = sessionStorage.getItem(BANNER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UIBanner> & { ts?: number };
        if (parsed && parsed.scope && parsed.scope === (params.id as string) && parsed.kind && parsed.title) {
          setBanner({ kind: parsed.kind, title: parsed.title, description: parsed.description });
          sessionStorage.removeItem(BANNER_STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
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
          .eq("application_number", applicationNumber)
          .single();

        if (appError) throw appError;
        setApplication(appData);

        const formData = mapApplicationToFormData(appData, null);
        setInitialFormData(formData);

        // Process documents for ApplicationForm
        const documentMap: Record<string, { url: string; name: string }> = {};
        if (appData.documents && Array.isArray(appData.documents)) {
          for (const doc of appData.documents) {
            if (!doc.file_path || !doc.name) continue;
            const publicUrl = getDocumentUrl(doc.file_path);
            if (!publicUrl) continue;

            const pathParts = doc.file_path.split("/");
            const fileName = pathParts[pathParts.length - 1];
            const fieldNameMatch = fileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\\d+\\./);
            if (fieldNameMatch) {
              const fieldName = fieldNameMatch[1];
              if (!fieldName.startsWith("additional_")) {
                documentMap[fieldName] = { url: publicUrl, name: doc.name };
              }
            } else {
              documentMap[doc.type] = { url: publicUrl, name: doc.name };
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
          setDocumentVerifications(existingAssessment.document_verifications || {});
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          setInspectorName(existingAssessment.inspector_name || "");
          setInspectionDate(existingAssessment.inspection_date || "");
          setRecommendation({
            recommendation: existingAssessment.recommendation as "yes" | "no" | null,
            explanationText: existingAssessment.explanation_text || "",
          });
          if (existingAssessment.field_report_files && Array.isArray(existingAssessment.field_report_files)) {
            const files = existingAssessment.field_report_files.map((path: string) => {
              const name = path.split("/").pop() || "File";
              return {
                id: Math.random().toString(36).slice(2),
                name: name.replace(/^\\d+-/, ""),
                path,
                size: 0,
                type: name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
                uploadedAt: existingAssessment.created_at,
              };
            });
            setFieldReportFiles(files);
          }

          // Extract assessment_report_data from existing assessment
          const rawAssessmentReportData = (existingAssessment as any)?.assessment_report_data;
          // Handle cases where it might be null, undefined, or empty object
          if (rawAssessmentReportData && typeof rawAssessmentReportData === 'object') {
            // Check if it's not just an empty object
            const hasData = Object.keys(rawAssessmentReportData).length > 0;
            if (hasData) {
              savedAssessmentReportData = rawAssessmentReportData as Partial<AssessmentReportData>;
              console.log('✅ Loaded saved assessment report data:', savedAssessmentReportData);
            } else {
              console.log('⚠️ assessment_report_data exists but is empty object');
            }
          } else {
            console.log('⚠️ No assessment_report_data found in existing assessment');
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
        } else {
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

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      pending_verification: { label: "Pending Verification", variant: "default" },
      pending_review: { label: "Pending Review", variant: "secondary" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
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

      const nextBanner: UIBanner = {
        scope: application.application_number,
        kind: "success",
        title: "Sent to approver",
        description: "The application has been forwarded for final approval.",
      };
      persistBanner(nextBanner);
      setBanner({ kind: nextBanner.kind, title: nextBanner.title, description: nextBanner.description });
      router.refresh();
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
        .update({ status: "pending_review", updated_at: new Date().toISOString() })
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
      setBanner({ kind: nextBanner.kind, title: nextBanner.title, description: nextBanner.description });
      router.refresh();
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
                  onClick={handleForwardToApprover}
                  disabled={actionLoading}
                >
                  <Check className="h-4 w-4" />
                  Send to Approver
                </Button>
              </div>
            )}

            <Tabs defaultValue="application_details" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/80">
                <TabsTrigger value="application_details" className="py-2.5">
                  Application Details
                </TabsTrigger>
                <TabsTrigger value="doc_verification" className="py-2.5">
                  Document Verification
                </TabsTrigger>
                <TabsTrigger value="field_report" className="py-2.5">
                  Field Report
                </TabsTrigger>
                <TabsTrigger value="internal_notes" className="py-2.5">
                  History & Notes
                </TabsTrigger>
              </TabsList>

            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {initialFormData && (
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
                  isStaffView={true}
                />
              )}
            </TabsContent>

            <TabsContent value="doc_verification" className="space-y-6 focus-visible:outline-none">
              <DocumentVerificationComponent
                documents={application.documents || []}
                verifications={documentVerifications}
                onVerificationsChange={() => {}}
                readOnly={true}
              />
            </TabsContent>

            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              <div className="grid grid-cols-1 gap-6">
                <FieldReportUpload
                  applicationId={application.id}
                  existingFiles={fieldReportFiles}
                  summary={fieldReportSummary}
                  inspectorName={inspectorName}
                  inspectionDate={inspectionDate}
                  onFilesChange={() => {}}
                  onSummaryChange={() => {}}
                  onInspectorNameChange={() => {}}
                  onInspectionDateChange={() => {}}
                  inspectorNameReadOnly={true}
                  readOnly={true}
                  hideSummary={true}
                  showInlineValidation={false}
                  betweenDetailsAndDocuments={
                    <AssessmentReportForm
                      reportData={assessmentReportData}
                      onReportDataChange={() => {}}
                      reportType={reportType}
                      readOnly={true}
                      inspectionDate={inspectionDate}
                      recommendation={recommendation}
                      onRecommendationChange={() => {}}
                    />
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              <div className="space-y-6">
                <ApplicationComments applicationId={application.id} />
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
      </DashboardLayout>
    </ProtectedRoute>
  );
}


