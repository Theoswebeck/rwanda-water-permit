"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  RefreshCw, 
  Search, 
  Calendar, 
  MapPin, 
  Droplet,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getApplicationFee } from "@/lib/payment-utils";
import type { Permit, Application } from "@/types/database";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { ManualPermitEntryCard } from "@/components/dashboard/manual-permit-entry-card";
import type { ManualPermitSelectionPayload } from "@/lib/permit/permit-reference";
import {
  buildPermitConflictIndex,
  formatPermitConflictMessage,
  type PermitConflictSummary,
  type PipelineApplicationLike,
} from "@/lib/permit/permit-pipeline-client";

export interface PermitWithApplication extends Permit {
  application?: Application & {
    applicant?: {
      id: string;
      email?: string;
      phone?: string;
      first_name?: string;
      last_name?: string;
      company_name?: string;
      company_address?: string;
      company_phone?: string;
      account_type?: string;
    };
  };
}

type HolderProfile = {
  first_name?: string;
  last_name?: string;
  company_name?: string;
};

type ApplicantProfile = {
  first_name?: string;
  last_name?: string;
  company_name?: string;
};

interface PermitSelectForRenewalProps {
  userId?: string;
  onPermitSelect: (permit: PermitWithApplication) => void;
  onManualPermitSelect?: (payload: ManualPermitSelectionPayload) => void;
  onCancel: () => void;
}

