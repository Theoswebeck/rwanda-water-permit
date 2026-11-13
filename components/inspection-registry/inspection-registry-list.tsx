"use client";

import { Fragment, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Search,
  ClipboardCheck,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Ban,
  CircleDollarSign,
  PauseCircle,
  FileText,
  ExternalLink,
  Database,
  Pencil,
  Paperclip,
  Upload,
  Trash2,
} from "lucide-react";
import {
  inspectionRegistryKeys,
  useInspectionRegistryQuery,
  type InspectionRegistryEntry,
} from "@/hooks/useInspectionRegistryQuery";
import { useUpdateInspectionRegistry } from "@/hooks/useUpdateInspectionRegistry";
import { EditInspectionRegistrySheet } from "@/components/inspection-registry/edit-inspection-registry-sheet";

type SortField =
  | "row_index"
  | "inspection_number"
  | "permit_holder"
  | "permit_number"
  | "compliance_status"
  | "action";
type SortDir = "asc" | "desc";

/** Panel filter presets: each stat panel maps to one combination of API filters. */
type PanelFilter = {
  compliance: string;
  action: string;
  observations: string;
};

const ALL_PANEL: PanelFilter = { compliance: "all", action: "all", observations: "all" };

function complianceBadge(status: string | null | undefined) {
  const raw = (status || "").trim();
  if (!raw) return <span className="text-xs text-muted-foreground">--</span>;
  const isComplying = raw.toLowerCase() === "complying";
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
        isComplying
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
          : "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
      }`}
    >
      {isComplying ? "Complying" : "Not complying"}
    </Badge>
  );
}

function actionBadge(action: string | null | undefined) {
  const raw = (action || "").trim();
  if (!raw) return <span className="text-xs text-muted-foreground">--</span>;
  const lower = raw.toLowerCase();
  const tone = lower.includes("no action")
    ? "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700"
    : lower.includes("cancel")
      ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800"
      : lower.includes("warning") || lower.includes("reminder")
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800"
        : "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800";
  return (
    <Badge
      variant="outline"
      title={raw}
      className={`max-w-full overflow-hidden text-xs font-medium px-2 py-0.5 rounded-full ${tone}`}
    >
      <span className="block min-w-0 max-w-full truncate">{raw}</span>
    </Badge>
  );
}

interface InspectionRegistryListProps {
  /**
   * Shows the pencil action (data-entry corrections + documents) on every
   * register row, imported or system. The PATCH endpoint is role-gated
   * server-side, so only pass this on pages that role surface can reach.
   */
  canEdit?: boolean;
}

export function InspectionRegistryList({ canEdit = false }: InspectionRegistryListProps) {
  const PAGE_SIZE = 50;
  const [searchTerm, setSearchTerm] = useState("");
  const [panel, setPanel] = useState<PanelFilter>(ALL_PANEL);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("row_index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("");
  const [jumpError, setJumpError] = useState(false);
  const [editEntry, setEditEntry] = useState<InspectionRegistryEntry | null>(null);
  const [rowActionResult, setRowActionResult] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const [uploadingDocFor, setUploadingDocFor] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const queryClient = useQueryClient();
  // Refresh every cached filter/page view, not just the one on screen.
  const refreshRegistry = () => queryClient.invalidateQueries({ queryKey: inspectionRegistryKeys.all });

  const updateMutation = useUpdateInspectionRegistry();

  const offset = (currentPage - 1) * PAGE_SIZE;
  const { data, isLoading, error, refetch } = useInspectionRegistryQuery({
    q: searchTerm,
    compliance: panel.compliance,
    action: panel.action,
    observations: panel.observations,
    source: sourceFilter,
    sort_by: sortField,
    sort_dir: sortDir,
    limit: PAGE_SIZE,
    offset,
  });
  const entries = data?.items || [];
  const total = data?.total || 0;
  const summary = data?.summary;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
    setJumpPage("");
    setJumpError(false);
  }, [searchTerm, panel, sourceFilter, sortField, sortDir]);

  useEffect(() => {
    if (total > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
      setJumpError(false);
    }
  }, [currentPage, totalPages, total]);

  const submitJump = useCallback(() => {
    if (jumpPage.length === 0) return;
    const page = parseInt(jumpPage, 10);
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setJumpPage("");
      setJumpError(false);
    } else {
      setJumpError(true);
    }
  }, [jumpPage, totalPages]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />
    );
  };

  const panels = useMemo(
    () => [
      {
        label: "Total Inspections",
        value: summary?.total ?? 0,
        icon: FileText,
        color: "text-slate-700 dark:text-slate-300",
        bg: "bg-slate-50 dark:bg-slate-900",
        border: "border-slate-200 dark:border-slate-800",
        filter: ALL_PANEL,
      },
      {
        label: "Complying",
        value: summary?.complying ?? 0,
        icon: ShieldCheck,
        color: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
        border: "border-emerald-200 dark:border-emerald-800",
        filter: { ...ALL_PANEL, compliance: "complying" },
      },
      {
        label: "Not Complying",
        value: summary?.notComplying ?? 0,
        icon: ShieldAlert,
        color: "text-red-600 dark:text-red-400",
        bg: "bg-red-50/70 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        filter: { ...ALL_PANEL, compliance: "not_complying" },
      },
      {
        label: "Warnings/Reminders",
        value: summary?.warnings ?? 0,
        icon: Bell,
        color: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50/70 dark:bg-amber-950/30",
        border: "border-amber-200 dark:border-amber-800",
        filter: { ...ALL_PANEL, action: "warning" },
      },
      {
        label: "Cancellations",
        value: summary?.cancellations ?? 0,
        icon: Ban,
        color: "text-orange-700 dark:text-orange-400",
        bg: "bg-orange-50/70 dark:bg-orange-950/30",
        border: "border-orange-200 dark:border-orange-800",
        filter: { ...ALL_PANEL, action: "cancellation" },
      },
      {
        label: "Fined",
        value: summary?.fined ?? 0,
        icon: CircleDollarSign,
        color: "text-rose-700 dark:text-rose-400",
        bg: "bg-rose-50/70 dark:bg-rose-950/30",
        border: "border-rose-200 dark:border-rose-800",
        filter: { ...ALL_PANEL, action: "fined" },
      },
      {
        label: "Suspended",
        value: summary?.suspended ?? 0,
        icon: PauseCircle,
        color: "text-violet-700 dark:text-violet-400",
        bg: "bg-violet-50/70 dark:bg-violet-950/30",
        border: "border-violet-200 dark:border-violet-800",
        filter: { ...ALL_PANEL, action: "suspension" },
      },
    ],
    [summary]
  );

  const isPanelActive = (f: PanelFilter) =>
    panel.compliance === f.compliance &&
    panel.action === f.action &&
    panel.observations === f.observations;

  const activeFilterCount = [
    panel.compliance !== "all",
    panel.action !== "all",
    panel.observations !== "all",
    sourceFilter !== "all",
    searchTerm.trim() !== "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm("");
    setPanel(ALL_PANEL);
    setSourceFilter("all");
  };

  const permitViewHref = (permitNumber: string) =>
    `/permit/view/${encodeURIComponent(permitNumber)}`;

  const handleEditSave = async (
    id: string,
    expectedUpdatedAt: string,
    updates: Record<string, string | null>
  ) => {
    setRowActionResult(null);
    try {
      await updateMutation.mutateAsync({ id, expectedUpdatedAt, data: updates });
      setRowActionResult({ kind: "success", message: "Inspection record updated successfully." });
      setEditEntry(null);
    } catch (err) {
      setRowActionResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to update inspection record",
      });
    }
  };

  const handleDocUpload = async (entryId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setUploadingDocFor(entryId);
    setDocResult(null);

    let successCount = 0;
    let lastError: string | null = null;
    for (const file of files) {
      try {
        if (file.size > MAX_DOC_BYTES) throw new Error("File must be 9 MB or smaller.");
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/staff/inspection-registry/${entryId}/documents`, {
          method: "POST",
          body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.error || "Document upload failed");
        successCount++;
      } catch (err) {
        lastError = `${file.name}: ${err instanceof Error ? err.message : "Unknown upload error"}`;
      }
    }

    setDocResult(
      lastError
        ? {
            kind: "error",
            message: successCount
              ? `${successCount} of ${files.length} file(s) uploaded. Last error: ${lastError}`
              : lastError,
          }
        : {
            kind: "success",
            message: `${successCount} document${successCount > 1 ? "s" : ""} uploaded successfully.`,
          }
    );
    await refreshRegistry();
    setUploadingDocFor(null);
    input.value = "";
  };

  const handleDeleteDoc = async (entryId: string, docId: string, docName: string) => {
    if (!window.confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    setDocResult(null);
    try {
      const res = await fetch(`/api/staff/inspection-registry/${entryId}/documents/${docId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Delete failed");
      setDocResult({ kind: "success", message: "Document deleted." });
      refreshRegistry();
    } catch (err) {
      setDocResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to delete document",
      });
    }
  };

  const columnCount = canEdit ? 10 : 9;

  const content = (
    <div className="space-y-6">
      {/* Edit Result Banner */}
      {rowActionResult && (
        <div
          className={`p-4 rounded-xl border text-sm ${
            rowActionResult.kind === "error"
              ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
              : "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p>{rowActionResult.message}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowActionResult(null)}
              className="h-6 w-6 p-0 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      )}
      {/* Summary Stats */}
      {!isLoading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {panels.map((stat) => {
            const isSelected = isPanelActive(stat.filter);
            return (
              <button
                key={stat.label}
                type="button"
                onClick={() => setPanel(stat.filter)}
                className={`${stat.bg} ${stat.border} border rounded-xl p-4 transition-all duration-200 text-left w-full ${
                  isSelected
                    ? "ring-2 ring-offset-1 ring-blue-600 shadow-md scale-[1.01]"
                    : "hover:shadow-sm cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`h-4 w-4 ${stat.color} opacity-70`} />
                  <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold ${stat.color} tracking-tight`}>{stat.value}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search by permit holder, permit number, inspection number, district, activity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg h-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select
              value={panel.compliance}
              onValueChange={(v) => setPanel({ ...ALL_PANEL, compliance: v })}
            >
              <SelectTrigger className="w-[170px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Compliance" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Compliance</SelectItem>
                <SelectItem value="complying">Complying</SelectItem>
                <SelectItem value="not_complying">Not complying</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={panel.action}
              onValueChange={(v) => setPanel({ ...ALL_PANEL, action: v })}
            >
              <SelectTrigger className="w-[180px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="no_action">No action required</SelectItem>
                <SelectItem value="warning">Warning/Reminder</SelectItem>
                <SelectItem value="cancellation">Cancellation</SelectItem>
                <SelectItem value="fined">Fined</SelectItem>
                <SelectItem value="suspension">Suspension</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[150px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="registry">Register (imported)</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-10 px-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear ({activeFilterCount})
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            {total === entries.length ? (
              <>
                Showing all{" "}
                <span className="font-semibold text-foreground">{entries.length}</span> inspection
                {entries.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{entries.length}</span> of {total}{" "}
                inspection{total !== 1 ? "s" : ""}
              </>
            )}
            <span className="ml-2 text-xs">(50 rows per page)</span>
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-slate-200 dark:border-slate-700" />
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 absolute inset-0" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading inspection registry...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <p className="font-medium text-foreground">Failed to load inspection registry</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
            Try again
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-4">
            <ClipboardCheck className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="font-medium text-foreground">
            {total === 0 ? "No inspections in the registry yet" : "No inspections match your filters"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {total === 0
              ? "Registry inspections will appear here once recorded"
              : "Try broadening your search or adjusting the filters"}
          </p>
        </div>
      )}

      {/* Registry Table */}
      {!isLoading && !error && entries.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
          <CardContent className="p-0">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                  <TableHead className="w-[44px]" />
                  <TableHead
                    className="w-[52px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider"
                    onClick={() => toggleSort("row_index")}
                  >
                    <span className="flex items-center">
                      #
                      <SortIcon field="row_index" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[140px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                    onClick={() => toggleSort("inspection_number")}
                  >
                    <span className="flex items-center">
                      Inspection No.
                      <SortIcon field="inspection_number" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[26%] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider"
                    onClick={() => toggleSort("permit_holder")}
                  >
                    <span className="flex items-center">
                      Permit Holder
                      <SortIcon field="permit_holder" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[170px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                    onClick={() => toggleSort("permit_number")}
                  >
                    <span className="flex items-center">
                      Permit No.
                      <SortIcon field="permit_number" />
                    </span>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell w-[150px] text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                    Activity
                  </TableHead>
                  <TableHead
                    className="w-[130px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                    onClick={() => toggleSort("compliance_status")}
                  >
                    <span className="flex items-center">
                      Compliance
                      <SortIcon field="compliance_status" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="hidden lg:table-cell w-[160px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                    onClick={() => toggleSort("action")}
                  >
                    <span className="flex items-center">
                      Action
                      <SortIcon field="action" />
                    </span>
                  </TableHead>
                  <TableHead className="hidden 2xl:table-cell w-[150px] text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                    Inspection Date
                  </TableHead>
                  {canEdit && (
                    <TableHead className="w-[56px] text-right text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isExpanded = expandedRow === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className="group border-b border-slate-100 dark:border-slate-800/60 hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors duration-150 cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      >
                        <TableCell className="p-2 sm:p-3 w-[44px]">
                          <div className="flex items-center justify-center">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 text-muted-foreground text-sm tabular-nums">
                          {entry.row_index ?? "-"}
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 max-w-[140px]">
                          <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 block truncate whitespace-nowrap">
                            {entry.inspection_number || "--"}
                          </code>
                        </TableCell>
                        <TableCell className="p-2 sm:p-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                              {entry.permit_holder || "--"}
                            </span>
                            {entry.documents?.length > 0 && (
                              <span
                                title={`${entry.documents.length} document${entry.documents.length > 1 ? "s" : ""} attached`}
                                className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400"
                              >
                                <Paperclip className="h-3 w-3" />
                                {entry.documents.length}
                              </span>
                            )}
                            {entry.source_kind === "system" && (
                              <span
                                title="Inspection conducted through the system"
                                className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-400"
                              >
                                <Database className="h-2.5 w-2.5" />
                                System
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 max-w-[170px]">
                          {entry.permit_number ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 block truncate whitespace-nowrap">
                                {entry.permit_number}
                              </code>
                              <Link
                                href={permitViewHref(entry.permit_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open permit ${entry.permit_number}`}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 text-[10px] font-medium px-1.5 py-0 rounded-full whitespace-nowrap"
                            >
                              No Permit
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 hidden xl:table-cell">
                          <span className="text-sm text-slate-700 dark:text-slate-300 block truncate" title={entry.activity || undefined}>
                            {entry.activity || "--"}
                          </span>
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 whitespace-nowrap">
                          {complianceBadge(entry.compliance_status)}
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 hidden lg:table-cell max-w-[160px]">
                          {actionBadge(entry.action)}
                        </TableCell>
                        <TableCell className="p-2 sm:p-3 hidden 2xl:table-cell">
                          <span className="text-sm text-slate-700 dark:text-slate-300 block truncate" title={entry.inspection_date_text || undefined}>
                            {entry.inspection_date_text || "--"}
                          </span>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="p-2 sm:p-3 text-right">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit inspection record"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditEntry(entry);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit inspection record</span>
                              </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40">
                          <TableCell colSpan={columnCount} className="p-4 sm:p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                  Location (District)
                                </p>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {entry.district || "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                  Inspection Date
                                </p>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {entry.inspection_date_text || "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                  Activity
                                </p>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {entry.activity || "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                  Source
                                </p>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {entry.source_kind === "system"
                                    ? "System inspection (conducted via the portal)"
                                    : "Water Users Inspection Register (imported)"}
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                  Observation / Comments
                                </p>
                                <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                  {entry.observation || "None recorded"}
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <InspectionDocuments entry={entry} />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page <span className="font-semibold text-foreground">{currentPage}</span> of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
            <div className="flex items-center gap-1.5 ml-2">
              <Input
                value={jumpPage}
                onChange={(e) => {
                  setJumpPage(e.target.value.replace(/[^0-9]/g, ""));
                  setJumpError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitJump();
                }}
                placeholder="Page"
                className={`h-8 w-[72px] text-sm ${jumpError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
              />
              <Button variant="outline" size="sm" className="h-8" onClick={submitJump}>
                Go
              </Button>
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <EditInspectionRegistrySheet
          entry={editEntry}
          open={Boolean(editEntry)}
          onOpenChange={(open) => {
            if (!open) {
              setEditEntry(null);
              setDocResult(null);
            }
          }}
          onSave={handleEditSave}
          saving={updateMutation.isPending}
          documents={
            editEntry ? (
              <InspectionDocuments
                entry={entries.find((e) => e.id === editEntry.id) ?? editEntry}
                editable={{
                  uploading: uploadingDocFor === editEntry.id,
                  result: docResult,
                  onUpload: handleDocUpload,
                  onDelete: handleDeleteDoc,
                }}
              />
            ) : null
          }
        />
      )}
    </div>
  );

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
            <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </span>
          Water Users Inspection Register
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Comprehensive register of water user inspections conducted across Rwanda
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">{content}</CardContent>
    </Card>
  );
}

/** Mirrors MAX_FILE_BYTES in the documents upload route. */
const MAX_DOC_BYTES = 9 * 1024 * 1024;

/**
 * Row documents. Read-only (Open links) in the expanded row; pass `editable`
 * for the upload/delete controls shown in the Edit panel.
 */
function InspectionDocuments({
  entry,
  editable,
}: {
  entry: InspectionRegistryEntry;
  editable?: {
    uploading: boolean;
    result: { kind: "success" | "error"; message: string } | null;
    onUpload: (entryId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
    onDelete: (entryId: string, docId: string, docName: string) => void;
  };
}) {
  const docs = entry.documents ?? [];
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-sky-200/70 dark:border-sky-900/70 p-4 bg-gradient-to-r from-sky-50/80 to-blue-50/70 dark:from-sky-950/30 dark:to-blue-950/20 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-900/60 flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/90 dark:text-sky-300">
            Documents
          </p>
        </div>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => editable.onUpload(entry.id, e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={editable.uploading}
              onClick={() => inputRef.current?.click()}
              title="PDF, PNG, JPG or WEBP — up to 9 MB each"
              className="h-7 px-2 border-sky-300/80 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
            >
              {editable.uploading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3 w-3 mr-1" />
              )}
              {editable.uploading ? "Uploading..." : "Upload documents"}
            </Button>
          </>
        )}
      </div>

      {editable?.result && (
        <p
          role="status"
          className={`text-xs ${
            editable.result.kind === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {editable.result.message}
        </p>
      )}

      {docs.length > 0 ? (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100 truncate" title={doc.doc_name}>
                  {doc.doc_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {new Date(doc.uploaded_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.file_available === false ? (
                  <span
                    className="h-7 px-2 inline-flex items-center rounded-md border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    title="The file is no longer on the server. Please upload it again."
                  >
                    File missing — re-upload
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-7 px-2 border-sky-300/80 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                  >
                    <a
                      href={`/api/staff/inspection-registry/${entry.id}/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open
                    </a>
                  </Button>
                )}
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => editable.onDelete(entry.id, doc.id, doc.doc_name)}
                    title="Delete document"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="sr-only">Delete document</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">No documents uploaded yet for this inspection.</p>
      )}
    </div>
  );
}
