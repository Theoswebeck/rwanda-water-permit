"use client";

import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  Upload,
  X,
  Droplets,
  ChevronDown,
  ChevronRight,
  Calendar,
  Shield,
  Activity,
  FileText,
  ExternalLink,
  Database,
  Trash2,
} from "lucide-react";
import { usePermitRegistryQuery } from "@/hooks/usePermitRegistryQuery";
import { useUpdatePermitRegistry } from "@/hooks/useUpdatePermitRegistry";
import { useDeletePermitRegistry } from "@/hooks/useDeletePermitRegistry";
import type { PermitRegistryEntry } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import {
  ACTIVITY_NOT_SPECIFIED,
  activityFilterOptions,
  classifyActivity,
  getActivityCategoryLabel,
} from "@/lib/permit/activity-classification";
import { RWANDA_CATCHMENTS } from "@/lib/rwanda-catchments";
import { cn } from "@/lib/utils";
import { RowActions } from "@/components/permit-registry/row-actions";
import { EditRegistryDrawer } from "@/components/permit-registry/edit-registry-drawer";
import { DeleteRegistryDialog } from "@/components/permit-registry/delete-registry-dialog";

/**
 * Format a permit calendar date (issuance / expiration) for display.
 *
 * Permit dates are fixed calendar days — "22 Aug 2023" is the same day for
 * everyone, everywhere. They must NOT be re-interpreted through the viewer's
 * (or the server's) timezone, or the shown day drifts by ±1. We therefore
 * pull the literal Y-M-D out of the incoming value (the API returns a plain
 * `YYYY-MM-DD` string; an ISO timestamp is tolerated too) and render it in a
 * fixed UTC frame so the output is identical on any device or server.
 */
function formatRegistryDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString.trim());
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date(dateString);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-RW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const LeafletPolygon = dynamic(() => import("react-leaflet").then((m) => m.Polygon), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

// Rwanda's 30 districts (fixed by the 2006 administrative reform). Kept as a
// local const — the only other sources are ~400KB data modules that would
// otherwise land in the client bundle for 30 names.
const RWANDA_DISTRICTS = [
  "Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo", "Gicumbi",
  "Gisagara", "Huye", "Kamonyi", "Karongi", "Kayonza", "Kicukiro",
  "Kirehe", "Muhanga", "Musanze", "Ngoma", "Ngororero", "Nyabihu",
  "Nyagatare", "Nyamagabe", "Nyamasheke", "Nyanza", "Nyarugenge",
  "Nyaruguru", "Rubavu", "Ruhango", "Rulindo", "Rusizi", "Rutsiro",
  "Rwamagana",
];

type SortField =
  | "row_index"
  | "serial_number"
  | "permit_holder"
  | "permit_number"
  | "activity"
  | "status";
type SortDir = "asc" | "desc";

interface PermitRegistryListProps {
  showCard?: boolean;
}

interface PermitRegistryComparisonValues {
  permit_holder: string | null;
  regime: string | null;
  water_source: string | null;
  volume_or_area: string | null;
  method_of_water_taking: string | null;
  authorized_activity: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  issuance_date: string | null;
  duration: string | null;
  expiration_date: string | null;
  status: string | null;
  contact: string | null;
}

type PermitRegistryEntryWithComparison = PermitRegistryEntry & {
  registry_values?: PermitRegistryComparisonValues | null;
  permit_values?: PermitRegistryComparisonValues | null;
};

export function PermitRegistryList({ showCard = true }: PermitRegistryListProps) {
  const PAGE_SIZE = 50;
  const [activeRegistryTab, setActiveRegistryTab] = useState<"permits" | "map">("permits");
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [catchmentFilter, setCatchmentFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("row_index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    dateParseFailures?: number;
    errors?: string[];
  } | null>(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [jumpPage, setJumpPage] = useState("");
  const [jumpError, setJumpError] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [docUploadResult, setDocUploadResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [editEntry, setEditEntry] = useState<PermitRegistryEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<PermitRegistryEntry | null>(null);
  const [rowActionResult, setRowActionResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const updateMutation = useUpdatePermitRegistry();
  const deleteMutation = useDeletePermitRegistry();

  const offset = (currentPage - 1) * PAGE_SIZE;
  const { data, isLoading, error, refetch } = usePermitRegistryQuery({
    q: searchTerm,
    activity: activityFilter,
    status: statusFilter,
    catchment: catchmentFilter,
    district: districtFilter,
    sort_by: sortField,
    sort_dir: sortDir,
    limit: PAGE_SIZE,
    offset,
  });
  const entries = data?.items || [];
  const total = data?.total || 0;

  // The activity options are the fixed canonical taxonomy, not values scraped
  // from the current page — the filter has to reach rows on every other page too.
  const availableActivities = useMemo(() => activityFilterOptions(), []);

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>(["OPERATIONAL", "EXPIRED", "SUSPENDED", "REVOKED", "EXPIRING_SOON"]);
    for (const entry of entries) {
      if (entry.status) statuses.add(entry.status);
    }
    return Array.from(statuses).sort();
  }, [entries]);

  const stats = useMemo(() => {
    const isAboutToExpire = (value: string | null | undefined): boolean => {
      if (!value) return false;
      const expiry = new Date(value);
      if (Number.isNaN(expiry.getTime())) return false;
      const now = new Date();
      const horizon = new Date(now);
      horizon.setMonth(horizon.getMonth() + 3);
      return expiry >= now && expiry <= horizon;
    };

    if (data?.summary) {
      return {
        total: data.summary.total,
        operational: data.summary.operational,
        expired: data.summary.expired,
        cancelled: data.summary.cancelled,
        expiringSoon: data.summary.expiringSoon,
      };
    }
    const pageTotal = entries.length;
    const operational = entries.filter((e) => {
      const s = e.status?.toUpperCase() ?? "";
      const isNon = s.includes("NON-OPERATIONAL") || s.includes("NON OPERATIONAL");
      const isInact = s.includes("INACTIVE") || s.includes("NON-ACTIVE");
      return (s.includes("OPERATIONAL") || (s.includes("ACTIVE") && !isInact)) && !isNon;
    }).length;
    const expired = entries.filter((e) => e.status?.toUpperCase()?.includes("EXPIRED")).length;
    const cancelled = entries.filter((e) => e.status?.toUpperCase()?.includes("CANCEL")).length;
    const expiringSoon = entries.filter((e) => isAboutToExpire(e.expiration_date)).length;
    return { total: pageTotal, operational, expired, cancelled, expiringSoon };
  }, [data?.summary, entries]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
    setJumpPage("");
    setJumpError(false);
  }, [searchTerm, activityFilter, statusFilter, catchmentFilter, districtFilter, sortField, sortDir]);

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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowUploadConfirm(true);
    e.target.value = "";
  };

  const handleUploadConfirm = async () => {
    if (!pendingFile) return;
    setShowUploadConfirm(false);
    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/staff/permit-registry/ingest", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setUploadResult({ inserted: json.inserted, dateParseFailures: json.dateParseFailures, errors: json.errors });
      refetch();
    } catch (err) {
      setUploadResult({
        inserted: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  };

  const handleUploadCancel = () => {
    setShowUploadConfirm(false);
    setPendingFile(null);
  };

  const handlePermitDocUpload = async (entryId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingDocId(entryId);
    setDocUploadResult(null);

    let successCount = 0;
    let lastError: string | null = null;

    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/staff/permit-registry/${entryId}/document`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Document upload failed");
        successCount++;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown upload error";
      }
    }

    if (successCount > 0) {
      setDocUploadResult({
        kind: lastError ? "error" : "success",
        message: lastError
          ? `${successCount} of ${files.length} file(s) uploaded. Last error: ${lastError}`
          : `${successCount} document${successCount > 1 ? "s" : ""} uploaded successfully.`,
      });
    } else {
      setDocUploadResult({ kind: "error", message: lastError || "Upload failed" });
    }

    refetch();
    setUploadingDocId(null);
    e.target.value = "";
  };

  const handleDeleteDoc = useCallback(async (entryId: string, docId: string) => {
    setDocUploadResult(null);
    try {
      const res = await fetch(`/api/staff/permit-registry/${entryId}/document/${docId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Delete failed");
      setDocUploadResult({ kind: "success", message: "Document deleted." });
      refetch();
    } catch (err) {
      setDocUploadResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to delete document",
      });
    }
  }, [refetch]);

  const handleEditSave = async (
    id: string,
    expectedUpdatedAt: string,
    updates: Record<string, string | number | null>
  ) => {
    setRowActionResult(null);
    try {
      await updateMutation.mutateAsync({
        id,
        expectedUpdatedAt,
        data: updates,
      });
      setRowActionResult({
        kind: "success",
        message: "Row updated successfully.",
      });
      setEditEntry(null);
    } catch (err) {
      setRowActionResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to update row",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteEntry) return;
    setRowActionResult(null);
    try {
      await deleteMutation.mutateAsync(deleteEntry.id);
      setRowActionResult({
        kind: "success",
        message: "Row deleted successfully.",
      });
      setDeleteEntry(null);
    } catch (err) {
      setRowActionResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to delete row",
      });
    }
  };

  const formatDate = formatRegistryDate;

  const getStatusBadge = (status: string | null | undefined) => {
    const raw = (status || "").trim();
    const s = raw.toUpperCase();
    const isNonOperational = s.includes("NON-OPERATIONAL") || s.includes("NON OPERATIONAL");
    const isInactive = s.includes("INACTIVE") || s.includes("NON-ACTIVE");
    const isOperational = (s.includes("OPERATIONAL") || (s.includes("ACTIVE") && !isInactive)) && !isNonOperational;
    const isExpired = s.includes("EXPIRED");
    const isSuspended = s.includes("SUSPENDED");
    const isRevoked = s.includes("REVOKED");
    const isRenewed = s.includes("RENEWED");
    const isTransferred = s.includes("TRANSFERRED");
    const isChanged = s.includes("CHANGED TO");
    const isExtended = s.includes("EXTENDED");

    const compactLabel = isNonOperational
      ? "Non-operational"
      : isSuspended
        ? "Suspended"
        : isRevoked
          ? "Revoked"
          : isExpired
            ? "Expired"
            : isRenewed
              ? "Renewed"
              : isTransferred
                ? "Transferred"
                : isChanged
                  ? "Changed"
                  : isExtended
                    ? "Extended"
                    : isOperational
                      ? "Operational"
                      : raw.length > 22
                        ? `${raw.slice(0, 22)}...`
                        : raw || "Unknown";

    const badgeToneClass = isOperational
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
      : isExpired
        ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
        : isSuspended
          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800"
          : isRevoked
            ? "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800"
            : "bg-slate-50 text-slate-600 border-slate-200";

    return (
      <Badge
        variant="outline"
        title={raw || "Unknown"}
        className={`max-w-full overflow-hidden text-xs font-medium px-2 py-0.5 rounded-full ${badgeToneClass}`}
      >
        <span className="block min-w-0 max-w-full truncate">{compactLabel}</span>
      </Badge>
    );
  };

  /**
   * Activity cell. Falls back to classifying the raw text client-side if the
   * API response predates `activity_code` (e.g. a cached response), so the
   * column never renders blank.
   */
  const getActivityBadge = (entry: PermitRegistryEntry) => {
    const code = entry.activity_code || classifyActivity(entry.authorized_activity);
    if (code === ACTIVITY_NOT_SPECIFIED) {
      return <span className="text-xs text-muted-foreground">--</span>;
    }
    const label = getActivityCategoryLabel(code);
    return (
      <Badge
        variant="outline"
        title={entry.authorized_activity || label}
        className="max-w-full overflow-hidden bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800 text-xs font-medium px-2 py-0.5 rounded-full"
      >
        <span className="block min-w-0 max-w-full truncate">{label}</span>
      </Badge>
    );
  };

  const activeFilterCount = [
    activityFilter !== "all",
    statusFilter !== "all",
    catchmentFilter !== "all",
    districtFilter !== "all",
    searchTerm.trim() !== "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm("");
    setActivityFilter("all");
    setStatusFilter("all");
    setCatchmentFilter("all");
    setDistrictFilter("all");
  };

  const hasRegistrySource = (entry: PermitRegistryEntry) => {
    const sk = entry.source_kind ?? "";
    return sk.includes("registry");
  };

  const isPermitOnly = (entry: PermitRegistryEntry) => {
    return entry.source_kind === "permit";
  };

  const getSourceLabel = (entry: PermitRegistryEntry) => {
    const sk = entry.source_kind ?? "";
    if (sk.includes("permit") && sk.includes("registry")) return "Both";
    if (sk === "permit") return "System";
    return "Registry";
  };

  const permitsContent = (
    <div className="space-y-6">
      {/* Summary Stats */}
      {!isLoading && !error && entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Total Permits",
              value: stats.total,
              icon: FileText,
              color: "text-slate-700 dark:text-slate-300",
              bg: "bg-slate-50 dark:bg-slate-900",
              border: "border-slate-200 dark:border-slate-800",
              statusFilterValue: "all",
            },
            {
              label: "Active",
              value: stats.operational,
              icon: Shield,
              color: "text-emerald-700 dark:text-emerald-400",
              bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
              border: "border-emerald-200 dark:border-emerald-800",
              statusFilterValue: "__ACTIVE__",
            },
            {
              label: "Expired",
              value: stats.expired,
              icon: AlertCircle,
              color: "text-red-600 dark:text-red-400",
              bg: "bg-red-50/70 dark:bg-red-950/30",
              border: "border-red-200 dark:border-red-800",
              statusFilterValue: "__EXPIRED__",
            },
            {
              label: "Canceled",
              value: stats.cancelled,
              icon: X,
              color: "text-orange-700 dark:text-orange-400",
              bg: "bg-orange-50/70 dark:bg-orange-950/30",
              border: "border-orange-200 dark:border-orange-800",
              statusFilterValue: "__CANCELLED__",
            },
            {
              label: "About to expire",
              value: stats.expiringSoon,
              icon: Calendar,
              color: "text-amber-700 dark:text-amber-400",
              bg: "bg-amber-50/70 dark:bg-amber-950/30",
              border: "border-amber-200 dark:border-amber-800",
              statusFilterValue: "__ABOUT_TO_EXPIRE__",
            },
          ].map((stat) => {
            const isSelected = statusFilter === stat.statusFilterValue;
            return (
            <button
              key={stat.label}
              type="button"
              onClick={() => {
                setStatusFilter(stat.statusFilterValue);
              }}
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
              <p className={`text-2xl font-bold ${stat.color} tracking-tight`}>
                {stat.value}
              </p>
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
              placeholder="Search by permit holder, number, location, water source, activity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg h-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[190px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Activity" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Activities</SelectItem>
                {availableActivities.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="__ACTIVE__">Active</SelectItem>
                <SelectItem value="__EXPIRED__">Expired</SelectItem>
                <SelectItem value="__CANCELLED__">Canceled</SelectItem>
                <SelectItem value="__ABOUT_TO_EXPIRE__">About to expire</SelectItem>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={catchmentFilter} onValueChange={setCatchmentFilter}>
              <SelectTrigger className="w-[190px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="Catchment" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                <SelectItem value="all">All Catchments</SelectItem>
                <SelectItem value="__UNSPECIFIED__">Unspecified</SelectItem>
                {RWANDA_CATCHMENTS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.level1Label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={districtFilter} onValueChange={setDistrictFilter}>
              <SelectTrigger className="w-[160px] border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg h-10">
                <SelectValue placeholder="District" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700 max-h-[320px]">
                <SelectItem value="all">All Districts</SelectItem>
                <SelectItem value="__UNSPECIFIED__">Unspecified</SelectItem>
                {RWANDA_DISTRICTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
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
                <span className="font-semibold text-foreground">{entries.length}</span> permit
                {entries.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{entries.length}</span> of {total} permit
                {total !== 1 ? "s" : ""}
              </>
            )}
            <span className="ml-2 text-xs">(50 rows per page)</span>
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <Button
              variant="outline"
              size="sm"
              asChild
              disabled={uploading}
              className="border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 rounded-lg"
            >
              <span>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {uploading ? "Importing..." : "Import XLSX"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* Upload Confirmation Modal */}
      <AnimatePresence>
        {showUploadConfirm && pendingFile && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-sm"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Replace entire permit registry?
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  This will delete all existing registry rows and import <span className="font-semibold">{pendingFile.name}</span> as the new registry. This action cannot be undone.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleUploadConfirm}
                    className="h-8"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Yes, replace registry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUploadCancel}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Result Banner */}
      <AnimatePresence>
        {uploadResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`p-4 rounded-xl border text-sm ${
              uploadResult.errors?.length
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
                : "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                Imported <span className="font-semibold">{uploadResult.inserted}</span>{" "}
                row{uploadResult.inserted !== 1 ? "s" : ""}.
                {uploadResult.dateParseFailures ? (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    ({uploadResult.dateParseFailures} date{uploadResult.dateParseFailures !== 1 ? "s" : ""} could not be parsed — raw values preserved)
                  </span>
                ) : null}
                {uploadResult.errors?.length ? (
                  <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs">
                    {uploadResult.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {uploadResult.errors.length > 5 && (
                      <li>...and {uploadResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadResult(null)}
                className="h-6 w-6 p-0 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Upload Result Banner */}
      <AnimatePresence>
        {docUploadResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`p-4 rounded-xl border text-sm ${
              docUploadResult.kind === "error"
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
                : "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p>{docUploadResult.message}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDocUploadResult(null)}
                className="h-6 w-6 p-0 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit/Delete Result Banner */}
      <AnimatePresence>
        {rowActionResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
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
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-slate-200 dark:border-slate-700" />
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 absolute inset-0" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading permit registry...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <p className="font-medium text-foreground">Failed to load permit registry</p>
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
            <BookOpen className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="font-medium text-foreground">
            {total === 0
              ? "No permits in the registry yet"
              : "No permits match your filters"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {total === 0
              ? "Import an XLSX file to populate the water permit registry"
              : "Try broadening your search or adjusting the filters"}
          </p>
        </div>
      )}

      {/* Registry Table */}
      {!isLoading && !error && entries.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
          <CardContent className="p-0">
            <div>
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
                      className="w-[32%] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider"
                      onClick={() => toggleSort("permit_holder")}
                    >
                      <span className="flex items-center">
                        Permit Holder
                        <SortIcon field="permit_holder" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="w-[180px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                      onClick={() => toggleSort("permit_number")}
                    >
                      <span className="flex items-center">
                        Permit No.
                        <SortIcon field="permit_number" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="w-[170px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                      onClick={() => toggleSort("activity")}
                    >
                      <span className="flex items-center">
                        Activity
                        <SortIcon field="activity" />
                      </span>
                    </TableHead>
                    <TableHead className="hidden 2xl:table-cell w-[150px] text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                      Water Source
                    </TableHead>
                    <TableHead
                      className="w-[170px] cursor-pointer select-none text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                      onClick={() => toggleSort("status")}
                    >
                      <span className="flex items-center">
                        Status
                        <SortIcon field="status" />
                      </span>
                    </TableHead>
                    <TableHead className="w-[112px] text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const isExpanded = expandedRow === entry.id;
                    const sourceKind = entry.source_kind ?? "";
                    const canUpload = hasRegistrySource(entry);
                    const canModify = canUpload && !sourceKind.includes("permit") && entry.row_index != null;
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
                            {entry.row_index ?? entry.serial_number ?? "-"}
                          </TableCell>
                          <TableCell className="p-2 sm:p-3 max-w-[280px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                                {entry.permit_holder}
                              </span>
                              {isPermitOnly(entry) && (
                                <span
                                  title="From permits table (system-issued)"
                                  className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-400"
                                >
                                  <Database className="h-2.5 w-2.5" />
                                  {getSourceLabel(entry)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-2 sm:p-3 max-w-[170px]">
                            <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 block truncate whitespace-nowrap">
                              {entry.permit_number}
                            </code>
                          </TableCell>
                          <TableCell className="p-2 sm:p-3 whitespace-nowrap">
                            {getActivityBadge(entry)}
                          </TableCell>
                          <TableCell className="p-2 sm:p-3 hidden 2xl:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Droplets className="h-3 w-3 text-blue-500/70 shrink-0" />
                              <span className="text-sm text-slate-700 dark:text-slate-300 max-w-[140px] truncate">
                                {entry.water_source || "N/A"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="p-2 sm:p-3 overflow-hidden">
                            <div className="max-w-[155px] overflow-hidden">
                              {getStatusBadge(entry.status)}
                            </div>
                          </TableCell>
                          <TableCell
                            className="p-2 sm:p-3 text-right whitespace-nowrap"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <RowActions
                              entry={entry}
                              uploadingDocId={uploadingDocId}
                              canUpload={canUpload}
                              canModify={canModify}
                              onUploadDoc={handlePermitDocUpload}
                              onEdit={setEditEntry}
                              onDelete={setDeleteEntry}
                            />
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
                            <TableCell colSpan={8} className="px-6 py-5">
                              <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                                  <DetailField
                                    icon={<FileText className="h-3.5 w-3.5" />}
                                    label="Permit Number"
                                    value={entry.permit_number}
                                  />
                                  <DetailField
                                    icon={<Shield className="h-3.5 w-3.5" />}
                                    label="Regime of Water Use"
                                    value={entry.regime}
                                  />
                                  <DetailField
                                    icon={<Droplets className="h-3.5 w-3.5" />}
                                    label="Water Source"
                                    value={entry.water_source}
                                  />
                                  <DetailField
                                    icon={<Activity className="h-3.5 w-3.5" />}
                                    label="Volume / Area"
                                    value={entry.volume_or_area}
                                  />
                                  <DetailField
                                    label="Method of Water Taking"
                                    value={entry.method_of_water_taking}
                                  />
                                  <DetailField
                                    label="Authorized Activity"
                                    value={formatActivityLabel(entry.authorized_activity)}
                                  />
                                  <DetailField
                                    icon={<MapPin className="h-3.5 w-3.5" />}
                                    label="Location"
                                    value={entry.location}
                                    wide
                                  />
                                  {(entry.latitude || entry.longitude || entry.coordinates_geojson) && (
                                    <CoordinatesField entry={entry} />
                                  )}
                                  <DetailField
                                    icon={<Calendar className="h-3.5 w-3.5" />}
                                    label="Issuance Date"
                                    value={formatDate(entry.issuance_date)}
                                    rawValue={!entry.issuance_date && entry.issuance_date_raw ? entry.issuance_date_raw : undefined}
                                  />
                                  <DetailField
                                    label="Duration"
                                    value={entry.duration}
                                  />
                                  <DetailField
                                    icon={<Calendar className="h-3.5 w-3.5" />}
                                    label="Expiration Date"
                                    value={formatDate(entry.expiration_date)}
                                    rawValue={!entry.expiration_date && entry.expiration_date_raw ? entry.expiration_date_raw : undefined}
                                  />
                                  {entry.contact && entry.contact.trim() !== "Email:                                 Tel:" && (
                                    <DetailField
                                      label="Contact"
                                      value={entry.contact}
                                    />
                                  )}
                                </div>
                                <SourceComparison entry={entry} />
                                {hasRegistrySource(entry) && <UploadedDocSection entry={entry} onDeleteDoc={handleDeleteDoc} />}
                                <PermitLocationMap entry={entry} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {total > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-4 py-3">
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Showing page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                  <span className="font-medium text-foreground">{totalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="hidden sm:inline">Page</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label={`Current page — type 1 to ${totalPages} and press Enter to jump`}
                      aria-invalid={jumpError || undefined}
                      aria-describedby="jump-page-error"
                      value={jumpPage !== "" ? jumpPage : String(currentPage)}
                      onFocus={(e) => {
                        setJumpPage(String(currentPage));
                        requestAnimationFrame(() => e.target.select());
                      }}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setJumpPage(val);
                        if (jumpError) setJumpError(false);
                      }}
                      onBlur={() => {
                        if (jumpPage.length > 0 && parseInt(jumpPage, 10) !== currentPage) {
                          submitJump();
                        }
                        setJumpPage("");
                        setJumpError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitJump();
                          (e.currentTarget as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setJumpPage("");
                          setJumpError(false);
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      className={cn(
                        "h-8 w-14 text-xs text-center px-1.5 tabular-nums font-medium text-foreground transition-colors",
                        jumpError &&
                          "border-red-500 text-red-600 focus-visible:ring-red-500 dark:border-red-500/70 dark:text-red-400"
                      )}
                    />
                    <span id="jump-page-error" role="status" aria-live="polite" className="sr-only">
                      {jumpError ? `Page must be between 1 and ${totalPages}` : ""}
                    </span>
                    <span>of <span className="font-medium text-foreground">{totalPages}</span></span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <EditRegistryDrawer
        entry={editEntry}
        open={Boolean(editEntry)}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null);
        }}
        onSave={handleEditSave}
        saving={updateMutation.isPending}
      />

      <DeleteRegistryDialog
        entry={deleteEntry}
        open={Boolean(deleteEntry)}
        onOpenChange={(open) => {
          if (!open) setDeleteEntry(null);
        }}
        onConfirm={handleDeleteConfirm}
        deleting={deleteMutation.isPending}
      />
    </div>
  );

  const content = (
    <Tabs
      value={activeRegistryTab}
      onValueChange={(value) => setActiveRegistryTab(value as "permits" | "map")}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="permits">Permits</TabsTrigger>
        <TabsTrigger value="map" className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Consolidated Map
        </TabsTrigger>
      </TabsList>

      <TabsContent value="permits" className="mt-4">
        {permitsContent}
      </TabsContent>

      <TabsContent value="map" className="mt-4">
        <WaterConcessionMap registryStats={data?.summary ? { total: data.summary.total, operational: data.summary.operational, expired: data.summary.expired, expiringSoon: data.summary.expiringSoon } : undefined} />
      </TabsContent>
    </Tabs>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800 pb-4">
        <CardTitle className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
          <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          </div>
          Water Permit Registry
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Comprehensive registry of all water use permits issued across Rwanda
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">{content}</CardContent>
    </Card>
  );
}

function formatActivityLabel(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  const prefixPattern = /^.*?(?:water permit application|permit application)\s+(?:for\s+)?/i;
  const stripped = raw.replace(prefixPattern, "");
  const codes = stripped.split(/\s*,\s*/);
  return codes.map((c) => getActivityLabel(c.trim())).join(", ");
}

function extractGeoJsonCoords(geojson: string | null | undefined): [number, number][] {
  if (!geojson) return [];
  try {
    const geo = JSON.parse(geojson);
    if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
      return [[geo.coordinates[1], geo.coordinates[0]]];
    }
    if (geo.type === "Polygon" && Array.isArray(geo.coordinates?.[0])) {
      return geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
    }
    if (geo.type === "MultiPolygon" && Array.isArray(geo.coordinates)) {
      return geo.coordinates.flatMap((poly: number[][][]) =>
        (poly[0] || []).map((c: number[]) => [c[1], c[0]] as [number, number])
      );
    }
  } catch {
    // invalid GeoJSON
  }
  return [];
}

function CoordinatesField({ entry }: { entry: PermitRegistryEntry }) {
  const coords = extractGeoJsonCoords(entry.coordinates_geojson);
  if (coords.length > 1) {
    return (
      <div className="md:col-span-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Coordinates ({coords.length} points)
          </span>
        </div>
        <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed space-y-0.5 max-h-[120px] overflow-y-auto">
          {coords.map((c, i) => (
            <p key={i} className="font-mono text-xs">
              {c[0].toFixed(6)}, {c[1].toFixed(6)}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const lat = coords.length === 1 ? coords[0][0] : entry.latitude;
  const lng = coords.length === 1 ? coords[0][1] : entry.longitude;
  return (
    <DetailField
      label="Coordinates"
      value={lat != null && lng != null ? `${lat}, ${lng}` : "N/A"}
    />
  );
}

function DetailField({
  icon,
  label,
  value,
  wide,
  rawValue,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  wide?: boolean;
  rawValue?: string;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
        {value || "N/A"}
      </p>
      {rawValue && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5" title="Original value from spreadsheet">
          Raw: {rawValue}
        </p>
      )}
    </div>
  );
}

function SourceComparison({ entry }: { entry: PermitRegistryEntry }) {
  const comparisonEntry = entry as PermitRegistryEntryWithComparison;
  if (!comparisonEntry.registry_values && !comparisonEntry.permit_values) return null;

  const formatCoord = (lat: number | null, lng: number | null) => {
    if (typeof lat === "number" && typeof lng === "number") {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    return "N/A";
  };

  const renderColumn = (title: string, values: PermitRegistryComparisonValues | null | undefined) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white/70 dark:bg-slate-900/40">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      {!values ? (
        <p className="text-sm text-muted-foreground">No data</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <p><span className="text-muted-foreground">Holder:</span> {values.permit_holder || "N/A"}</p>
          <p><span className="text-muted-foreground">Regime:</span> {values.regime || "N/A"}</p>
          <p><span className="text-muted-foreground">Status:</span> {values.status || "N/A"}</p>
          <p><span className="text-muted-foreground">Water Source:</span> {values.water_source || "N/A"}</p>
          <p><span className="text-muted-foreground">Activity:</span> {formatActivityLabel(values.authorized_activity)}</p>
          <p><span className="text-muted-foreground">Location:</span> {values.location || "N/A"}</p>
          <p><span className="text-muted-foreground">Coordinates:</span> {formatCoord(values.latitude, values.longitude)}</p>
          <p><span className="text-muted-foreground">Issued:</span> {formatRegistryDate(values.issuance_date)}</p>
          <p><span className="text-muted-foreground">Expires:</span> {formatRegistryDate(values.expiration_date)}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Registry vs Permit Table
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {renderColumn("Permit Registry", comparisonEntry.registry_values)}
        {renderColumn("Permit Table", comparisonEntry.permit_values)}
      </div>
    </div>
  );
}

function UploadedDocSection({
  entry,
  onDeleteDoc,
}: {
  entry: PermitRegistryEntry;
  onDeleteDoc: (entryId: string, docId: string) => void;
}) {
  const docs = entry.documents ?? [];

  return (
    <div className="rounded-xl border border-sky-200/70 dark:border-sky-900/70 p-4 bg-gradient-to-r from-sky-50/80 to-blue-50/70 dark:from-sky-950/30 dark:to-blue-950/20 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-900/60 flex items-center justify-center">
          <FileText className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/90 dark:text-sky-300">
          Uploaded Documents
        </p>
      </div>

      {docs.length > 0 ? (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-100 break-all min-w-0 truncate">
                {doc.doc_name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 px-2 border-sky-300/80 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                >
                  <a
                    href={`/api/staff/permit-registry/${entry.id}/document/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => onDeleteDoc(entry.id, doc.id)}
                  title="Delete document"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Delete document</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : entry.uploaded_doc_path ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-all">
            {entry.uploaded_doc_name || "Uploaded permit document"}
          </p>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="w-fit border-sky-300/80 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
          >
            <a href={`/api/staff/permit-registry/${entry.id}/document`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open document
            </a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">No documents uploaded yet for this permit.</p>
      )}
    </div>
  );
}

function PermitLocationMap({ entry }: { entry: PermitRegistryEntry }) {
  const polyCoords = extractGeoJsonCoords(entry.coordinates_geojson);
  const isPolygon = polyCoords.length > 2;

  if (!isPolygon && (typeof entry.latitude !== "number" || typeof entry.longitude !== "number")) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Permit map location</p>
        <p className="text-sm text-muted-foreground mt-1">
          Coordinates are not available for this permit.
        </p>
      </div>
    );
  }

  const center: [number, number] = isPolygon
    ? [
        polyCoords.reduce((s, c) => s + c[0], 0) / polyCoords.length,
        polyCoords.reduce((s, c) => s + c[1], 0) / polyCoords.length,
      ]
    : [entry.latitude!, entry.longitude!];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Permit map location</p>
      <div className="h-[260px] w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <MapContainer
          center={center}
          zoom={isPolygon ? 12 : 13}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {isPolygon ? (
            <LeafletPolygon
              positions={polyCoords}
              pathOptions={{
                fillColor: "#2563eb",
                color: "#1d4ed8",
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.25,
              }}
            >
              <Popup>
                <div className="min-w-[220px] space-y-1">
                  <p className="font-semibold">{entry.permit_holder}</p>
                  <p className="text-xs text-muted-foreground">{entry.permit_number}</p>
                  <p className="text-xs text-muted-foreground">{polyCoords.length} boundary points</p>
                </div>
              </Popup>
            </LeafletPolygon>
          ) : (
            <CircleMarker
              center={center}
              radius={8}
              pathOptions={{
                fillColor: "#2563eb",
                color: "#ffffff",
                weight: 2,
                opacity: 0.95,
                fillOpacity: 0.8,
              }}
            >
              <Popup>
                <div className="min-w-[220px] space-y-1">
                  <p className="font-semibold">{entry.permit_holder}</p>
                  <p className="text-xs text-muted-foreground">{entry.permit_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {center[0].toFixed(6)}, {center[1].toFixed(6)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
