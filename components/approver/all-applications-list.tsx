"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Eye, 
  Search, 
  Filter,
  FileText,
  Loader2,
  AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus } from "@/types/database";
import { sortBySubmissionDateDescending } from "@/lib/application-sorting";
import { calculateDaysRemainingTo90DayDeadline } from "@/lib/utils";
import { WorkflowDatesCell } from "@/components/shared/workflow-dates-cell";
import { batchFetchWorkflowDates, type WorkflowDates } from "@/lib/workflow-dates";

interface ApplicationWithApplicant extends Application {
  applicant?: {
    first_name?: string;
    last_name?: string;
    company_name?: string;
    account_type?: string;
  };
  sla_days_remaining?: number | null;
  deadline_90_days_remaining?: number | null;
}

interface AllApplicationsListProps {
  externalStatusFilter?: string[];
  title?: string;
}

export function AllApplicationsList({ externalStatusFilter = [], title = "All Applications" }: AllApplicationsListProps) {
  const [applications, setApplications] = useState<ApplicationWithApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  
  const [workflowDatesMap, setWorkflowDatesMap] = useState<Record<string, WorkflowDates>>({});

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          applicant:users!applicant_id(first_name, last_name, company_name, account_type)
        `)
        .neq('status', 'draft')
        // Always show latest submissions first (fallback to created_at when submitted_at is null).
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process applications with calculated fields
      const rows = (data ?? []) as ApplicationWithApplicant[];
      const processedApplications: ApplicationWithApplicant[] = rows.map((app) => {
        // Calculate SLA days remaining
        let slaRemaining: number | null = null;
        if (app.due_date) {
          const dueDate = new Date(app.due_date);
          const now = new Date();
          const diffTime = dueDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          slaRemaining = diffDays;
        }

        // 90-day countdown starts from when completeness was confirmed (not submission)
        const deadline90Remaining = calculateDaysRemainingTo90DayDeadline({
          completenessConfirmedAt: app.completeness_confirmed_at,
        });

        return {
          ...app,
          sla_days_remaining: slaRemaining,
          deadline_90_days_remaining: deadline90Remaining,
        };
      });

      setApplications(processedApplications);

      // Batch-fetch workflow dates
      const submittedAtMap: Record<string, string | null> = {};
      for (const app of processedApplications) {
        submittedAtMap[app.id] = app.submitted_at || app.created_at;
      }
      const dates = await batchFetchWorkflowDates(
        processedApplications.map((a) => a.id),
        submittedAtMap
      );
      setWorkflowDatesMap(dates);
    } catch (err) {
      console.error('Error fetching applications:', err);
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    // Keep flexible to avoid runtime issues if DB gains new statuses.
    const statusColors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 border-gray-200",
      submitted: "bg-blue-100 text-blue-700 border-blue-200",
      under_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
      pending_inspection: "bg-orange-100 text-orange-700 border-orange-200",
      pending_assessment: "bg-purple-100 text-purple-700 border-purple-200",
      pending_review: "bg-amber-100 text-amber-700 border-amber-200",
      pending_verification: "bg-indigo-100 text-indigo-700 border-indigo-200",
      pending_final_approval: "bg-purple-100 text-purple-700 border-purple-200",
      approved_pending_permit: "bg-green-100 text-green-700 border-green-200",
      approved: "bg-green-100 text-green-700 border-green-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
      revision_required: "bg-amber-100 text-amber-700 border-amber-200",
      cancelled: "bg-gray-100 text-gray-700 border-gray-200"
    };
    
    return <Badge variant="outline" className={statusColors[status]}>{status.replace('_', ' ').toUpperCase()}</Badge>;
  };

  const getSLABadge = (daysRemaining: number | null | undefined) => {
    if (daysRemaining === null || daysRemaining === undefined) return null;
    
    if (daysRemaining <= 0) {
      return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>;
    } else if (daysRemaining <= 2) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">Due Soon</Badge>;
    } else {
      return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">{daysRemaining} days</Badge>;
    }
  };

  // Get application type badge (New, Modification, Transfer, Renewal)
  const getAppTypeBadge = (app: ApplicationWithApplicant) => {
    const appType = app.application_type as string;
    const isModification = appType === 'modification' || (app as any).is_modification === true;
    let isTransfer = appType === 'transfer';
    if (!isTransfer && typeof app.internal_notes === 'string') {
      try {
        const notes = JSON.parse(app.internal_notes);
        if (notes?.isTransfer === true) isTransfer = true;
      } catch { /* ignore */ }
    }
    const isRenewal = appType === 'renewal' || (app as any).is_renewal === true;
    
    if (isRenewal) {
      return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Renewal</Badge>;
    }
    if (isModification) {
      return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Mod</Badge>;
    }
    if (isTransfer) {
      return <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">Transfer</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">New</Badge>;
  };

  const getApplicantName = (app: ApplicationWithApplicant) => {
    if (app.applicant?.account_type === 'individual') {
      return `${app.applicant.first_name} ${app.applicant.last_name}`;
    } else {
      return app.applicant?.company_name || 'Unknown Applicant';
    }
  };

  const getApplicationWaterActivityLabel = (app: ApplicationWithApplicant) => {
    const activities = Array.isArray((app as any).intended_activities)
      ? ((app as any).intended_activities as unknown[])
          .filter((activity): activity is string => typeof activity === "string" && activity.trim().length > 0)
      : [];

    if (activities.length > 0) {
      return activities[0]
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    if (typeof app.water_purpose === "string" && app.water_purpose.trim().length > 0) {
      return app.water_purpose
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    return "N/A";
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = 
      app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.project_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getApplicantName(app).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || app.status === filterStatus;
    const matchesType = filterType === "all" || app.application_type === filterType;
    
    // Apply external status filter from clickable stats cards
    const matchesExternalFilter = externalStatusFilter.length === 0 || externalStatusFilter.includes(app.status);
    
    return matchesSearch && matchesStatus && matchesType && matchesExternalFilter;
  });
  const sortedApplications = sortBySubmissionDateDescending(filteredApplications, (app) => app.submitted_at || app.created_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Error Loading Applications</h3>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchApplications} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground">
            {title === "All Applications"
              ? "Complete list of all water permit applications in the system"
              : "Filtered applications based on the selected queue"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter applications by status, type, or search terms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="pending_inspection">Pending Inspection</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="revision_required">Revision Required</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="agricultural">Agricultural</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="municipal">Municipal</SelectItem>
                  <SelectItem value="mining_water_use">Mining Water Use</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm("");
                  setFilterStatus("all");
                  setFilterType("all");
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle>{title} ({filteredApplications.length})</CardTitle>
          <CardDescription>
            Click on any application to view details and add comments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dates</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="whitespace-nowrap">
                      <WorkflowDatesCell dates={workflowDatesMap[application.id]} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{application.application_number}</div>
                        <div className="text-sm text-muted-foreground">
                          Activity Type: {getApplicationWaterActivityLabel(application)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{getApplicantName(application)}</div>
                    </TableCell>
                    <TableCell>
                      {getAppTypeBadge(application)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(application.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          asChild
                          size="sm"
                          className="gap-2 bg-gray-900 hover:bg-gray-800 text-white"
                        >
                          <Link href={`/approver/application/${application.application_number}`}>
                            <Eye className="h-4 w-4" />
                            View Application
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {sortedApplications.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No applications found matching your criteria</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
} 