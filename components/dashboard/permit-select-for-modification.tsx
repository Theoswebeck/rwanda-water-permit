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
  FileEdit, 
  Search, 
  Calendar, 
  MapPin, 
  Droplet,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Permit, Application } from "@/types/database";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { ManualPermitEntryCard } from "@/components/dashboard/manual-permit-entry-card";
import type { ManualPermitSelectionPayload } from "@/lib/permit/permit-reference";

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

interface PermitSelectForModificationProps {
  userId?: string;
  onPermitSelect: (permit: PermitWithApplication) => void;
  onManualPermitSelect?: (payload: ManualPermitSelectionPayload) => void;
  onCancel: () => void;
}

export function PermitSelectForModification({ 
  userId, 
  onPermitSelect,
  onManualPermitSelect,
  onCancel 
}: PermitSelectForModificationProps) {
  const [permits, setPermits] = useState<PermitWithApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [holderProfile, setHolderProfile] = useState<HolderProfile | null>(null);

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
        .select('id')
        .eq('applicant_id', userId);

      if (appsError) {
        throw appsError;
      }

      const applicationIds = userApplications?.map(app => app.id) || [];

      if (applicationIds.length === 0) {
        // User has no applications, so no permits
        setPermits([]);
        setLoading(false);
        return;
      }

      // Fetch only permits that belong to the user's applications
      // For modification, we only allow active or expiring_soon permits
      const { data, error: fetchError } = await supabase
        .from('permits')
        .select(`
          *,
          application:applications!application_id (
            id,
            project_title,
            province,
            district,
            sector,
            cell,
            village,
            water_source,
            water_purpose,
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
        .in('status', ['active', 'expiring_soon']) // Only modifiable permits
        .order('issued_date', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setPermits(data || []);
    } catch (err) {
      console.error('Error fetching permits:', err);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'expiring_soon':
        return <Badge className="bg-amber-100 text-amber-800">Expiring Soon</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
    const sourceParts = [
      notes?.waterSourceVillage,
      notes?.waterSourceCell,
      notes?.waterSourceSector,
      notes?.waterSourceDistrict,
      notes?.waterSourceProvince,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    if (sourceParts.length > 0) {
      return sourceParts.join(", ");
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
      onPermitSelect(permit);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5 text-amber-600" />
            Select Permit to Modify
          </CardTitle>
          <CardDescription>
            Choose the water use permit you want to modify. Only your active permits can be modified. 
            The permit number will remain the same after modification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Alert */}
          <Alert className="border-amber-200 bg-amber-50">
            <FileEdit className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Permit Modification:</strong> You can update details of your existing permit. 
              Changes will go through the standard review process.
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
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
              <span className="ml-3 text-muted-foreground">Loading your permits...</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && permits.length === 0 && (
            <div className="text-center py-12">
              <FileEdit className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Permits Available</h3>
              <p className="text-muted-foreground">
                You don't have any active permits that can be modified.
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
              {filteredPermits.map((permit) => (
                <Card
                  key={permit.id}
                  className={`cursor-pointer transition-all ${
                    selectedPermitId === permit.id
                      ? 'border-amber-500 ring-2 ring-amber-200 bg-amber-50/50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedPermitId(permit.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-amber-600">
                            {permit.permit_number}
                          </span>
                          {getStatusBadge(permit.status)}
                          {permit.is_modification && (
                            <Badge className="bg-blue-100 text-blue-800">Previously Modified</Badge>
                          )}
                          {selectedPermitId === permit.id && (
                            <CheckCircle className="h-5 w-5 text-amber-600" />
                          )}
                        </div>

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
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {formatDate(permit.expiry_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {onManualPermitSelect && (
            <ManualPermitEntryCard
              title="Permit Not Listed?"
              description="If your permit exists in registry but is not linked to your profile, add the old permit number and details manually."
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
              disabled={!selectedPermitId}
              className="bg-amber-600 hover:bg-amber-700 gap-2"
            >
              Continue with Modification
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PermitSelectForModification;
