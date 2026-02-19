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
import { FileCheck, Loader2, AlertCircle, FileText, CheckCircle, ClipboardList, ChevronDown, FilePlus, FileEdit, ArrowLeftRight, RefreshCw } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import type { Permit as DatabasePermit } from "@/types/database";
import type { Application, ApplicationStatus as DbApplicationStatus } from "@/types/database";

const ApplicationsList = dynamic(
  () => import("@/components/dashboard/applications-list").then((mod) => mod.ApplicationsList),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-muted-foreground">Loading applications…</span>
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
        <span className="ml-3 text-sm text-muted-foreground">Loading permits…</span>
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
};

function mapApplicantDisplayStatus(status: DbApplicationStatus): DbApplicationStatus {
  // Applicant-visible statuses:
  // - draft, submitted, under_review, approved, expired
  // - plus: approved_pending_permit (approved pending signature/terms acceptance)
  // - plus: pending_payment (payment failed or not yet completed)
  // Any other internal status is mapped to under_review on the dashboard UI.
  if (
    status === "draft" ||
    status === "submitted" ||
    status === "under_review" ||
    status === "approved" ||
    status === "expired" ||
    status === "approved_pending_permit" ||
    status === "pending_payment"
  ) {
    return status;
  }
  return "under_review";
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const initialTab = searchParams.get('tab') === 'permits' ? 'permits' : 'applications';
  const [activeTab, setActiveTab] = useState<"applications" | "permits">(initialTab);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPermitSelectModal, setShowPermitSelectModal] = useState(false);
  
  // Check for success parameters from URL
  useEffect(() => {
    const success = searchParams.get('success');
    const tab = searchParams.get('tab');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    if (success === 'application-created') {
      setSuccessMessage('Application Created Successfully! Your water permit application has been saved as a draft. You can continue editing it or submit it for review.');
      setShowSuccessAlert(true);
      // Auto-hide success message after 5 seconds
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    } else if (success === 'application-submitted') {
      setSuccessMessage('✅ Application Submitted Successfully! Your water permit application has been submitted for review. You will be notified of any updates.');
      setShowSuccessAlert(true);
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    } else if (success === 'application-resubmitted-to-assessor') {
      setSuccessMessage('✅ Application Resubmitted Successfully! Your corrections have been submitted and sent back to the assigned assessor for review.');
      setShowSuccessAlert(true);
      timeoutId = setTimeout(() => setShowSuccessAlert(false), 5000);
    }
    
    if (tab === 'applications') {
      setActiveTab('applications');
    } else if (tab === 'permits') {
      setActiveTab('permits');
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [searchParams]);
  
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

  // ⚡ PERFORMANCE: Use mutation for deleting applications
  const deleteApplicationMutation = useDeleteApplicationMutation();
  
  // Convert React Query errors to strings for display
  const applicationsError = applicationsQueryError?.message || null;
  const permitsError = permitsQueryError?.message || null;

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

      return {
        id: dbPermit.id,
        title: `${dbPermit.purpose} Water Permit`, // Create a title from purpose
        issueDate: dbPermit.issued_date,
        expiryDate: dbPermit.expiry_date,
        status: displayStatus,
        type: dbPermit.purpose, // Use purpose as type
        location: "N/A", // We'll need to get this from related application
        permitNumber: dbPermit.permit_number,
        isModification: (dbPermit as any).is_modification === true,
        modifiedCount: dbPermit.modification_count ?? 0,
        lastModifiedAt: dbPermit.last_modified_at ?? null,
        pdfPath: dbPermit.permit_pdf_url ?? null,
      };
    });
  }, [databasePermits]);

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
  const hasError = applicationsError || permitsError;

  const [approvingTransferId, setApprovingTransferId] = useState<string | null>(null);
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
            <div className="flex items-center justify-between space-y-2 mb-8">
              <div>
                <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Water Permit Dashboard
                </h1>
                <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
                  Manage your water permit applications and view your permits
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2">
                      Apply
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=new")}
                      className="cursor-pointer"
                    >
                      <FilePlus className="mr-2 h-4 w-4" />
                      New Water Permit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=renewal")}
                      className="cursor-pointer"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Renew Existing Permit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=modification")}
                      className="cursor-pointer"
                    >
                      <FileEdit className="mr-2 h-4 w-4" />
                      Modify Existing Permit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push("/dashboard/new-application?mode=transfer")}
                      className="cursor-pointer"
                    >
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      Transfer Existing Permit
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
                  Water Use Reporting
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
                  {applicationsError || permitsError}
                </AlertDescription>
              </Alert>
            )}

            {/* Main Content */}
            <Tabs defaultValue="applications" value={activeTab} onValueChange={(value) => setActiveTab(value as "applications" | "permits")} className="space-y-4">
              <TabsList>
                <TabsTrigger value="applications" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Applications ({applicantDashboardApplications.length})
                </TabsTrigger>
                <TabsTrigger value="permits" className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Permits ({permits.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="applications" className="space-y-4">
                {/* Applications Status Overview */}
                <ApplicationStatus 
                  applications={applicantDashboardApplications} 
                  loading={applicationsLoading}
                  onRefresh={() => refreshApplications()}
                />

                {/* Incoming Transfers (Transferee) */}
                {((incomingTransfers?.length ?? 0) > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ArrowLeftRight className="h-5 w-5" />
                        Incoming Transfer Requests
                      </CardTitle>
                      <CardDescription>
                        Transfers sent to you (matched by your email and phone). You can approve only when the request is in the Pending Terms Acceptance stage.
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
                          const title = app?.project_title || 'Transfer application';
                          return (
                            <div
                              key={tr.id}
                              className="flex flex-col gap-2 rounded-md border bg-white p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{title}</div>
                                <div className="text-xs text-muted-foreground">
                                  Ref: {appNumber} • Stage: Pending Terms Acceptance
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => approveIncomingTransfer(tr.id)}
                                  disabled={approvingTransferId === tr.id}
                                >
                                  {approvingTransferId === tr.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      Approving…
                                    </>
                                  ) : (
                                    'Approve & Continue'
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
                
                {/* Applications List */}
                <div className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Your Applications
                      </CardTitle>
                      <CardDescription>
                        View and manage your water permit applications
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ApplicationsList 
                        applications={applicantDashboardApplications} 
                        loading={applicationsLoading}
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
                        Your Permits
                      </CardTitle>
                      <CardDescription>
                        View and manage your issued water permits
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PermitsList permits={permits} />
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
  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3">Loading dashboard...</span>
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