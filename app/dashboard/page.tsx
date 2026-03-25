"use client";

import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationStatus } from "@/components/dashboard/application-status";
import type { Permit as PermitListItem } from "@/components/dashboard/permits-list";
import { PermitStatus } from "@/components/dashboard/permits-status";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck, Loader2, AlertCircle, FileText, CheckCircle, ClipboardList, ChevronDown, FilePlus, FileEdit, ArrowLeftRight, RefreshCw, BarChart3, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import dynamic from "next/dynamic";
import { PermitSelectModal } from "@/components/dashboard/permit-select-modal";
// ⚡ PERFORMANCE: Use React Query hooks for automatic caching
import { useApplicationsQuery, useDeleteApplicationMutation } from "@/hooks/useApplicationsQuery";
import { usePermitsQuery, PermitWithApplication } from "@/hooks/usePermitsQuery";
import { useIncomingTransfersQuery, type IncomingTransferRequest } from "@/hooks/useIncomingTransfersQuery";
import { useWaterUseReportsQuery, type WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";
import { WaterUseReportStatus, type ReportStatusFilter } from "@/components/dashboard/water-use-report-status";
import { useAuth } from "@/contexts/AuthContext";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import type { Permit as DatabasePermit } from "@/types/database";
import type { Application, ApplicationStatus as DbApplicationStatus } from "@/types/database";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

const ApplicationsList = dynamic(
  () => import("@/components/dashboard/applications-list").then((mod) => mod.ApplicationsList),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading applications…", getPreferredLanguage())}
        </span>
      </div>
    ),
  }
);

const PermitsList = dynamic(
  () => import("@/components/dashboard/permits-list").then((mod) => mod.PermitsList),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading permits…", getPreferredLanguage())}
        </span>
      </div>
    ),
  }
);

const ApplicantWaterUseReportsList = dynamic(
  () => import("@/components/dashboard/applicant-water-use-reports-list").then((mod) => mod.ApplicantWaterUseReportsList),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-muted-foreground">
          {translateText("Loading reports…", getPreferredLanguage())}
        </span>
      </div>
    ),
  }
);

type ApplicantDashboardApplication = Application & {
  /**
   * Applicant-safe status for UI only.
   * Raw `status` is preserved for behavior (edit, accept terms, etc).
   */
  display_status?: DbApplicationStatus;
  /** Last recorded status-action timestamp (falls back to created_at from API). */
  last_action_at?: string | null;
};

type DashboardStatusPanelFilter = "all" | "draft" | "approved" | "rejected" | "expired";
type ApplicantListStatusFilter = "all" | "draft" | "submitted" | "under_review" | "revision_required" | "approved_pending_permit" | "approved" | "rejected" | "pending_payment" | "expired";

