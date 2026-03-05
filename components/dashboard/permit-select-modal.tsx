"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileCheck, 
  Calendar, 
  Droplets, 
  MapPin, 
  Search,
  ArrowRight,
  AlertCircle,
  Loader2
} from "lucide-react";
import type { PermitWithApplication } from "@/hooks/usePermitsQuery";
import { getActivityLabel } from "@/lib/assessment-report-utils";

interface PermitSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permits: PermitWithApplication[];
  loading?: boolean;
}

export function PermitSelectModal({
  open,
  onOpenChange,
  permits,
  loading = false,
}: PermitSelectModalProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPermits = useMemo(() => {
    if (!searchTerm.trim()) return permits;
    
    const term = searchTerm.toLowerCase();
    return permits.filter(permit => 
      permit.permit_number?.toLowerCase().includes(term) ||
      permit.purpose?.toLowerCase().includes(term) ||
      permit.application?.project_title?.toLowerCase().includes(term) ||
      permit.application?.district?.toLowerCase().includes(term)
    );
  }, [permits, searchTerm]);

  const getStatusBadge = (permit: PermitWithApplication) => {
    const now = new Date();
    const expiryDate = new Date(permit.expiry_date);
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    if (expiryDate < now) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (expiryDate <= thirtyDaysFromNow) {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Expiring Soon</Badge>;
    }
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>;
  };

  const parseInternalNotes = (permit: PermitWithApplication) => {
    try {
      const raw = permit.application?.internal_notes;
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  };

  const getWaterSourceLocationLabel = (permit: PermitWithApplication) => {
    const notes = parseInternalNotes(permit);
    const waterSourceParts = [
      notes?.waterSourceVillage,
      notes?.waterSourceCell,
      notes?.waterSourceSector,
      notes?.waterSourceDistrict,
      notes?.waterSourceProvince,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    if (waterSourceParts.length > 0) {
      return waterSourceParts.join(", ");
    }

    const fallbackParts = [
      permit.application?.village,
      permit.application?.cell,
      permit.application?.sector,
      permit.application?.district,
      permit.application?.province,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    return fallbackParts.length > 0 ? fallbackParts.join(", ") : "Unknown location";
  };

  const getIntendedActivityLabel = (permit: PermitWithApplication) => {
    const activities = permit.application?.intended_activities;
    if (Array.isArray(activities) && activities.length > 0) {
      const primary = activities.find(
        (activity): activity is string => typeof activity === "string" && activity.trim().length > 0
      );
      if (primary) return getActivityLabel(primary);
    }

    if (permit.purpose) {
      return getActivityLabel(permit.purpose);
    }

    return "Unknown activity";
  };

  const handleSelectPermit = (permit: PermitWithApplication) => {
    onOpenChange(false);
    router.push(`/dashboard/water-use-report?permit_id=${permit.id}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Filter to only show active permits (not expired)
  const activePermits = filteredPermits.filter(permit => {
    const now = new Date();
    const expiryDate = new Date(permit.expiry_date);
    return expiryDate >= now;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" />
            Select Permit for Water Use Reporting
          </DialogTitle>
          <DialogDescription>
            Choose the permit you want to submit an annual water use report for.
            Only active permits are shown.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by permit number, purpose, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Permits List */}
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-3 text-sm text-muted-foreground">Loading permits...</span>
            </div>
          ) : activePermits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground font-medium">
                {permits.length === 0 
                  ? "No active permits found" 
                  : "No permits match your search"}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {permits.length === 0 
                  ? "You need an approved permit to submit water use reports" 
                  : "Try a different search term"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePermits.map((permit) => (
                <div
                  key={permit.id}
                  className="group border rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer"
                  onClick={() => handleSelectPermit(permit)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Permit Number & Status */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-slate-900">
                          {permit.permit_number}
                        </span>
                        {getStatusBadge(permit)}
                      </div>

                      {/* Purpose */}
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                        <Droplets className="h-4 w-4 shrink-0" />
                        <span>{getIntendedActivityLabel(permit)}</span>
                      </div>

                      {/* Location */}
                      {permit.application && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {getWaterSourceLocationLabel(permit)}
                          </span>
                        </div>
                      )}

                      {/* Dates */}
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>
                          Issued: {formatDate(permit.issued_date)} • 
                          Expires: {formatDate(permit.expiry_date)}
                        </span>
                      </div>

                      {/* Project Title */}
                      {permit.application?.project_title && (
                        <p className="text-xs text-muted-foreground mt-2 truncate">
                          {permit.application.project_title}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
