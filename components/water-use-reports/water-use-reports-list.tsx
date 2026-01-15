"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  Search,
  FileText,
  Loader2,
  AlertCircle,
  Calendar,
  Building,
  Droplets,
  MapPin,
} from "lucide-react";
import { useAllWaterUseReportsQuery, type WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";

interface WaterUseReportsListProps {
  showCard?: boolean;
}

export function WaterUseReportsList({ showCard = true }: WaterUseReportsListProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [selectedReport, setSelectedReport] = useState<WaterUseReportWithRelations | null>(null);

  const { data: reports = [], isLoading, error } = useAllWaterUseReportsQuery();

  // Get unique years from reports
  const availableYears = useMemo(() => {
    const years = new Set(reports.map(r => r.reporting_year));
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesSearch = 
        report.permit?.permit_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.applicant?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.application?.project_title?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || report.status === statusFilter;
      const matchesTemplate = templateFilter === "all" || report.template === templateFilter;
      const matchesYear = yearFilter === "all" || report.reporting_year.toString() === yearFilter;

      return matchesSearch && matchesStatus && matchesTemplate && matchesYear;
    });
  }, [reports, searchTerm, statusFilter, templateFilter, yearFilter]);

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

  const getStatusBadge = (status: string) => {
    if (status === 'submitted') {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Submitted</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Draft</Badge>;
  };

  const getTemplateBadge = (template: string) => {
    if (template === 'concession') {
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Concession</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Abstraction</Badge>;
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
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
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
            {reports.length === 0 
              ? "No water use reports found" 
              : "No reports match your filters"}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {reports.length === 0 
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
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.reporting_year}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{report.permit?.permit_number || 'N/A'}</span>
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
                  <TableCell>{getStatusBadge(report.status)}</TableCell>
                  <TableCell>{formatDate(report.submitted_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedReport(report)}
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

      {/* View Report Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Water Use Report - {selectedReport?.reporting_year}
            </DialogTitle>
            <DialogDescription>
              {selectedReport?.permit?.permit_number} • {getTemplateBadge(selectedReport?.template || '')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[60vh] pr-4">
            {selectedReport && (
              <div className="space-y-6">
                {/* General Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    General Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Permit Holder:</span>
                      <p className="font-medium">{getApplicantName(selectedReport)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Permit Number:</span>
                      <p className="font-medium font-mono">{selectedReport.permit?.permit_number}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reporting Year:</span>
                      <p className="font-medium">{selectedReport.reporting_year}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Template:</span>
                      <p className="font-medium capitalize">{selectedReport.template}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Water Purpose:</span>
                      <p className="font-medium capitalize">{selectedReport.permit?.purpose?.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <p className="font-medium capitalize">{selectedReport.status}</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                {selectedReport.application && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Location
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Province:</span>
                        <p className="font-medium">{selectedReport.application.province}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">District:</span>
                        <p className="font-medium">{selectedReport.application.district}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sector:</span>
                        <p className="font-medium">{selectedReport.application.sector}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cell:</span>
                        <p className="font-medium">{selectedReport.application.cell}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actual Water Use (Section 3) */}
                {selectedReport.section3 && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Droplets className="h-4 w-4" />
                      Actual Water Use
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Operational Status:</span>
                        <p className="font-medium capitalize">
                          {(selectedReport.section3 as any).operationalStatus?.replace(/_/g, ' ') || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Payment Status:</span>
                        <p className="font-medium capitalize">
                          {(selectedReport.section3 as any).paymentStatus?.replace(/_/g, ' ') || 'N/A'}
                        </p>
                      </div>
                    </div>
                    {(selectedReport.section3 as any).waterUseConflicts && (
                      <div>
                        <span className="text-muted-foreground text-sm">Water Use Conflicts:</span>
                        <p className="text-sm mt-1 p-2 bg-slate-50 rounded">
                          {(selectedReport.section3 as any).waterUseConflicts}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Quarterly Data */}
                {selectedReport.section3_quarterly && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold">Quarterly Water Use Data</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quarter</TableHead>
                          <TableHead>Volume (m³)</TableHead>
                          <TableHead>Avg Daily (m³/day)</TableHead>
                          <TableHead>Method</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {['q1', 'q2', 'q3', 'q4'].map((q, idx) => {
                          const qData = (selectedReport.section3_quarterly as any)[q];
                          return (
                            <TableRow key={q}>
                              <TableCell>Q{idx + 1}</TableCell>
                              <TableCell>{qData?.volume || '-'}</TableCell>
                              <TableCell>{qData?.avgDaily || '-'}</TableCell>
                              <TableCell className="capitalize">{qData?.method || '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Declaration */}
                {selectedReport.section9_declaration && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Declaration
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Declared By:</span>
                        <p className="font-medium">
                          {(selectedReport.section9_declaration as any).declarantName || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Declaration Date:</span>
                        <p className="font-medium">
                          {formatDate((selectedReport.section9_declaration as any).declarationDate)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="space-y-2 pt-4 border-t text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Created:</span>
                    <span>{formatDate(selectedReport.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Updated:</span>
                    <span>{formatDate(selectedReport.updated_at)}</span>
                  </div>
                  {selectedReport.submitted_at && (
                    <div className="flex justify-between">
                      <span>Submitted:</span>
                      <span>{formatDate(selectedReport.submitted_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
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
          View annual water use reports submitted by permit holders
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