export function PermitSelectForRenewal({ 
  userId, 
  onPermitSelect,
  onManualPermitSelect,
  onCancel 
}: PermitSelectForRenewalProps) {
  const [permits, setPermits] = useState<PermitWithApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [holderProfile, setHolderProfile] = useState<HolderProfile | null>(null);
  const [permitConflicts, setPermitConflicts] = useState<Record<string, PermitConflictSummary>>({});

  useEffect(() => {
    fetchPermits();
  }, [userId]);

  const fetchPermits = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!userId) {
        console.warn('No userId provided - cannot fetch user permits');
        setPermits([]);
        setPermitConflicts({});
        setHolderProfile(null);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name,last_name,company_name')
        .eq('id', userId)
        .maybeSingle();

      setHolderProfile((profileData as HolderProfile | null) || null);

      // First, get the user's application IDs
      const { data: userApplications, error: appsError } = await supabase
        .from('applications')
        .select('id,status,created_at,application_type,is_renewal,is_modification,renewed_from_permit_id,modified_from_application_id,internal_notes,application_number')
        .eq('applicant_id', userId);

      if (appsError) {
        throw appsError;
      }

      const applicationIds = userApplications?.map(app => app.id) || [];

      if (applicationIds.length === 0) {
        // User has no applications, so no permits
        setPermits([]);
        setPermitConflicts({});
        setLoading(false);
        return;
      }

      // Fetch permits that are eligible for renewal:
      // - Active permits (including expiring_soon)
      // - Expired permits (within grace period for renewal)
      const { data, error: fetchError } = await supabase
        .from('permits')
        .select(`
          *,
          application:applications!application_id (
            id,
            application_number,
            application_type,
            project_title,
            province,
            district,
            sector,
            cell,
            village,
            water_source,
            water_purpose,
            water_body_name,
            max_daily_volume_m3,
            max_yearly_volume_m3,
            concession_area,
            internal_notes,
            intended_activities,
            applicant:users!applicant_id (
              id,
              email,
              phone,
              first_name,
              last_name,
              company_name,
              company_address,
              company_phone,
              account_type
            )
          )
        `)
        .in('application_id', applicationIds) // Only user's permits
        .in('status', ['active', 'expiring_soon', 'expired']) // Permits eligible for renewal
        .order('expiry_date', { ascending: true }); // Show most urgent first

      if (fetchError) {
        throw fetchError;
      }

      const permitRows = (data || []) as PermitWithApplication[];
      setPermits(permitRows);
      setPermitConflicts(
        buildPermitConflictIndex(permitRows, (userApplications || []) as PipelineApplicationLike[])
      );
    } catch (err) {
      console.error('Error fetching permits:', err);
      setPermitConflicts({});
      setError(err instanceof Error ? err.message : 'Failed to fetch permits');
    } finally {
      setLoading(false);
    }
  };

  const resolveHolderName = (applicant?: ApplicantProfile) => {
    const companyName = applicant?.company_name?.trim() || holderProfile?.company_name?.trim();
    if (companyName) return companyName;

    const personName = `${applicant?.first_name || holderProfile?.first_name || ''} ${applicant?.last_name || holderProfile?.last_name || ''}`
      .trim();
    return personName || 'Unknown';
  };

  const filteredPermits = permits.filter(permit => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      permit.permit_number?.toLowerCase().includes(search) ||
      permit.application?.project_title?.toLowerCase().includes(search) ||
      permit.application?.district?.toLowerCase().includes(search) ||
      resolveHolderName(permit.application?.applicant).toLowerCase().includes(search)
    );
  });

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusBadge = (permit: PermitWithApplication) => {
    const daysUntilExpiry = getDaysUntilExpiry(permit.expiry_date);
    
    if (permit.status === 'expired' || (daysUntilExpiry !== null && daysUntilExpiry < 0)) {
      return (
        <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }
    
    if (permit.status === 'expiring_soon' || (daysUntilExpiry !== null && daysUntilExpiry <= 180)) {
      return (
        <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {daysUntilExpiry !== null && daysUntilExpiry > 0 
            ? `Expires in ${daysUntilExpiry} days`
            : 'Expiring Soon'
          }
        </Badge>
      );
    }
    
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  const getExpiryUrgency = (permit: PermitWithApplication) => {
    const daysUntilExpiry = getDaysUntilExpiry(permit.expiry_date);
    if (daysUntilExpiry === null) return 'normal';
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'critical';
    if (daysUntilExpiry <= 90) return 'warning';
    if (daysUntilExpiry <= 180) return 'notice';
    return 'normal';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const raw = dateString.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPermitHolderName = (permit: PermitWithApplication) => {
    return resolveHolderName(permit.application?.applicant);
  };

  const parseInternalNotes = (permit: PermitWithApplication) => {
    try {
      const rawNotes = permit.application?.internal_notes;
      if (!rawNotes) return null;
      return typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes;
    } catch {
      return null;
    }
  };

  const getWaterSourceLocationLabel = (permit: PermitWithApplication) => {
    const notes = parseInternalNotes(permit);
    const permitDetails = notes?.permitDetails;
    const sourceParts = [
      notes?.waterSourceVillage,
      notes?.waterSourceCell,
      notes?.waterSourceSector,
      notes?.waterSourceDistrict,
      notes?.waterSourceProvince,
      permitDetails?.waterSourceVillage,
      permitDetails?.waterSourceCell,
      permitDetails?.waterSourceSector,
      permitDetails?.waterSourceDistrict,
      permitDetails?.waterSourceProvince,
      permitDetails?.village,
      permitDetails?.cell,
      permitDetails?.sector,
      permitDetails?.district,
      permitDetails?.province,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    if (sourceParts.length > 0) {
      return sourceParts.join(", ");
    }

    // Fallback to application-level location if source location details are unavailable.
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
    const notes = parseInternalNotes(permit);
    const activities = [
      ...(Array.isArray(permit.application?.intended_activities) ? permit.application.intended_activities : []),
      ...(Array.isArray(notes?.intendedActivities) ? notes.intendedActivities : []),
    ];
    if (activities.length > 0) {
      const primary = activities.find(
        (activity): activity is string => typeof activity === "string" && activity.trim().length > 0
      );
      if (primary) return getActivityLabel(primary);
    }

    if (permit.application?.water_purpose) {
      return getActivityLabel(permit.application.water_purpose);
    }

    if (permit.purpose) {
      return getActivityLabel(permit.purpose);
    }

    return "Unknown activity";
  };

  const handleSelectPermit = () => {
    const permit = permits.find(p => p.id === selectedPermitId);
    if (permit) {
      const conflict = permitConflicts[permit.id];
      if (conflict) {
        setError(formatPermitConflictMessage(conflict));
        return;
      }
      onPermitSelect(permit);
    }
  };

  const getCardBorderClass = (permit: PermitWithApplication) => {
    const urgency = getExpiryUrgency(permit);
    const isBlocked = Boolean(permitConflicts[permit.id]);
    const isSelected = selectedPermitId === permit.id;

    if (isBlocked) {
      return 'border-red-200 bg-red-50/30 hover:border-red-300';
    }
    
    if (isSelected) {
      return 'border-green-500 ring-2 ring-green-200 bg-green-50/50';
    }
    
    switch (urgency) {
      case 'expired':
        return 'border-red-200 bg-red-50/30 hover:border-red-300';
      case 'critical':
        return 'border-amber-300 bg-amber-50/30 hover:border-amber-400';
      case 'warning':
        return 'border-amber-200 hover:border-amber-300';
      default:
        return 'border-gray-200 hover:border-gray-300 hover:bg-gray-50';
    }
  };

  const selectedPermitConflict = selectedPermitId ? permitConflicts[selectedPermitId] : undefined;
  const renewalFeeText = `${getApplicationFee().toLocaleString()} RWF`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-green-600" />
            Select Permit to Renew
          </CardTitle>
          <CardDescription>
            Choose the water use permit you want to renew. Permits nearing expiration or recently expired 
            are shown with urgency indicators. The permit number will remain the same after renewal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Alert */}
          <Alert className="border-green-200 bg-green-50">
            <RefreshCw className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Permit Renewal:</strong> Renewing your permit will extend its validity for another 5 years. 
              You will need to submit a water use report, a letter requesting renewal, and pay the renewal fee of <strong>{renewalFeeText}</strong>.
              All existing permit details will remain unchanged.
            </AlertDescription>
          </Alert>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by permit number, project name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              <span className="ml-3 text-muted-foreground">Loading your permits...</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && permits.length === 0 && (
            <div className="text-center py-12">
              <RefreshCw className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Permits Available</h3>
              <p className="text-muted-foreground">
                You don&apos;t have any permits that can be renewed.
              </p>
            </div>
          )}

          {/* No Results */}
          {!loading && permits.length > 0 && filteredPermits.length === 0 && (
            <div className="text-center py-8">
              <Search className="h-8 w-8 mx-auto text-gray-400 mb-3" />
              <p className="text-muted-foreground">No permits match your search.</p>
            </div>
          )}

          {/* Permits List */}
          {!loading && filteredPermits.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {filteredPermits.map((permit) => {
                const urgency = getExpiryUrgency(permit);
                const daysUntilExpiry = getDaysUntilExpiry(permit.expiry_date);
                const conflict = permitConflicts[permit.id];
                const isBlocked = Boolean(conflict);
                
                return (
                  <Card
                    key={permit.id}
                    className={`transition-all ${isBlocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'} ${getCardBorderClass(permit)}`}
                    onClick={() => {
                      if (isBlocked) return;
                      setSelectedPermitId(permit.id);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-green-600">
                              {permit.permit_number}
                            </span>
                            {getStatusBadge(permit)}
                            {permit.is_renewal && (
                              <Badge className="bg-blue-100 text-blue-800">Previously Renewed</Badge>
                            )}
                            {selectedPermitId === permit.id && (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            )}
                          </div>
                          {conflict && (
                            <p className="text-xs text-red-700">{formatPermitConflictMessage(conflict)}</p>
                          )}

                          <p className="font-medium text-gray-900">
                            {permit.application?.project_title || 'Untitled Project'}
                          </p>

                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Holder:</span>
                              {getPermitHolderName(permit)}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {getWaterSourceLocationLabel(permit)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Droplet className="h-3.5 w-3.5" />
                              {getIntendedActivityLabel(permit)}
                            </span>
                          </div>

                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Issued: {formatDate(permit.issued_date)}
                            </span>
                            <span className={`flex items-center gap-1 ${
                              urgency === 'expired' ? 'text-red-600 font-semibold' :
                              urgency === 'critical' ? 'text-amber-600 font-semibold' :
                              urgency === 'warning' ? 'text-amber-500' : ''
                            }`}>
                              <Calendar className="h-3 w-3" />
                              {urgency === 'expired' 
                                ? `Expired: ${formatDate(permit.expiry_date)} (${Math.abs(daysUntilExpiry || 0)} days ago)`
                                : `Expires: ${formatDate(permit.expiry_date)}`
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {onManualPermitSelect && (
            <ManualPermitEntryCard
              title="Permit Not Listed?"
              description="If your permit is only in registry, enter the old permit number and your baseline details to continue with renewal."
              onContinue={onManualPermitSelect}
            />
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSelectPermit}
              disabled={!selectedPermitId || Boolean(selectedPermitConflict)}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              Continue with Renewal
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PermitSelectForRenewal;
