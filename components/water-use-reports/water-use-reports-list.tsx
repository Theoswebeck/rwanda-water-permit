"use client";

import { useState, useMemo } from "react";
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
  Eye,
  Search,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAllWaterUseReportsQuery, type WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";
import { useAuth } from "@/contexts/AuthContext";
import { getWaterUseReportBasePath } from "@/lib/water-use-report-workflow";
import {
  getWaterUseReportWorkflowLabel,
  getWaterUseReportWorkflowClassName,
} from "@/types/water-use-report-workflow";

interface WaterUseReportsListProps {
  showCard?: boolean;
  roleContext?: string;
}

export function WaterUseReportsList({ showCard = true, roleContext }: WaterUseReportsListProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const { data: reports = [], isLoading, error } = useAllWaterUseReportsQuery();

  const effectiveRole = roleContext || userProfile?.role;
  const basePath = getWaterUseReportBasePath(effectiveRole);

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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );

  if (!showCard) {
    return content;
  }

  return (
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
  );
}
