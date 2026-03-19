"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Search,
  FileText,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  UserPlus,
  Send,
} from "lucide-react";
import { useAllWaterUseReportsQuery, type WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getWaterUseReportBasePath } from "@/lib/water-use-report-workflow";
import {
  getWaterUseReportWorkflowLabel,
  getWaterUseReportWorkflowClassName,
} from "@/types/water-use-report-workflow";

interface WaterUseReportsListProps {
  showCard?: boolean;
  roleContext?: string;
}

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
}

export function WaterUseReportsList({ showCard = true, roleContext }: WaterUseReportsListProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const { data: reports = [], isLoading, error, refetch } = useAllWaterUseReportsQuery();

  const effectiveRole = roleContext || userProfile?.role;
  const basePath = getWaterUseReportBasePath(effectiveRole);

  const canAssign = effectiveRole === "reviewer" || effectiveRole === "admin";

  const [assessors, setAssessors] = useState<StaffMember[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<WaterUseReportWithRelations | null>(null);
  const [selectedAssessorId, setSelectedAssessorId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    if (!canAssign) return;
    const fetchAssessors = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("users")
          .select("id, first_name, last_name, role, email")
          .in("role", ["assessor"])
          .eq("status", "active")
          .order("first_name", { ascending: true });
        if (fetchErr) {
          console.error("❌ Failed to fetch assessors:", fetchErr);
          return;
        }
        setAssessors((data || []) as StaffMember[]);
      } catch (err) {
        console.error("❌ Error fetching assessors:", err);
      }
    };
    fetchAssessors();
  }, [canAssign]);

  const openAssignDialog = useCallback((report: WaterUseReportWithRelations) => {
    setSelectedReport(report);
    setSelectedAssessorId((report as Record<string, unknown>).assigned_assessor_id as string || "");
    setAssignDialogOpen(true);
  }, []);

  const handleAssignToAssessor = useCallback(async () => {
    if (!selectedReport || !selectedAssessorId) return;
    const assessor = assessors.find((a) => a.id === selectedAssessorId);
    if (!assessor) return;

    const currentAssessorId = (selectedReport as Record<string, unknown>).assigned_assessor_id as string | null;
    if (currentAssessorId === selectedAssessorId) {
      alert("Please choose a different assessor.");
      return;
    }

    try {
      setAssignLoading(true);

      const isReassign = !!currentAssessorId;
      const fromStatus = (selectedReport as Record<string, unknown>).workflow_status || selectedReport.status;
      const toStatus = "pending_assessment";

      const resp = await fetch(`/api/water-use-reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_assessor_id: selectedAssessorId,
          workflow_status: toStatus,
          updated_at: new Date().toISOString(),
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || "Failed to assign assessor");
      }

      const comment = isReassign
        ? `Assessor reassigned to ${assessor.first_name} ${assessor.last_name}`
        : `Report assigned to ${assessor.first_name} ${assessor.last_name} for assessment`;

      await supabase.from("water_use_report_workflow_history").insert({
        water_use_report_id: selectedReport.id,
        from_status: fromStatus,
        to_status: toStatus,
        action: isReassign ? "reassigned_assessor" : "assigned_to_assessor",
        comment,
      });

      console.log(`✅ Water use report assigned to ${assessor.first_name} ${assessor.last_name}`);

      setAssignDialogOpen(false);
      setSelectedReport(null);
      setSelectedAssessorId("");
      refetch();
    } catch (err) {
      console.error("❌ Error assigning report:", err);
      alert("Failed to assign report. Please try again.");
    } finally {
      setAssignLoading(false);
    }
  }, [selectedReport, selectedAssessorId, assessors, refetch]);

  const nonDraftReports = useMemo(() => {
    return reports.filter(r => r.status !== 'draft');
  }, [reports]);

  const availableYears = useMemo(() => {
    const years = new Set(nonDraftReports.map(r => r.reporting_year));
    return Array.from(years).sort((a, b) => b - a);
  }, [nonDraftReports]);

  const filteredReports = useMemo(() => {
    return nonDraftReports.filter(report => {
      const matchesSearch = 
        report.permit?.permit_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.application?.project_title?.toLowerCase().includes(searchTerm.toLowerCase());

      const workflowStatus = (report as Record<string, unknown>).workflow_status as string || report.status;
      const matchesStatus = statusFilter === "all" || workflowStatus === statusFilter;
      const matchesTemplate = templateFilter === "all" || report.template === templateFilter;
      const matchesYear = yearFilter === "all" || report.reporting_year.toString() === yearFilter;

      return matchesSearch && matchesStatus && matchesTemplate && matchesYear;
    });
  }, [nonDraftReports, searchTerm, statusFilter, templateFilter, yearFilter]);

  const getApplicantName = (report: WaterUseReportWithRelations) => {
    if (report.applicant?.company_name) {
      return report.applicant.company_name;
    }
    if (report.applicant?.first_name || report.applicant?.last_name) {
      return `${report.applicant.first_name || ''} ${report.applicant.last_name || ''}`.trim();
    }
    return 'Unknown Applicant';
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getWorkflowStatusBadge = (report: WaterUseReportWithRelations) => {
    const workflowStatus = (report as Record<string, unknown>).workflow_status as string || report.status;
    return (
      <Badge
        variant="outline"
        className={`${getWaterUseReportWorkflowClassName(workflowStatus)} text-xs font-medium px-2 py-0.5 rounded-full border`}
      >
        {getWaterUseReportWorkflowLabel(workflowStatus)}
      </Badge>
    );
  };

  const getTemplateBadge = (template: string) => {
    if (template === 'concession') {
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Concession</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Abstraction</Badge>;
  };

  const handleViewReport = (reportId: string) => {
    router.push(`${basePath}/${reportId}`);
  };

  const content = (
    <>
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by permit number, applicant, or project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="pending_assessment">Pending Assessment</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="pending_verification">Pending Verification</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="returned_to_assessment">Returned to Assessment</SelectItem>
              <SelectItem value="returned_to_review">Returned to Review</SelectItem>
              <SelectItem value="returned_to_verification">Returned to Verification</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Templates</SelectItem>
              <SelectItem value="abstraction">Abstraction</SelectItem>
              <SelectItem value="concession">Concession</SelectItem>
            </SelectContent>
          </Select>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-muted-foreground">Loading reports...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>Failed to load reports: {error.message}</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredReports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground font-medium">
            {nonDraftReports.length === 0 
              ? "No submitted water use reports found" 
              : "No reports match your filters"}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {nonDraftReports.length === 0 
              ? "Reports will appear here when applicants submit them" 
              : "Try adjusting your search or filter criteria"}
          </p>
        </div>
      )}

      {/* Reports Table */}
      {!isLoading && !error && filteredReports.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Permit Number</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Workflow Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow 
                  key={report.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleViewReport(report.id)}
                >
                  <TableCell className="font-medium">{report.reporting_year}</TableCell>
                  <TableCell>
                    <Link href={`${basePath}/${report.id}`} className="hover:underline">
                      <span className="font-mono text-sm">{report.permit?.permit_number || 'N/A'}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{getApplicantName(report)}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {report.application?.project_title || 'No project title'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getTemplateBadge(report.template)}</TableCell>
                  <TableCell>{getWorkflowStatusBadge(report)}</TableCell>
                  <TableCell>{formatDate(report.submitted_at)}</TableCell>
                  <TableCell className="text-right">
                    {canAssign && ["submitted", "pending_assessment"].includes(((report as Record<string, unknown>).workflow_status || report.status) as string) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleViewReport(report.id); }}
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); openAssignDialog(report); }}
                            className="cursor-pointer"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {(report as Record<string, unknown>).assigned_assessor_id
                              ? "Reassign Assessor"
                              : "Assign to Assessor"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewReport(report.id);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );

  const assignDialog = (
    <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            {(selectedReport as Record<string, unknown> | null)?.assigned_assessor_id
              ? "Reassign Assessor"
              : "Assign to Assessor"}
          </DialogTitle>
          <DialogDescription>
            {(selectedReport as Record<string, unknown> | null)?.assigned_assessor_id ? (
              <>Reassign water use report for permit{" "}
                <span className="font-medium">{selectedReport?.permit?.permit_number}</span>{" "}
                to another assessor.
              </>
            ) : (
              <>Assign water use report for permit{" "}
                <span className="font-medium">{selectedReport?.permit?.permit_number}</span>{" "}
                to an assessor for review.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Assessor</label>
            <Select value={selectedAssessorId} onValueChange={setSelectedAssessorId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an assessor..." />
              </SelectTrigger>
              <SelectContent>
                {assessors.length === 0 ? (
                  <SelectItem value="no-assessors" disabled>
                    No assessors available
                  </SelectItem>
                ) : (
                  assessors.map((assessor) => (
                    <SelectItem key={assessor.id} value={assessor.id}>
                      {assessor.first_name} {assessor.last_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {selectedAssessorId && assessors.find((a) => a.id === selectedAssessorId) && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {assessors.find((a) => a.id === selectedAssessorId)?.first_name}{" "}
                  {assessors.find((a) => a.id === selectedAssessorId)?.last_name}
                </span>{" "}
                will be notified and the report will appear in their assessment queue.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setAssignDialogOpen(false);
              setSelectedReport(null);
              setSelectedAssessorId("");
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignToAssessor}
            disabled={
              !selectedAssessorId ||
              assignLoading ||
              selectedAssessorId === "no-assessors" ||
              ((selectedReport as Record<string, unknown> | null)?.assigned_assessor_id
                ? selectedAssessorId === (selectedReport as Record<string, unknown>).assigned_assessor_id
                : false)
            }
            className="gap-2"
          >
            {assignLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {(selectedReport as Record<string, unknown> | null)?.assigned_assessor_id ? "Reassign" : "Assign"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!showCard) {
    return (
      <>
        {content}
        {assignDialog}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Water Use Reports
          </CardTitle>
          <CardDescription>
            View and manage annual water use reports submitted by permit holders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
      {assignDialog}
    </>
  );
}
