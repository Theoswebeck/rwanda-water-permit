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
import { FileCheck, Loader2, AlertCircle, FileText, CheckCircle, ClipboardList, ChevronDown, FilePlus, FileEdit, ArrowLeftRight } from "lucide-react";
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
  // Any other internal status is mapped to under_review on the dashboard UI.
  if (
    status === "draft" ||
    status === "submitted" ||
    status === "under_review" ||
    status === "approved" ||
    status === "expired" ||
    status === "approved_pending_permit"
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
      if (expiryDate < now) {
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