function mapApplicantDisplayStatus(status: DbApplicationStatus): DbApplicationStatus {
  // Applicant-visible statuses:
  // - draft, submitted, under_review, revision_required, approved, expired
  // - plus: approved_pending_permit (approved pending signature/terms acceptance)
  // - plus: pending_payment (payment failed or not yet completed)
  // Returned workflow statuses are surfaced to applicants as revision_required.
  // Any other internal status is mapped to under_review on the dashboard UI.
  if (
    status === "draft" ||
    status === "submitted" ||
    status === "under_review" ||
    status === "revision_required" ||
    status === "approved" ||
    status === "expired" ||
    status === "approved_pending_permit" ||
    status === "pending_payment"
  ) {
    return status;
  }
  if (
    status === "returned_to_assessment" ||
    status === "returned_to_review" ||
    status === "returned_to_verification"
  ) {
    return "revision_required";
  }
  return "under_review";
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'permits' ? 'permits' : tabParam === 'reports' ? 'reports' : 'applications';
  const [activeTab, setActiveTab] = useState<"applications" | "permits" | "reports">(initialTab);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPermitSelectModal, setShowPermitSelectModal] = useState(false);
  const [activeApplicationStatusPanel, setActiveApplicationStatusPanel] = useState<DashboardStatusPanelFilter>("all");
  const [applicationsStatusFilter, setApplicationsStatusFilter] = useState<ApplicantListStatusFilter>("all");
  const [reportsStatusFilter, setReportsStatusFilter] = useState<ReportStatusFilter>("all");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  
  // Check for success parameters from URL
  useEffect(() => {
    const success = searchParams.get('success');
    const tab = searchParams.get('tab');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    if (success === 'application-created') {
      setSuccessMessage(tx('Application Created Successfully! Your water permit application has been saved as a draft. You can continue editing it or submit it for review.'));
      setShowSuccessAlert(true);
      // Auto-hide success message after 5 seconds
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    } else if (success === 'application-submitted') {
      setSuccessMessage(tx('✅ Application Submitted Successfully! Your water permit application has been submitted for review. You will be notified of any updates.'));
      setShowSuccessAlert(true);
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    } else if (success === 'application-resubmitted-to-assessor') {
      setSuccessMessage(tx('✅ Application Resubmitted Successfully! Your corrections have been submitted and sent back to the assigned assessor for review.'));
      setShowSuccessAlert(true);
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    } else if (success === 'report-submitted') {
      setSuccessMessage(tx('✅ Water Use Report Submitted Successfully! Your annual water use report has been submitted for review.'));
      setShowSuccessAlert(true);
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    }
    
    if (tab === 'applications') {
      setActiveTab('applications');
    } else if (tab === 'permits') {
      setActiveTab('permits');
    } else if (tab === 'reports') {
      setActiveTab('reports');
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [searchParams, tx]);
  
  // ⚡ PERFORMANCE: Use React Query hooks - automatic caching, no manual refresh needed
  // ⚡ FIX: Only fetch when user.id is defined (prevents hanging when user is deleted)
  const {
    data: applications = [],
    isLoading: applicationsLoading,
    error: applicationsQueryError,
    refetch: refreshApplications,
    isFetching: applicationsFetching
  } = useApplicationsQuery(user?.id, undefined, !!user?.id);

  const {
    data: databasePermits = [],
    isLoading: permitsLoading,
    error: permitsQueryError,
    isFetching: permitsFetching
  } = usePermitsQuery({ userId: user?.id, enabled: !!user?.id, includeApplication: true });

  const {
    data: incomingTransfers = [],
    isLoading: incomingTransfersLoading,
    error: incomingTransfersError,
    refetch: refetchIncomingTransfers,
  } = useIncomingTransfersQuery(!!user?.id);

  const {
    data: waterUseReports = [],
    isLoading: reportsLoading,
    error: reportsQueryError,
  } = useWaterUseReportsQuery(user?.id, !!user?.id);

  // ⚡ PERFORMANCE: Use mutation for deleting applications
  const deleteApplicationMutation = useDeleteApplicationMutation();
  
  // Convert React Query errors to strings for display
  const applicationsError = applicationsQueryError?.message || null;
  const permitsError = permitsQueryError?.message || null;
  const reportsError = reportsQueryError?.message || null;

  const applicantDashboardApplications = useMemo((): ApplicantDashboardApplication[] => {
    return applications.map((app) => ({
      ...app,
      display_status: mapApplicantDisplayStatus(app.status),
    }));
  }, [applications]);

  const permits = useMemo(() => {
    // Transform database permits to component format
    return databasePermits.map((dbPermit: PermitWithApplication): PermitListItem => {
      // Calculate status based on expiry date
      const now = new Date();
      const expiryDate = new Date(dbPermit.expiry_date);
      const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

      let displayStatus: "active" | "expired" | "expiring-soon" = "active";
      const dbStatus = dbPermit.status;
      if (dbStatus === "revoked" || dbStatus === "suspended" || dbStatus === "expired") {
        displayStatus = "expired";
      } else if (dbStatus === "expiring_soon") {
        displayStatus = "expiring-soon";
      } else if (expiryDate < now) {
        displayStatus = "expired";
      } else if (expiryDate <= thirtyDaysFromNow) {
        displayStatus = "expiring-soon";
      }

      const app = dbPermit.application as Record<string, unknown> | null | undefined;
      const intendedActivities = Array.isArray(app?.intended_activities)
        ? (app.intended_activities as string[]).filter((a) => typeof a === "string" && a.trim())
        : [];

      let transferActivity = "";
      if (!intendedActivities.length && app?.internal_notes) {
        try {
          const notes = typeof app.internal_notes === "string"
            ? JSON.parse(app.internal_notes)
            : app.internal_notes;
          if (notes?.transferFormData?.waterPurpose) {
            transferActivity = String(notes.transferFormData.waterPurpose);
          }
        } catch { /* ignore */ }
      }

      const activityCode = intendedActivities[0] || transferActivity || dbPermit.purpose || "";
      const activityLabel = activityCode ? getActivityLabel(activityCode) : (dbPermit.purpose || "N/A");

      return {
        id: dbPermit.id,
        title: `${activityLabel} ${tx("Water Permit")}`,
        issueDate: (app as { terms_accepted_at?: string | null } | undefined)?.terms_accepted_at || dbPermit.issued_date,
        expiryDate: dbPermit.expiry_date,
        status: displayStatus,
        type: activityLabel,
        location: "N/A",
        permitNumber: dbPermit.permit_number,
        isModification: (dbPermit as any).is_modification === true,
        modifiedCount: dbPermit.modification_count ?? 0,
        lastModifiedAt: dbPermit.last_modified_at ?? null,
        pdfPath: dbPermit.permit_pdf_url ?? null,
      };
    });
  }, [databasePermits, tx]);

  // ⚡ PERFORMANCE: Bulk delete handler using React Query mutation
  const handleBulkDeleteApplications = useCallback(async (applicationIds: string[]) => {
    try {
      // Delete applications one by one using mutation
      const deletePromises = applicationIds.map(id => 
        deleteApplicationMutation.mutateAsync(id)
      );
      await Promise.all(deletePromises);
      // React Query will automatically invalidate and refetch the list
    } catch (error) {
      console.error('Error deleting applications:', error);
      throw error;
    }
  }, [deleteApplicationMutation]);

  // ⚡ FIX: Better loading state detection - only show loading when actually fetching
  const isLoading = (applicationsLoading || permitsLoading) && !!user?.id;
  const hasError = applicationsError || permitsError || reportsError;

  const [approvingTransferId, setApprovingTransferId] = useState<string | null>(null);
  const [dismissingTransferId, setDismissingTransferId] = useState<string | null>(null);
  const [confirmDismissTransferId, setConfirmDismissTransferId] = useState<string | null>(null);
  const [incomingTransferActionError, setIncomingTransferActionError] = useState<string | null>(null);

  const approveIncomingTransfer = useCallback(
    async (transferRequestId: string) => {
      try {
        setIncomingTransferActionError(null);
        setApprovingTransferId(transferRequestId);
        const resp = await fetch('/api/transfers/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferRequestId }),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok || !json?.success) {
          throw new Error(json?.message || 'Failed to approve transfer request');
        }

        // Refresh lists so the transfer application appears under the transferee's applications.
        await Promise.all([
          refreshApplications(),
          refetchIncomingTransfers(),
        ]);

        if (json.applicationId) {
          router.push(`/dashboard/application/${json.applicationId}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('❌ Failed to approve incoming transfer:', e);
        setIncomingTransferActionError(msg);
      } finally {
        setApprovingTransferId(null);
      }
    },
    [refreshApplications, refetchIncomingTransfers, router]
  );

  const dismissIncomingTransfer = useCallback(
    async (transferRequestId: string) => {
      try {
        setIncomingTransferActionError(null);
        setDismissingTransferId(transferRequestId);
        const resp = await fetch('/api/transfers/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferRequestId }),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok || !json?.success) {
          throw new Error(json?.message || 'Failed to dismiss transfer request');
        }
        await refetchIncomingTransfers();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('❌ Failed to dismiss incoming transfer:', e);
        setIncomingTransferActionError(msg);
      } finally {
        setDismissingTransferId(null);
        setConfirmDismissTransferId(null);
      }
    },
    [refetchIncomingTransfers]
  );

  const handleApplicationStatusPanelChange = useCallback((panel: DashboardStatusPanelFilter) => {
    setActiveApplicationStatusPanel(panel);
    if (panel === "all") {
      setApplicationsStatusFilter("all");
      return;
    }
    if (panel === "draft") {
      setApplicationsStatusFilter("draft");
      return;
    }
    if (panel === "approved") {
      setApplicationsStatusFilter("approved");
      return;
    }
    if (panel === "rejected") {
      setApplicationsStatusFilter("rejected");
      return;
    }
    if (panel === "expired") {
      setApplicationsStatusFilter("expired");
      return;
    }
  }, []);

  const handleApplicationsStatusFilterChange = useCallback((status: ApplicantListStatusFilter) => {
    setApplicationsStatusFilter(status);
    if (status === "all") {
      setActiveApplicationStatusPanel("all");
      return;
    }
    if (status === "approved" || status === "approved_pending_permit") {
      setActiveApplicationStatusPanel("approved");
      return;
    }
    if (status === "draft") {
      setActiveApplicationStatusPanel("draft");
      return;
    }
    if (status === "rejected") {
      setActiveApplicationStatusPanel("rejected");
      return;
    }
    if (status === "expired") {
      setActiveApplicationStatusPanel("expired");
      return;
    }
    setActiveApplicationStatusPanel("all");
  }, []);

  const handleReportsStatusFilterChange = useCallback((filter: ReportStatusFilter) => {
    setReportsStatusFilter(filter);
  }, []);

  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
              <div>
                <h1 className="text-primary leading-tight text-2xl sm:text-4xl font-semibold tracking-tight xl:text-5xl xl:tracking-tighter">
                  {tx("Water Permit Dashboard")}
                </h1>
                <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                  {tx("Manage your water permit applications and view your permits")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2">
                      {tx("Apply")}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=new")}
                      className="cursor-pointer"
                    >
                      <FilePlus className="mr-2 h-4 w-4" />
                      {tx("New Water Permit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=renewal")}
                      className="cursor-pointer"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {tx("Renew Existing Permit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=modification")}
                      className="cursor-pointer"
                    >
                      <FileEdit className="mr-2 h-4 w-4" />
                      {tx("Modify Existing Permit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=transfer")}
                      className="cursor-pointer"
                    >
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      {tx("Transfer Existing Permit")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowPermitSelectModal(true)}
                  disabled={databasePermits.length === 0}
                >
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden sm:inline">{tx("Water Use Reporting")}</span>
                  <span className="sm:hidden">{tx("Reports")}</span>
                </Button>
              </div>
            </div>

            {/* Success Alert */}
            {showSuccessAlert && successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Alert className="mb-6 border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {successMessage}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {/* Error handling */}
            {hasError && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {applicationsError || permitsError || reportsError}
                </AlertDescription>
              </Alert>
            )}

            {/* Main Content */}
            <Tabs defaultValue="applications" value={activeTab} onValueChange={(value) => setActiveTab(value as "applications" | "permits" | "reports")} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="applications" className="flex items-center gap-1 text-xs sm:text-sm sm:gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>{tx("Applications")} ({applicantDashboardApplications.length})</span>
                </TabsTrigger>
                <TabsTrigger value="permits" className="flex items-center gap-1 text-xs sm:text-sm sm:gap-2">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  <span>{tx("Permits")} ({permits.length})</span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="flex items-center gap-1 text-xs sm:text-sm sm:gap-2">
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{tx("Water Use Reports")} ({waterUseReports.length})</span>
                  <span className="sm:hidden">{tx("Reports")} ({waterUseReports.length})</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="applications" className="space-y-4">
                {/* Applications Status Overview */}
                <ApplicationStatus 
                  applications={applicantDashboardApplications} 
                  loading={applicationsLoading}
                  activeFilter={activeApplicationStatusPanel}
                  onFilterChange={handleApplicationStatusPanelChange}
                  onRefresh={() => refreshApplications()}
                />

                {/* Incoming Transfers (Transferee) */}
                {((incomingTransfers?.length ?? 0) > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ArrowLeftRight className="h-5 w-5" />
                        {tx("Incoming Transfer Requests")}
                      </CardTitle>
                      <CardDescription>
                        {tx("Transfers sent to you (matched by your email and phone). You can approve only when the request is in the Approved - Pending Terms stage.")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {incomingTransferActionError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{incomingTransferActionError}</AlertDescription>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        {incomingTransfers.map((tr: IncomingTransferRequest) => {
                          const app = tr.application ?? null;
                          const appNumber = app?.application_number || tr.application_id;
                          const title = app?.project_title || tx("Transfer application");
                          return (
                            <div
                              key={tr.id}
                              className="flex flex-col gap-2 rounded-md border bg-white p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {tx("Ref:")} {appNumber} • {tx("Stage:")} {tx("Approved - Pending Terms")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDismissTransferId(tr.id)}
                                  disabled={dismissingTransferId === tr.id || approvingTransferId === tr.id}
                                >
                                  {dismissingTransferId === tr.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      {tx("Dismissing…")}
                                    </>
                                  ) : (
                                    <>
                                      <X className="h-4 w-4 mr-1" />
                                      {tx("Dismiss")}
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => approveIncomingTransfer(tr.id)}
                                  disabled={approvingTransferId === tr.id || dismissingTransferId === tr.id}
                                >
                                  {approvingTransferId === tr.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      {tx("Approving…")}
                                    </>
                                  ) : (
                                    tx("Approve Transfer & Continue")
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Dismiss transfer confirmation dialog */}
                <AlertDialog
                  open={!!confirmDismissTransferId}
                  onOpenChange={(open) => { if (!open) setConfirmDismissTransferId(null); }}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{tx("Dismiss Transfer Request?")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {tx("This action cannot be undone. The transfer request will be permanently dismissed and will no longer appear in your notifications.")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tx("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          if (confirmDismissTransferId) dismissIncomingTransfer(confirmDismissTransferId);
                        }}
                      >
                        {tx("Confirm Dismiss")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                {/* Applications List */}
                <div className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {tx("Your Applications")}
                      </CardTitle>
                      <CardDescription>
                        {tx("View and manage your water permit applications")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ApplicationsList 
                        applications={applicantDashboardApplications} 
                        loading={applicationsLoading}
                        statusFilter={applicationsStatusFilter}
                        onStatusFilterChange={handleApplicationsStatusFilterChange}
                        onDeleteApplications={handleBulkDeleteApplications}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="permits" className="space-y-4">
                {/* Permits Overview */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <PermitStatus permits={permits} />
                </motion.div>
                
                {/* Permits List */}
                <div className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileCheck className="h-5 w-5" />
                        {tx("Your Permits")}
                      </CardTitle>
                      <CardDescription>
                        {tx("View and manage your issued water permits")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PermitsList permits={permits} />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                {/* Reports Status Overview */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <WaterUseReportStatus
                    reports={waterUseReports}
                    loading={reportsLoading}
                    activeFilter={reportsStatusFilter}
                    onFilterChange={handleReportsStatusFilterChange}
                  />
                </motion.div>

                {/* Reports List */}
                <div className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        {tx("Your Water Use Reports")}
                      </CardTitle>
                      <CardDescription>
                        {tx("View and manage your annual water use reports")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ApplicantWaterUseReportsList
                        reports={waterUseReports}
                        loading={reportsLoading}
                        statusFilter={reportsStatusFilter}
                        onStatusFilterChange={handleReportsStatusFilterChange}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
        
        {/* Terms & Conditions Modal */}
        {/* This modal is now handled by the application detail page */}

        {/* Permit Select Modal for Water Use Reporting */}
        <PermitSelectModal
          open={showPermitSelectModal}
          onOpenChange={setShowPermitSelectModal}
          permits={databasePermits}
          loading={permitsLoading}
        />
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Loading fallback
function DashboardLoading() {
  const language = getPreferredLanguage();
  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3">{translateText("Loading dashboard...", language)}</span>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Main export with Suspense
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
} 