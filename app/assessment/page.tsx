"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Eye, Search, XCircle, MapPin, FileCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { sortBySubmissionDateDescending, getEffectiveSubmissionDate } from "@/lib/application-sorting";
import { calculateDaysRemainingTo90DayDeadline } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { StaffSidebar, staffNavItems } from "@/components/shared/staff-sidebar";
import { useTabParam } from "@/hooks/use-tab-param";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { PermitRegistryList } from "@/components/permit-registry/permit-registry-list";
import { StatusFilterChips, type StatusChipDef } from "@/components/shared/status-filter-chips";
import { WorkflowDatesCell } from "@/components/shared/workflow-dates-cell";
import { batchFetchWorkflowDates, type WorkflowDates } from "@/lib/workflow-dates";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
import { ApprovedApplicationActions } from "@/components/shared/approved-application-actions";
import { fetchLinkedPermitsForApprovedApps, type LinkedPermitLite } from "@/lib/linked-permits";

interface AssessmentApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
  deadline_90_days_remaining?: number;
}

// ─── Chip definitions per RWB spec ────────────────────────────────────────────
const ASSESSOR_CHIPS: StatusChipDef[] = [
  { id: "pending_assessment", label: "Pending Assessment", statuses: ["pending_assessment"], priority: "primary" },
  { id: "under_assessment", label: "Under Assessment", statuses: ["under_review"], priority: "primary" },
  { id: "returned_to_applicant", label: "Returned to Applicant", statuses: ["revision_required"], priority: "primary" },
  { id: "pending_review", label: "Pending Review", statuses: ["pending_review"], priority: "secondary" },
  { id: "re_assessment", label: "Re-Assessment", statuses: ["returned_to_assessment"], priority: "primary" },
  { id: "pending_verification", label: "Pending Verification", statuses: ["pending_verification"], priority: "downstream" },
  { id: "pending_approval", label: "Pending Approval", statuses: ["pending_final_approval"], priority: "downstream" },
  { id: "awaiting_terms", label: "Awaiting Terms", statuses: ["approved_pending_permit"], priority: "downstream" },
  { id: "issued", label: "Approved", statuses: ["approved"], priority: "downstream" },
  { id: "rejected", label: "Rejected", statuses: ["rejected"], priority: "downstream" },
  { id: "terminated", label: "Terminated", statuses: ["terminated"], priority: "downstream" },
  { id: "all_applications", label: "All Applications", statuses: [], priority: "primary" },
];

