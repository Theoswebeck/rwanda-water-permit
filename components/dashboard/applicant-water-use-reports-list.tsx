"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  Search,
  Loader2,
  Edit,
  Circle,
  Send,
  Clock,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";
import type { ReportStatusFilter } from "./water-use-report-status";

type ReportListStatusFilter = "all" | "draft" | "submitted" | "under_review" | "completed";

interface ApplicantWaterUseReportsListProps {
  reports: WaterUseReportWithRelations[];
  loading?: boolean;
  statusFilter?: ReportStatusFilter;
  onStatusFilterChange?: (status: ReportStatusFilter) => void;
}

export function ApplicantWaterUseReportsList({
  reports,
  loading = false,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
}: ApplicantWaterUseReportsListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [localStatusFilter, setLocalStatusFilter] = useState<ReportListStatusFilter>("all");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);
  useEffect(() => { setLanguage(getPreferredLanguage()); return subscribeToLanguageChanges(setLanguage); }, []);

  const effectiveStatusFilter = controlledStatusFilter ?? localStatusFilter;

  const handleStatusFilterChange = (value: ReportListStatusFilter) => {
    if (controlledStatusFilter === undefined) {
      setLocalStatusFilter(value);
    }
    if (value === "submitted" || value === "under_review") {
      onStatusFilterChange?.("submitted");
    } else {
      onStatusFilterChange?.(value as ReportStatusFilter);
    }
  };

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const permitNumber = report.permit?.permit_number?.toLowerCase() ?? "";
      const yearStr = String(report.reporting_year);
      const projectTitle = report.application?.project_title?.toLowerCase() ?? "";
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        !query ||
        permitNumber.includes(query) ||
        yearStr.includes(query) ||
        projectTitle.includes(query);

      const matchesTemplate =
        templateFilter === "all" || report.template === templateFilter;

      let matchesStatus = true;
      if (effectiveStatusFilter === "submitted") {
        matchesStatus =
          report.status === "submitted" || report.status === "under_review";
      } else if (effectiveStatusFilter !== "all") {
        matchesStatus = report.status === effectiveStatusFilter;
      }

      return matchesSearch && matchesTemplate && matchesStatus;
    });
  }, [reports, searchQuery, templateFilter, effectiveStatusFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, templateFilter, effectiveStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedReports = filteredReports.slice(start, start + pageSize);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft":
        return {
          label: tx("Draft"),
          icon: <Circle className="h-4 w-4" />,
          className:
            "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium",
        };
      case "submitted":
        return {
          label: tx("Submitted"),
          icon: <Send className="h-4 w-4" />,
          className:
            "bg-blue-100 text-blue-700 border-0 hover:bg-blue-100 px-3 py-2 rounded-full font-medium",
        };
      case "under_review":
        return {
          label: tx("Under Review"),
          icon: <Clock className="h-4 w-4" />,
          className:
            "bg-purple-100 text-purple-700 border-0 hover:bg-purple-100 px-3 py-2 rounded-full font-medium",
        };
      case "completed":
        return {
          label: tx("Completed"),
          icon: <CheckCircle2 className="h-4 w-4" />,
          className:
            "bg-green-100 text-green-700 border-0 hover:bg-green-100 px-3 py-2 rounded-full font-medium",
        };
      default:
        return {
          label: status,
          icon: <Circle className="h-4 w-4" />,
          className:
            "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    const config = getStatusConfig(status);
    return (
      <div
        className={`inline-flex items-center gap-2 text-sm ${config.className}`}
      >
        {config.icon}
        {config.label}
      </div>
    );
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTemplateBadge = (template: string) => {
    const isAbstraction = template === "abstraction";
    return (
      <Badge
        variant="outline"
        className={
          isAbstraction
            ? "bg-sky-50 text-sky-700 border-sky-200"
            : "bg-teal-50 text-teal-700 border-teal-200"
        }
      >
        {isAbstraction ? tx("Abstraction") : tx("Concession")}
      </Badge>
    );
  };

  const getEditUrl = (report: WaterUseReportWithRelations) => {
    const params = new URLSearchParams();
    params.set("permit_id", report.permit_id);
    if (report.id) params.set("report_id", report.id);
    return `/dashboard/water-use-report?${params.toString()}`;
  };

  const shouldIgnoreRowNavigation = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-row-click-ignore="true"]'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{tx("Loading reports...")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tx("Search by permit number, year, or project...")}
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Label className="text-sm whitespace-nowrap">{tx("Filter by:")}</Label>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All Templates")}</SelectItem>
              <SelectItem value="abstraction">{tx("Abstraction")}</SelectItem>
              <SelectItem value="concession">{tx("Concession")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={
              effectiveStatusFilter === "submitted"
                ? "submitted"
                : effectiveStatusFilter
            }
            onValueChange={(v) =>
              handleStatusFilterChange(v as ReportListStatusFilter)
            }
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All Status")}</SelectItem>
              <SelectItem value="draft">{tx("Draft")}</SelectItem>
              <SelectItem value="submitted">{tx("Submitted")}</SelectItem>
              <SelectItem value="under_review">{tx("Under Review")}</SelectItem>
              <SelectItem value="completed">{tx("Completed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile Reports List */}
      <div className="space-y-3 md:hidden">
        {pagedReports.length > 0 ? (
          pagedReports.map((report) => (
            <div
              key={report.id}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {report.reporting_year} {tx("Report")}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {report.permit?.permit_number ?? "—"}
                  </p>
                </div>
                <div className="shrink-0">{getStatusBadge(report.status)}</div>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p className="break-words">
                  {report.application?.project_title ?? "—"}
                </p>
                <div className="flex items-center gap-2">
                  {getTemplateBadge(report.template)}
                  {report.submitted_at && (
                    <span className="text-xs text-gray-500">
                      {tx("Submitted")} {formatDate(report.submitted_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                {report.status === "draft" && (
                  <Link href={getEditUrl(report)}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                      title={tx("Edit Report")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
                <Link href={`/water-use-report/${report.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    title="View Report"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-gray-100 rounded-full">
                <ClipboardList className="h-6 w-6 text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">
                  {reports.length === 0
                    ? tx("No water use reports yet")
                    : tx("No matches found")}
                </p>
                <p className="text-sm text-gray-500">
                  {reports.length === 0
                    ? tx('Use the "Water Use Reporting" button above to create your first report.')
                    : tx("Try adjusting your search or filter criteria.")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Reports Table */}
      <div className="hidden rounded-lg border bg-white shadow-sm overflow-hidden md:block">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-gray-50/50">
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[12%]">
                {tx("Year")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[18%]">
                {tx("Permit Number")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[20%]">
                {tx("Project")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[13%]">
                {tx("Template")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[15%]">
                {tx("Status")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[12%]">
                {tx("Submitted")}
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[10%] text-right">
                {tx("Actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedReports.length > 0 ? (
              pagedReports.map((report) => (
                <TableRow
                  key={report.id}
                  className="hover:bg-blue-50/30 transition-colors duration-150 border-b border-gray-100 cursor-pointer"
                  onClick={(event) => {
                    if (shouldIgnoreRowNavigation(event.target)) return;
                    router.push(`/water-use-report/${report.id}`);
                  }}
                >
                  <TableCell className="font-medium text-gray-900 px-4 py-4">
                    <span className="text-sm font-semibold">
                      {report.reporting_year}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md font-medium truncate inline-block max-w-full">
                      {report.permit?.permit_number ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <div
                      className="text-sm truncate"
                      title={report.application?.project_title ?? ""}
                    >
                      {report.application?.project_title ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {getTemplateBadge(report.template)}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {getStatusBadge(report.status)}
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <div className="text-sm">
                      {formatDate(report.submitted_at)}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right px-4 py-4"
                    data-row-click-ignore="true"
                  >
                    <div className="flex justify-end gap-1.5">
                      {report.status === "draft" && (
                        <Link href={getEditUrl(report)}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            title={tx("Edit Report")}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                      <Link href={`/water-use-report/${report.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title={tx("View Report")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-16 text-gray-500"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-100 rounded-full">
                      <ClipboardList className="h-6 w-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">
                        {reports.length === 0
                          ? tx("No water use reports yet")
                          : tx("No matches found")}
                      </p>
                      <p className="text-sm text-gray-500">
                        {reports.length === 0
                          ? tx('Use the "Water Use Reporting" button above to create your first report.')
                          : tx("Try adjusting your search or filter criteria.")}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {tx("Page")} {currentPage} {tx("of")} {totalPages} &bull; {tx("Showing")}{" "}
          {pagedReports.length} {tx("of")} {filteredReports.length}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {tx("Previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {tx("Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
