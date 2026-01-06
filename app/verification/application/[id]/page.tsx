"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DocumentVerificationComponent, VerificationStatus } from "@/components/inspection/document-verification";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { ArrowLeft, Loader2, XCircle, ClipboardCheck, FileText, Check, X } from "lucide-react";

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

  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});

  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");

  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  const [reportType, setReportType] = useState<ReturnType<typeof determineReportType>>("abstraction");

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

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

        if (existingAssessment) {
          setDocumentVerifications(existingAssessment.document_verifications || {});
          setFieldReportSummary(existingAssessment.field_report_summary || "");
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

          const savedAssessmentReportData =
            (existingAssessment as any)?.assessment_report_data as Partial<AssessmentReportData> | null | undefined;

          const type = determineReportType(appData as any);
          setReportType(type);
          const prefilled = prefillAssessmentReportFromApplication({ application: appData as any, reportType: type });
          const merged = mergeAssessmentReportData({ reportType: type, prefilled, existing: savedAssessmentReportData || {} });
          setAssessmentReportData(merged);
        } else {
          // Still set report type for rendering
          setReportType(determineReportType(appData as any));
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

      alert("Application forwarded to approver.");
      router.refresh();
    } catch (e) {
      console.error("❌ Failed to forward to approver:", e);
      alert("Failed to forward application. Please try again.");
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

      await supabase.from("workflow_history").insert({
        application_id: application.id,
        from_status: application.status,
        to_status: "pending_review",
        action: "returned_to_review",
        comment: `Returned to review: ${returnNotes.trim()}`,
        user_id: user?.id,
      });

      setShowReturnDialog(false);
      setReturnNotes("");
      alert("Application returned to reviewer.");
      router.refresh();
    } catch (e) {
      console.error("❌ Failed to return to reviewer:", e);
      alert("Failed to return application. Please try again.");
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
    <DashboardLayout>
      <div className="flex justify-end p-6">
        <UserProfileButton />
      </div>

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6 pb-8">
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
                <h1 className="text-primary text-3xl font-semibold tracking-tight">Verification: {application.application_number}</h1>
                {getStatusBadge(application.status)}
              </div>
              <p className="text-muted-foreground">Verify completeness and consistency before final approval</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mr-auto">
              <Badge variant="outline" className="h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200">
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

          <Tabs defaultValue="application_details" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/80">
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              <TabsTrigger value="doc_verification" className="py-2.5">Document Verification</TabsTrigger>
              <TabsTrigger value="field_report" className="py-2.5">Field Report</TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
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
                <AssessmentReportForm
                  reportType={reportType}
                  data={assessmentReportData}
                  onChange={() => {}}
                  readOnly={true}
                />
                <FieldReportUpload
                  files={fieldReportFiles}
                  onFilesChange={() => {}}
                  readOnly={true}
                  applicationId={application.id}
                />
                <div className="space-y-2">
                  <Label>Field Report Summary</Label>
                  <Textarea value={fieldReportSummary} readOnly rows={6} />
                </div>
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
            <Button variant="outline" onClick={() => { setShowReturnDialog(false); setReturnNotes(""); }} disabled={actionLoading}>
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
  );
}