function AssessmentDashboardContent() {
  const { user, loading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [allApplications, setAllApplications] = useState<AssessmentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useTabParam<"assessment" | "inspections" | "water-reports" | "permit-registry">(
    "assessment",
    ["assessment", "inspections", "water-reports", "permit-registry"]
  );
  const [activeChipId, setActiveChipId] = useState("pending_assessment");
  // "my_assignments" = applications assigned to me (actionable queue).
  // "all_applications" = every application in the pipeline (read-only tracking:
  // progress feedback for applicants + access to approved permits/contracts for archiving).
  const [activeInnerTab, setActiveInnerTab] = useState<"my_assignments" | "all_applications" | "map">("my_assignments");
  const [workflowDatesMap, setWorkflowDatesMap] = useState<Record<string, WorkflowDates>>({});
  const [permitByApplicationId, setPermitByApplicationId] = useState<Record<string, LinkedPermitLite>>({});

  const processApplications = (data: any[] | null | undefined): AssessmentApplication[] => {
    return (data ?? [])
      .filter((a) => !(a?.application_number || '').toUpperCase().startsWith('REG-'))
      .map((app) => {
      const applicant = app.applicant as any;
      const applicantName =
        applicant?.company_name ||
        (applicant?.first_name && applicant?.last_name
          ? `${applicant.first_name} ${applicant.last_name}`
          : "Unknown Applicant");

      let slaRemaining: number | null = null;
      if (app.due_date) {
        const dueDate = new Date(app.due_date);
        const now = new Date();
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        slaRemaining = diffDays;
      }

      const deadline90Remaining = calculateDaysRemainingTo90DayDeadline({
        completenessConfirmedAt: app.completeness_confirmed_at,
      });

      return {
        ...app,
        applicant_name: applicantName,
        sla_days_remaining: slaRemaining,
        deadline_90_days_remaining: deadline90Remaining,
      };
    });
  };

  // Fetch all non-draft applications
  useEffect(() => {
    const fetchAssessmentApplications = async () => {
      try {
        if (authLoading) return;
        if (!user?.id) {
          setAllApplications([]);
          return;
        }

        setLoading(true);
        setError(null);

        // Fetch ALL pipeline applications (not just the ones assigned to this
        // assessor). Assessors must be able to see and track the status of every
        // application (read-only outside their stage) — the "My Assignments" /
        // "All Applications" tabs below scope the view client-side, matching the
        // review/verification dashboards which already load the full pipeline.
        const { data: allData, error: allError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(first_name, last_name, company_name)
          `)
          .neq('status', 'draft')
          .neq('status', 'pending_payment')
          .not('application_number', 'like', 'REG-%')
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (allError) throw allError;

        const processedAll = processApplications(allData);
        setAllApplications(processedAll);

        // Fetch linked permits for approved applications (for Actions: View
        // Permit Page / View Terms PDF). Best-effort: a failure here must not
        // blank the whole assessment dashboard.
        try {
          setPermitByApplicationId(await fetchLinkedPermitsForApprovedApps(processedAll as any));
        } catch (e) {
          console.warn("⚠️ Failed to load linked permits for approved apps:", e);
          setPermitByApplicationId({});
        }

        // Batch-fetch workflow dates (Applied = latest (re)submission date)
        const submittedAtMap: Record<string, string | null> = {};
        for (const app of processedAll) {
          submittedAtMap[app.id] = getEffectiveSubmissionDate(app) || null;
        }
        const dates = await batchFetchWorkflowDates(
          processedAll.map((a) => a.id),
          submittedAtMap
        );
        setWorkflowDatesMap(dates);
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
      }
    };

    fetchAssessmentApplications();
  }, [user?.id, authLoading]);

  // Derive active statuses from chip selection
  const activeStatuses = useMemo(() => {
    const chip = ASSESSOR_CHIPS.find((c) => c.id === activeChipId);
    return chip?.statuses ?? [];
  }, [activeChipId]);

  // Scope the loaded pipeline to the active tab:
  // "My Assignments" (default) = needs-my-action queue; everything else = read-only tracking.
  const scopedApplications = useMemo(() => {
    if (activeInnerTab !== "my_assignments") return allApplications;
    return allApplications.filter((app) => !!user?.id && app.assigned_assessor_id === user.id);
  }, [allApplications, activeInnerTab, user?.id]);

  const filterApplications = useCallback(
    (applications: AssessmentApplication[]) => {
      return applications.filter((app) => {
        const matchesSearch =
          app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.applicant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
      
        const matchesType =
          filterType === "all" ||
                         app.water_source?.toLowerCase().includes(filterType.toLowerCase()) ||
                         app.application_type?.toLowerCase().includes(filterType.toLowerCase());
      
        const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(app.status);
      
      return matchesSearch && matchesType && matchesStatus;
      });
    },
    [searchTerm, filterType, activeStatuses]
  );

  // ─── Status badge helper ──────────────────────────────────────────────────
  const getAssessmentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      submitted: { label: "New Submission", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800" },
      under_review: { label: "Under Assessment", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800" },
      pending_assessment: { label: "Pending Assessment", className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800" },
      pending_review: { label: "Ready for Review", className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800" },
      pending_verification: { label: "Pending Verification", className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800" },
      pending_final_approval: { label: "Pending Approval", className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800" },
      revision_required: { label: "Revision Required", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800" },
      approved: { label: "Approved", className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800" },
      approved_pending_permit: { label: "Pending Terms", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800" },
      rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800" },
      terminated: { label: "Terminated (exempted use)", className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700" },
      closed_incomplete: { label: "Closed due to incompletion", className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700" },
      returned_to_assessment: { label: "🔄 Returned for Corrections", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
      returned_to_review: { label: "🔄 Returned to Reviewer", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
      returned_to_verification: { label: "🔄 Returned to Verifier", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800" };
    return (
      <Badge variant="outline" className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}>
        {config.label}
      </Badge>
    );
    };

    const getAppTypeBadge = (app: AssessmentApplication) => {
    const workflowKind = getApplicationWorkflowKind(app as any);
    if (workflowKind === "renewal") return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0 whitespace-nowrap">Renewal</Badge>;
    if (workflowKind === "modification") return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 whitespace-nowrap">Mod</Badge>;
    if (workflowKind === "transfer") return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 whitespace-nowrap">Transfer</Badge>;
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 whitespace-nowrap">New</Badge>;
    };

  const getApplicationWaterActivityLabel = (app: AssessmentApplication) => {
    const activities = Array.isArray((app as any).intended_activities)
      ? ((app as any).intended_activities as unknown[])
          .filter((activity): activity is string => typeof activity === "string" && activity.trim().length > 0)
      : [];

    if (activities.length > 0) {
      return getActivityLabel(activities[0]);
    }

    if (typeof app.water_purpose === "string" && app.water_purpose.trim().length > 0) {
      return getActivityLabel(app.water_purpose);
    }

    return "N/A";
  };

  // ─── Application Table ──────────────────────────────────────────────────────
  const ApplicationTable = ({ applications, emptyMessage }: { applications: AssessmentApplication[]; emptyMessage: string }) => {
    const filteredApps = filterApplications(applications);
    const sortedApps = sortBySubmissionDateDescending(filteredApps, (app) => getEffectiveSubmissionDate(app));

    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800 py-3">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold text-base">
            {emptyMessage} ({filteredApps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-hidden">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Dates</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Status</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
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
                        <WorkflowDatesCell dates={workflowDatesMap[app.id]} />
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{app.application_number}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          Activity Type: {getApplicationWaterActivityLabel(app)}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {app.applicant_name || "Unknown Applicant"}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">{getAppTypeBadge(app)}</TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">{getAssessmentStatusBadge(app.status)}</div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                        <div className="flex justify-end">
                          {app.status === "approved" ? (
                            <ApprovedApplicationActions
                              app={app}
                              permit={permitByApplicationId[app.id]}
                              viewApplicationHref={`/assessment/application/${app.application_number}`}
                              onInternalNotesUpdated={(appId, internalNotes) =>
                                setAllApplications((prev) =>
                                  prev.map((a) => (a.id === appId ? ({ ...a, internal_notes: internalNotes } as any) : a))
                                )
                              }
                            />
                          ) : (
                            <Link href={`/assessment/application/${app.application_number}`}>
                              <Button
                                size="sm"
                                className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                              >
                                <Eye className="h-3 w-3" />
                                <span className="hidden sm:inline">
                                  {!!user?.id && app.assigned_assessor_id === user.id && (app.status === "under_review" || app.status === "pending_assessment" || app.status === "returned_to_assessment") ? "Continue" : "View"}
                                </span>
                                <span className="sm:hidden">Go</span>
                              </Button>
                            </Link>
                          )}
                        </div>
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

  // ─── Loading / Error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout wide>
        <div className="mx-auto w-full px-4 py-6">
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
      <DashboardLayout wide>
        <div className="mx-auto w-full px-4 py-6">
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

  // ─── Active chip label for table title ──────────────────────────────────────
  const activeChipLabel = ASSESSOR_CHIPS.find((c) => c.id === activeChipId)?.label ?? "All Applications";

  return (
    <DashboardLayout wide>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-auto w-full px-4 py-6"
      >
          <StaffSidebar
            value={topTab}
            onValueChange={(v) => setTopTab(v as any)}
            items={staffNavItems("assessment")}
          >

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">
                {topTab === "assessment" ? "Application Assessment Dashboard"
                  : topTab === "inspections" ? "Inspections"
                  : topTab === "water-reports" ? "Water Use Reports"
                  : "Permit Registry"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {topTab === "assessment" ? "Assess and review water permit applications for technical compliance and field verification"
                  : topTab === "inspections" ? "Manage and track field inspections"
                  : topTab === "water-reports" ? "Monitor and review water usage reports"
                  : "View and manage issued permits"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/management">
                <Button variant="outline">Management Dashboard</Button>
              </Link>
            </div>
          </div>

          {topTab === "assessment" ? (
            <>
            <StatusFilterChips
              chips={ASSESSOR_CHIPS}
              activeChipId={activeChipId}
              onChipChange={setActiveChipId}
              applications={scopedApplications}
            />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Assessment Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeInnerTab} onValueChange={(v) => setActiveInnerTab(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="my_assignments">My Assignments</TabsTrigger>
                    <TabsTrigger value="all_applications">All Applications</TabsTrigger>
                    <TabsTrigger value="map" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Consolidated Map
                    </TabsTrigger>
                  </TabsList>

                  {/* Shared panel for both scopes — "My Assignments" shows the
                      needs-my-action queue, "All Applications" shows the whole
                      pipeline read-only for status tracking and archiving. */}
                  {(["my_assignments", "all_applications"] as const).map((scopeTab) => (
                    <TabsContent key={scopeTab} value={scopeTab} className="space-y-4 mt-4">
                      {scopeTab === "all_applications" && (
                        <p className="text-sm text-muted-foreground">
                          Read-only overview of every application in the pipeline. Applications outside your
                          stage open in view-only mode; use it to track progress and access approved
                          permits, contracts and documents.
                        </p>
                      )}
                  {/* Search and Filter Controls */}
                    <div className="flex flex-col md:flex-row gap-4 p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
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
                    </div>
                  </div>
                    <ApplicationTable applications={scopedApplications} emptyMessage={activeChipLabel} />
                </TabsContent>
                  ))}

                  <TabsContent value="map" className="space-y-4 mt-4">
                  <WaterConcessionMap />
                </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
            </>
          ) : topTab === "inspections" ? (
            <div className="space-y-6">
              <InspectionsWorkbench roleContext="assessor" />
            </div>
          ) : topTab === "water-reports" ? (
            <WaterUseReportsList roleContext="assessor" />
          ) : (
            <PermitRegistryList />
          )}
        </StaffSidebar>
      </motion.div>
    </DashboardLayout>
  );
}

export default function AssessmentDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <AssessmentDashboardContent />
    </Suspense>
  );
}
