"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Search, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, MapPin, Loader2, Droplets, FileCheck, Calendar, Filter } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { ActivePermitsInspectionTab } from "@/components/inspection/active-permits-inspection-tab";
import { StaffInspectionsTab } from "@/components/inspection/staff-inspections-tab";
import { calculateDaysRemainingTo90DayDeadline, formatDate, sortBy90DayDeadlineClosest } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";
import { StaffTopTabs } from "@/components/shared/staff-top-tabs";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";

interface AssessmentApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
  deadline_90_days_remaining?: number;
}

interface AssessmentStatsData {
  newSubmissions: number;
  pendingAssessment: number;
  underAssessment: number;
  readyForReview: number;
}

export default function AssessmentDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState<"earliest" | "latest">("earliest");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  // Applications assigned to the current assessor (queue/worklist).
  const [assignedApplications, setAssignedApplications] = useState<AssessmentApplication[]>([]);
  // All non-draft applications visible to assessment staff (scope is enforced by Supabase RLS).
  const [allApplications, setAllApplications] = useState<AssessmentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingAssessment, setStartingAssessment] = useState<string | null>(null);
  const [stats, setStats] = useState<AssessmentStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [topTab, setTopTab] = useState<"assessment" | "inspections" | "water-reports">("assessment");

  const processApplications = (data: any[] | null | undefined): AssessmentApplication[] => {
    return (data ?? []).map((app) => {
      const applicant = app.applicant as any;
      const applicantName =
        applicant?.company_name ||
        (applicant?.first_name && applicant?.last_name
          ? `${applicant.first_name} ${applicant.last_name}`
          : "Unknown Applicant");

      // Calculate SLA days remaining
      let slaRemaining: number | null = null;
      if (app.due_date) {
        const dueDate = new Date(app.due_date);
        const now = new Date();
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        slaRemaining = diffDays;
      }

      const deadline90Remaining = calculateDaysRemainingTo90DayDeadline({
        submittedAt: app.submitted_at,
        createdAt: app.created_at,
      });

      return {
        ...app,
        applicant_name: applicantName,
        sla_days_remaining: slaRemaining,
        deadline_90_days_remaining: deadline90Remaining,
      };
    });
  };

  // Fetch applications for assessment.
  // - Applications for Assessment: ONLY assigned to this assessor
  // - All Applications: everything the user is allowed to see (RLS enforced)
  useEffect(() => {
    const fetchAssessmentApplications = async () => {
      try {
        if (authLoading) return;
        if (!user?.id) {
          setAssignedApplications([]);
          setAllApplications([]);
          return;
        }

        setLoading(true);
        setStatsLoading(true);
        setError(null);

        // 1) Assigned queue (worklist)
        const { data: assignedData, error: assignedError } = await supabase
          .from("applications")
          .select(
            `
            *,
            applicant:users!applicant_id(first_name, last_name, company_name)
          `
          )
          .eq("assigned_assessor_id", user.id)
          .in("status", ["pending_assessment", "under_review"])
          .order("created_at", { ascending: sortBy === "earliest" });

        if (assignedError) throw assignedError;

        // 2) All applications (for oversight/search)
        const { data: allData, error: allError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(first_name, last_name, company_name)
          `)
          .neq('status', 'draft')
          .order('created_at', { ascending: sortBy === "earliest" });

        if (allError) throw allError;

        const processedAssigned = processApplications(assignedData);
        const processedAll = processApplications(allData);

        setAssignedApplications(processedAssigned);
        setAllApplications(processedAll);

        // Compute stats from the All Applications dataset to keep the dashboard consistent.
        const counts = processedAll.reduce(
          (acc, app) => {
            acc[app.status] = (acc[app.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        setStats({
          newSubmissions: counts.submitted ?? 0,
          pendingAssessment: counts.pending_assessment ?? 0,
          underAssessment: counts.under_review ?? 0,
          readyForReview: counts.pending_review ?? 0,
        });
      } catch (err) {
        let errorMsg = 'Failed to fetch applications';
        if (err instanceof Error) {
          errorMsg = err.message;
          console.error('❌ Error fetching assessment applications:', err);
        } else if (typeof err === 'object' && err !== null) {
          const maybeMsg = (err as { message?: string; details?: string });
          errorMsg = maybeMsg.message || maybeMsg.details || JSON.stringify(err);
          console.error('❌ Error fetching assessment applications:', JSON.stringify(err, null, 2));
        } else {
          console.error('❌ Error fetching assessment applications:', err);
        }
        setError(errorMsg);
      } finally {
        setLoading(false);
        setStatsLoading(false);
      }
    };

    fetchAssessmentApplications();
  }, [sortBy, user?.id, authLoading]);

  const handleStartAssessment = async (application: AssessmentApplication) => {
    try {
      setStartingAssessment(application.id);
      
      // Update application status to under_review when starting assessment
      const { error } = await supabase
        .from('applications')
        .update({ status: 'under_review' })
        .eq('id', application.id);

      if (error) {
        console.error('Error updating application status:', error);
        alert('Failed to start assessment. Please try again.');
        setStartingAssessment(null);
        return;
      }

      // Update the local state to reflect the status change
      setAssignedApplications((prevApps) =>
        prevApps.map((app) => (app.id === application.id ? { ...app, status: "under_review" as ApplicationStatus } : app))
      );
      setAllApplications((prevApps) =>
        prevApps.map((app) => (app.id === application.id ? { ...app, status: "under_review" as ApplicationStatus } : app))
      );

      // Navigate to the assessment page
      router.push(`/assessment/application/${application.application_number}`);
    } catch (err) {
      console.error('Error starting assessment:', err);
      alert('Failed to start assessment. Please try again.');
      setStartingAssessment(null);
    }
  };

  const filterApplications = (applications: AssessmentApplication[]) => {
    let filtered = applications.filter(app => {
      const matchesSearch = app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.applicant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === "all" || 
                         app.water_source?.toLowerCase().includes(filterType.toLowerCase()) ||
                         app.application_type?.toLowerCase().includes(filterType.toLowerCase());
      
      return matchesSearch && matchesType;
    });

    // Apply date range filter if set
    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter(app => {
        const submissionDate = new Date(app.created_at);
        if (dateRange.from && submissionDate < dateRange.from) return false;
        if (dateRange.to && submissionDate > dateRange.to) return false;
        return true;
      });
    }

    return filtered;
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    // Keep flexible to avoid runtime issues if DB gains new statuses.
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Assessment", variant: "default" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_review: { label: "Ready for Review", variant: "default" },
      pending_verification: { label: "Pending Verification", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      pending_payment: { label: "Pending Payment", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Pending Terms Acceptance", variant: "default" },
      expired: { label: "Expired", variant: "outline" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
    };
    
    const config = statusConfig[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const ApplicationTable = ({ applications, emptyMessage }: { applications: AssessmentApplication[], emptyMessage: string }) => {
    const filteredApps = filterApplications(applications);
    const sortedApps = sortBy90DayDeadlineClosest(filteredApps, (app) => app.deadline_90_days_remaining ?? null);
    
    const getApplicantName = (app: AssessmentApplication) => {
      return app.applicant_name || 'Unknown Applicant';
    };

    const getSubmittedDate = (app: AssessmentApplication) => {
      return app.submitted_at || app.created_at;
    };

    const get90DayBadge = (daysRemaining: number | null | undefined) => {
      if (daysRemaining === null || daysRemaining === undefined) return <span className="text-xs text-muted-foreground">—</span>;
      if (daysRemaining <= 0) {
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800">
            Overdue
          </Badge>
        );
      }
      if (daysRemaining <= 7) {
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800"
          >
            {daysRemaining}d
          </Badge>
        );
      }
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800"
        >
          {daysRemaining}d
        </Badge>
      );
    };

    const getLocationString = (app: AssessmentApplication) => {
      return `${app.district || 'N/A'}, ${app.sector || 'N/A'}`;
    };

    const getWaterSourceLabel = (waterSource: string) => {
      const labels: Record<string, string> = {
        'surface_water': 'Surface Water',
        'groundwater': 'Groundwater',
        'borehole': 'Borehole',
        'river': 'River',
        'lake': 'Lake',
        'spring': 'Spring',
        'swamp': 'Swamp',
        'other': 'Other'
      };
      return labels[waterSource] || waterSource;
    };

    const getWaterPurposeLabel = (purpose: string) => {
      const labels: Record<string, string> = {
        'domestic': 'Domestic Use',
        'industrial': 'Industrial Use',
        'agricultural': 'Agricultural Use',
        'irrigation': 'Irrigation',
        'livestock': 'Livestock',
        'aquaculture': 'Aquaculture',
        'recreation': 'Recreation',
        'electricity_generation': 'Electricity Generation',
        'mining': 'Mining',
        'municipal_supply': 'Municipal Supply',
        'other': 'Other'
      };
      return labels[purpose] || purpose;
    };

    const getAssessmentStatusBadge = (status: string) => {
      const statusConfig = {
        'submitted': { 
          label: 'New Submission', 
          className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800' 
        },
        'under_review': { 
          label: 'Under Assessment', 
          className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800' 
        },
        'pending_assessment': { 
          label: 'Pending Assessment', 
          className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800' 
        },
        'pending_review': { 
          label: 'Ready for Review', 
          className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800' 
        },
        'revision_required': { 
          label: 'Revision Required', 
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
        },
        'approved': { 
          label: 'Approved', 
          className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800' 
        },
        'rejected': { 
          label: 'Rejected', 
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
        }
      };
      
      const config = statusConfig[status as keyof typeof statusConfig] || { 
        label: status, 
        className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800' 
      };
      
      return (
        <Badge 
          variant="outline" 
          className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}
        >
          {config.label}
        </Badge>
      );
    };

    // Get application type badge (New, Modification, Transfer)
    const getAppTypeBadge = (app: AssessmentApplication) => {
      const appType = app.application_type;
      const isModification = appType === 'modification' || (app as any).is_modification === true;
      const isTransfer = appType === 'transfer';
      
      if (isModification) {
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 whitespace-nowrap">Mod</Badge>;
      }
      if (isTransfer) {
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 whitespace-nowrap">Transfer</Badge>;
      }
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 whitespace-nowrap">New</Badge>;
    };

    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold">
            {emptyMessage} ({filteredApps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Date</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">90-day</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium hidden lg:table-cell">Location</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          {applications.length === 0 ? "No applications found" : "No applications match your filters"}
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          {applications.length === 0 ? "Applications will appear here once submitted" : "Try adjusting your search or filter criteria"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedApps.map((app) => (
                    <TableRow 
                      key={app.id} 
                      className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <TableCell className="p-2 sm:p-3">
                        <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(getSubmittedDate(app))}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">{get90DayBadge(app.deadline_90_days_remaining ?? null)}</div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {app.application_number}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {app.project_title || 'No project title'}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {getApplicantName(app)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {getWaterPurposeLabel(app.water_purpose || '')}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        {getAppTypeBadge(app)}
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">
                          {getAssessmentStatusBadge(app.status)}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getLocationString(app)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                        {app.status === 'submitted' ? (
                          <Button 
                            size="sm" 
                            onClick={() => handleStartAssessment(app)}
                            disabled={startingAssessment === app.id}
                            className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                          >
                            {startingAssessment === app.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">
                              {startingAssessment === app.id ? 'Starting...' : 'Assess'}
                            </span>
                            <span className="sm:hidden">Go</span>
                          </Button>
                        ) : (
                          <Link href={`/assessment/application/${app.application_number}`}>
                            <Button 
                              size="sm" 
                              className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                            >
                              <Eye className="h-3 w-3" />
                              <span className="hidden sm:inline">
                                {app.status === 'under_review' ? 'Continue' : 'View'}
                              </span>
                              <span className="sm:hidden">Go</span>
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading applications...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading applications</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-6"
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                Application Assessment Dashboard
              </h1>
              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Assess and review water permit applications for technical compliance and field verification
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/management">
                <Button variant="outline">Management Dashboard</Button>
              </Link>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  New Submissions
                </CardTitle>
                <Clock className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.newSubmissions || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Awaiting initial assessment
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant={stats.newSubmissions === 0 ? "default" : "outline"}
                      className={`text-xs ${
                        stats.newSubmissions === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-blue-100 text-blue-800 hover:bg-blue-100"
                      }`}
                    >
                      {stats.newSubmissions === 0 ? "All caught up" : `${stats.newSubmissions} pending assessment`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Under Assessment
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.underAssessment || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently being assessed
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.underAssessment === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      {stats.underAssessment === 0 ? "No active assessments" : `${stats.underAssessment} in progress`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ready for Review
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.readyForReview || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Assessment complete, awaiting review
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.readyForReview === 0 
                          ? "bg-gray-100 text-gray-800 hover:bg-gray-100" 
                          : "bg-green-100 text-green-800 hover:bg-green-100"
                      }`}
                    >
                      {stats.readyForReview === 0 ? "None ready" : `${stats.readyForReview} ready`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Assessment
                </CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.pendingAssessment || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Waiting for field assessment
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.pendingAssessment === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-red-100 text-red-800 hover:bg-red-100"
                      }`}
                    >
                      {stats.pendingAssessment === 0 ? "No pending assessments" : `${stats.pendingAssessment} pending`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <StaffTopTabs
            value={topTab}
            onValueChange={(v) => setTopTab(v as any)}
            tabs={[
              { value: "assessment", label: "Assessment" },
              { value: "inspections", label: "Inspections" },
              { value: "water-reports", label: "Water Use Reports" },
            ]}
          />

          {topTab === "assessment" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Assessment Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="applications_to_assess" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="applications_to_assess">Applications for Assessment</TabsTrigger>
                    <TabsTrigger value="all_applications">All Applications</TabsTrigger>
                    <TabsTrigger value="map" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Concession Map
                    </TabsTrigger>
                  </TabsList>

                {/* Tab Contents */}
                <TabsContent value="applications_to_assess" className="space-y-4 mt-6">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        placeholder="Search by applicant name, application number, or project title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="surface">Surface Water</SelectItem>
                          <SelectItem value="groundwater">Groundwater</SelectItem>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(value: "earliest" | "latest") => setSortBy(value)}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="earliest">Earliest First</SelectItem>
                          <SelectItem value="latest">Latest First</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <ApplicationTable 
                    applications={assignedApplications}
                    emptyMessage="Applications for Assessment"
                  />
                </TabsContent>

                <TabsContent value="all_applications" className="space-y-4 mt-6">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        placeholder="Search by applicant name, application number, or project title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="surface">Surface Water</SelectItem>
                          <SelectItem value="groundwater">Groundwater</SelectItem>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(value: "earliest" | "latest") => setSortBy(value)}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="earliest">Earliest First</SelectItem>
                          <SelectItem value="latest">Latest First</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <ApplicationTable 
                    applications={allApplications}
                    emptyMessage="All Applications"
                  />
                </TabsContent>

                <TabsContent value="map" className="space-y-4 mt-6">
                  <WaterConcessionMap />
                </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : topTab === "inspections" ? (
            <div className="space-y-6">
              <InspectionsWorkbench />
            </div>
          ) : (
            <WaterUseReportsList />
          )}
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
