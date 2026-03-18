"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Trash2,
  CheckCircle2,
  AlertCircle,
  Circle,
  XCircle,
  Clock,
  FileText,
  Trash,
  MoreHorizontal
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Application } from "@/types/database";
import { ALL_WATER_ACTIVITY_CODES, getActivityLabel } from "@/lib/assessment-report-utils";
import { useAuth } from "@/contexts/AuthContext";

type DashboardListApplication = Application & {
  display_status?: string;
  last_action_at?: string | null;
};

interface ApplicationsListProps {
  applications: DashboardListApplication[];
  loading?: boolean;
  onDeleteApplications?: (applicationIds: string[]) => Promise<void>;
  statusFilter?: "all" | "draft" | "submitted" | "under_review" | "revision_required" | "approved_pending_permit" | "approved" | "rejected" | "pending_payment" | "expired";
  onStatusFilterChange?: (status: "all" | "draft" | "submitted" | "under_review" | "revision_required" | "approved_pending_permit" | "approved" | "rejected" | "pending_payment" | "expired") => void;
}

export function ApplicationsList({
  applications,
  loading = false,
  onDeleteApplications,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
}: ApplicationsListProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const effectiveStatusFilter = controlledStatusFilter ?? statusFilter;

  const handleStatusFilterChange = (
    value: "all" | "draft" | "submitted" | "under_review" | "revision_required" | "approved_pending_permit" | "approved" | "rejected" | "pending_payment" | "expired"
  ) => {
    if (controlledStatusFilter === undefined) {
      setStatusFilter(value);
    }
    onStatusFilterChange?.(value);
  };

  const [page, setPage] = useState(1);
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const pageSize = 10;

  const getDisplayStatus = (app: DashboardListApplication): string => {
    // UI-only status mapping from parent (e.g., applicant dashboard).
    // We must keep raw `app.status` for behavior (edit, accept terms, delete rules).
    // Critical: when the raw status is approved_pending_permit, always show it (do not map to under_review).
    if (app.status === "approved_pending_permit") return "approved_pending_permit";

    const fromParent = app.display_status;
    if (fromParent) return fromParent;

    // Fallback: ensure internal statuses never leak to applicants even if parent forgets to attach `display_status`.
    const raw = app.status;
    if (raw === "draft") return "draft";
    if (
      raw === "submitted" ||
      raw === "under_review" ||
      raw === "revision_required" ||
      raw === "rejected" ||
      raw === "approved" ||
      raw === "expired" ||
      raw === "pending_payment"
    ) return raw;
    if (
      raw === "returned_to_assessment" ||
      raw === "returned_to_review" ||
      raw === "returned_to_verification"
    ) return "revision_required";
    return "under_review";
  };

  // Filter applications based on search and filters
  const getApplicationActivities = (app: Application): string[] => {
    const raw = app.intended_activities as unknown;
    const values = Array.isArray(raw)
      ? raw.filter((activity): activity is string => typeof activity === "string" && activity.trim().length > 0)
      : [];

    if (typeof app.water_purpose === "string" && app.water_purpose.trim().length > 0) {
      values.push(app.water_purpose);
    }

    return [...new Set(values)];
  };

  const availableActivities = useMemo(() => {
    const labelsByCode = new Map<string, string>();

    // Always expose the full known catalog in the filter dropdown.
    for (const activityCode of ALL_WATER_ACTIVITY_CODES) {
      labelsByCode.set(activityCode, getActivityLabel(activityCode));
    }

    // Include any additional/legacy codes found in data.
    for (const app of applications) {
      const activityCodes = getApplicationActivities(app);
      for (const activityCode of activityCodes) {
        labelsByCode.set(activityCode, getActivityLabel(activityCode));
      }
    }

    return Array.from(labelsByCode.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [applications]);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const displayStatus = getDisplayStatus(app);
      const activityCodes = getApplicationActivities(app);
      const matchesSearch = 
        app.project_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.application_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.district?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.province?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesActivity = activityFilter === "all" || activityCodes.includes(activityFilter);
      const matchesStatus = effectiveStatusFilter === "all" || displayStatus === effectiveStatusFilter;
      
      return matchesSearch && matchesActivity && matchesStatus;
    });
  }, [applications, searchQuery, activityFilter, effectiveStatusFilter]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, activityFilter, effectiveStatusFilter]);
  
  // Current page slice
  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pagedApplications = filteredApplications.slice(start, end);

  // Bulk selection functions
  const isAllPageSelected = pagedApplications.length > 0 && 
    pagedApplications.every(app => selectedApplications.includes(app.id));
  
  const isSomePageSelected = pagedApplications.some(app => selectedApplications.includes(app.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const currentPageIds = pagedApplications.map(app => app.id);
      setSelectedApplications(prev => [...new Set([...prev, ...currentPageIds])]);
    } else {
      const currentPageIds = pagedApplications.map(app => app.id);
      setSelectedApplications(prev => prev.filter(id => !currentPageIds.includes(id)));
    }
  };

  const handleSelectApplication = (applicationId: string, checked: boolean) => {
    if (checked) {
      setSelectedApplications(prev => [...prev, applicationId]);
    } else {
      setSelectedApplications(prev => prev.filter(id => id !== applicationId));
    }
  };

  const handleBulkDelete = async () => {
    if (!onDeleteApplications || selectedApplications.length === 0) return;
    
    try {
      setIsDeleting(true);
      await onDeleteApplications(selectedApplications);
      setSelectedApplications([]);
    } catch (error) {
      console.error('Error deleting applications:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Function to get the appropriate status with icon and color
  // Only handles applicant-visible statuses: draft, submitted, under_review, revision_required, approved, expired
  // All other statuses (internal) are mapped to "Under Review" for applicants
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft":
        return {
          label: "Draft",
          icon: <Circle className="h-4 w-4" />,
          className: "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium"
        };
      case "submitted":
        return {
          label: "Submitted",
          icon: <Clock className="h-4 w-4" />,
          className: "bg-blue-100 text-blue-700 border-0 hover:bg-blue-100 px-3 py-2 rounded-full font-medium"
        };
      case "under_review":
        return {
          label: "Under Review",
          icon: <AlertCircle className="h-4 w-4" />,
          className: "bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 px-3 py-2 rounded-full font-medium"
        };
      case "revision_required":
        return {
          label: "Returned for Review",
          icon: <AlertCircle className="h-4 w-4" />,
          className: "bg-orange-100 text-orange-700 border-0 hover:bg-orange-100 px-3 py-2 rounded-full font-medium"
        };
      case "approved_pending_permit":
        return {
          label: "Approved - Pending Terms",
          icon: <FileText className="h-4 w-4" />,
          className: "bg-green-100 text-green-700 border-0 hover:bg-green-100 px-3 py-2 rounded-full font-medium"
        };
      case "approved":
        return {
          label: "Approved",
          icon: <CheckCircle2 className="h-4 w-4" />,
          className: "bg-green-100 text-green-700 border-0 hover:bg-green-100 px-3 py-2 rounded-full font-medium"
        };
      case "rejected":
        return {
          label: "Rejected",
          icon: <XCircle className="h-4 w-4" />,
          className: "bg-red-100 text-red-700 border-0 hover:bg-red-100 px-3 py-2 rounded-full font-medium"
        };
      case "pending_payment":
        return {
          label: "Pending Payment",
          icon: <Clock className="h-4 w-4" />,
          className: "bg-orange-100 text-orange-700 border-0 hover:bg-orange-100 px-3 py-2 rounded-full font-medium"
        };
      case "expired":
        return {
          label: "Expired",
          icon: <AlertCircle className="h-4 w-4" />,
          className: "bg-slate-200 text-slate-700 border-0 hover:bg-slate-200 px-3 py-2 rounded-full font-medium"
        };
      default:
        // Safety fallback: any unmapped/internal status shows as "Under Review" for applicants
        return {
          label: "Under Review",
          icon: <AlertCircle className="h-4 w-4" />,
          className: "bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 px-3 py-2 rounded-full font-medium"
        };
    }
  };

  const getStatusBadge = (status: string) => {
    const config = getStatusConfig(status);
    return (
      <div className={`inline-flex items-center gap-2 text-sm ${config.className}`}>
        {config.icon}
        {config.label}
      </div>
    );
  };

  const formatTimestamp = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getLastActionTimestamp = (application: DashboardListApplication) => {
    const lastAction = typeof application.last_action_at === "string" ? application.last_action_at : "";
    return lastAction.trim().length > 0 ? lastAction : application.created_at;
  };

  /** Parse internal_notes JSON safely */
  const parseNotes = (app?: Application) => {
    try {
      const raw = app?.internal_notes;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  };

  const isRenewalApplication = (app?: Application) => {
    if (!app) return false;

    const notes = parseNotes(app);

    return (
      app.is_renewal === true ||
      Boolean(app.renewed_from_permit_id) ||
      Boolean(notes?.isRenewal) ||
      (typeof app.project_title === 'string' && app.project_title.startsWith('Renewal:'))
    );
  };

  /** Get the permit ID for a renewal draft — prefer the DB column, fall back to internal_notes */
  const getRenewalPermitId = (app: Application): string | undefined => {
    if (app.renewed_from_permit_id) return app.renewed_from_permit_id;
    const notes = parseNotes(app);
    return notes?.originalPermitId ?? undefined;
  };

  const isTransferTermsActor = (app: Application): boolean => {
    const notes = parseNotes(app);
    const isTransfer = app.application_type === "transfer" || notes?.isTransfer === true;
    if (!isTransfer) return true;

    const approval = notes?.transferApproval;
    return (
      approval?.transfereeApproved === true &&
      typeof approval?.transfereeUserId === "string" &&
      approval.transfereeUserId === userProfile?.id
    );
  };

  const getLocationDisplay = (app: DashboardListApplication): string => {
    const notes = parseNotes(app);
    const waterSourceDistrict =
      typeof notes?.waterSourceDistrict === "string" ? notes.waterSourceDistrict.trim() : "";
    const waterSourceProvince =
      typeof notes?.waterSourceProvince === "string" ? notes.waterSourceProvince.trim() : "";
    const waterSourceSector =
      typeof notes?.waterSourceSector === "string" ? notes.waterSourceSector.trim() : "";
    const waterSourceCell =
      typeof notes?.waterSourceCell === "string" ? notes.waterSourceCell.trim() : "";

    const waterSourceParts = [waterSourceDistrict, waterSourceProvince].filter(Boolean);
    if (waterSourceParts.length > 0) {
      return waterSourceParts.join(", ");
    }

    const hasAnyWaterSourceLocationField = Boolean(
      waterSourceDistrict || waterSourceProvince || waterSourceSector || waterSourceCell
    );

    // For in-progress drafts, avoid displaying office location as the source location.
    if (app.status === "draft" && !hasAnyWaterSourceLocationField) {
      return "N/A";
    }

    const fallbackParts = [app.district?.trim(), app.province?.trim()].filter(Boolean);
    return fallbackParts.length > 0 ? fallbackParts.join(", ") : "N/A";
  };

  const formatApplicationType = (type: string, app?: Application) => {
    const notes = parseNotes(app);

    const isRenewal =
      type === 'renewal' ||
      Boolean(notes?.isRenewal) ||
      isRenewalApplication(app);

    if (isRenewal) {
      return 'Renewal';
    }
    
    // Show the actual intended activity name for all application types
    if (app) {
      const activities = app.intended_activities as string[] | null;
      const primaryActivity = activities?.[0] || app.water_purpose;
      
      if (primaryActivity) {
        const activityName = getActivityLabel(primaryActivity);
        if (type === 'modification') return `${activityName} (Mod)`;
        if (type === 'transfer') return `${activityName} (Transfer)`;
        return activityName;
      }
    }
    
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const shouldIgnoreRowNavigation = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-row-click-ignore="true"]'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading applications...</span>
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
            placeholder="Search applications..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Label className="text-sm whitespace-nowrap">Filter by:</Label>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              {availableActivities.map((activity) => (
                <SelectItem key={activity.value} value={activity.value}>
                  {activity.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={effectiveStatusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="revision_required">Returned for Review</SelectItem>
              <SelectItem value="approved_pending_permit">Approved - Pending Terms</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="pending_payment">Pending Payment</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Bulk Actions Toolbar */}
      {selectedApplications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium text-blue-900">
              {selectedApplications.length} application{selectedApplications.length !== 1 ? 's' : ''} selected
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedApplications([])}
              className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
            >
              Clear selection
            </Button>
          </div>
          
          <div className="flex w-full justify-end sm:w-auto items-center gap-2">
            {onDeleteApplications && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash className="h-4 w-4 mr-2" />
                    Delete {selectedApplications.length} application{selectedApplications.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </div>
        </motion.div>
      )}
      
      {/* Mobile Applications List */}
      <div className="space-y-3 md:hidden">
        {pagedApplications.length > 0 ? (
          pagedApplications.map((application) => (
            <div key={application.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 break-words">
                    {application.application_number || `RWB-${application.id.slice(-6)}`}
                  </p>
                  <p className="text-xs text-gray-500">{formatTimestamp(getLastActionTimestamp(application))}</p>
                </div>
                <div className="shrink-0">{getStatusBadge(getDisplayStatus(application))}</div>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p className="break-words">{formatApplicationType(application.application_type, application)}</p>
                <p className="break-words">
                  {getLocationDisplay(application)}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                {(application.status === 'draft' || application.status === 'revision_required') && (
                  <Link href={
                    isRenewalApplication(application)
                      ? `/dashboard/new-application?mode=renewal&applicationId=${application.id}&permitId=${getRenewalPermitId(application)}`
                      : `/dashboard/edit-application/${application.id}`
                  }>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                      title="Edit Application"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
                {application.status === 'approved_pending_permit' && (
                  <Link href={`/dashboard/application/${application.id}`}>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                      title={isTransferTermsActor(application) ? "Accept Terms & Conditions" : "View transfer status"}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {isTransferTermsActor(application) ? "Accept Terms" : "View Status"}
                    </Button>
                  </Link>
                )}
                <Link href={`/dashboard/application/${application.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    title="View Application"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
                {application.status !== 'approved' && application.status !== 'rejected' && application.status !== 'approved_pending_permit' && application.status !== 'expired' && onDeleteApplications && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete Application"
                    onClick={() => onDeleteApplications([application.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-gray-100 rounded-full">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-1">
                  {applications.length === 0 ? "No applications yet" : "No matches found"}
                </p>
                <p className="text-sm text-gray-500">
                  {applications.length === 0
                    ? "Create your first water permit application to get started."
                    : "Try adjusting your search or filter criteria."
                  }
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Applications Table */}
      <div className="hidden rounded-lg border bg-white shadow-sm overflow-hidden md:block">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-gray-50/50">
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[40px]">
                <Checkbox
                  checked={isAllPageSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all applications"
                />
              </TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[16%]">Last Action</TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[15%]">Application ID</TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[17%]">Type</TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[17%]">Status</TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[17%]">Location</TableHead>
              <TableHead className="font-semibold text-gray-700 px-4 py-4 w-[18%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedApplications.length > 0 ? (
              pagedApplications.map((application) => (
                <TableRow
                  key={application.id}
                  className="hover:bg-blue-50/30 transition-colors duration-150 border-b border-gray-100 cursor-pointer"
                  onClick={(event) => {
                    if (shouldIgnoreRowNavigation(event.target)) return;
                    router.push(`/dashboard/application/${application.id}`);
                  }}
                >
                  <TableCell className="px-4 py-4" data-row-click-ignore="true">
                    <Checkbox
                      checked={selectedApplications.includes(application.id)}
                      onCheckedChange={(checked) => handleSelectApplication(application.id, checked as boolean)}
                      aria-label={`Select application ${application.application_number || application.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 px-4 py-4">
                    <div className="text-sm truncate">
                      {formatTimestamp(getLastActionTimestamp(application))}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md font-medium truncate inline-block max-w-full">
                      {application.application_number || `RWB-${application.id.slice(-6)}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <div className="text-sm truncate">
                      {formatApplicationType(application.application_type, application)}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {getStatusBadge(getDisplayStatus(application))}
                  </TableCell>
                  <TableCell className="text-gray-600 px-4 py-4">
                    <div className="text-sm truncate" title={getLocationDisplay(application)}>
                      {getLocationDisplay(application)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right px-4 py-4" data-row-click-ignore="true">
                    <div className="flex justify-end gap-1.5">
                      {(application.status === 'draft' || application.status === 'revision_required') && (
                        <Link href={
                          isRenewalApplication(application)
                            ? `/dashboard/new-application?mode=renewal&applicationId=${application.id}&permitId=${getRenewalPermitId(application)}`
                            : `/dashboard/edit-application/${application.id}`
                        }>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            title="Edit Application"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                      
                      {application.status === 'approved_pending_permit' && (
                        <Link href={`/dashboard/application/${application.id}`}>
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                            title={isTransferTermsActor(application) ? "Accept Terms & Conditions" : "View transfer status"}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            {isTransferTermsActor(application) ? "Accept Terms" : "View Status"}
                          </Button>
                        </Link>
                      )}
                      
                      <Link href={`/dashboard/application/${application.id}`}>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="View Application"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      {application.status !== 'approved' && application.status !== 'rejected' && application.status !== 'approved_pending_permit' && application.status !== 'expired' && onDeleteApplications && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete Application"
                          onClick={() => onDeleteApplications([application.id])}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-100 rounded-full">
                      <FileText className="h-6 w-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">
                        {applications.length === 0 ? "No applications yet" : "No matches found"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {applications.length === 0 
                          ? "Create your first water permit application to get started."
                          : "Try adjusting your search or filter criteria."
                        }
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
          Page {currentPage} of {totalPages} • Showing {pagedApplications.length} of {filteredApplications.length}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
        </div>
      </div>
    </div>
  );
} 