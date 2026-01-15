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
  FileCheck, 
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

interface PermitSelectForTransferProps {
  userId?: string;
  onPermitSelect: (permit: PermitWithApplication) => void;
  onCancel: () => void;
}

export function PermitSelectForTransfer({ 
  userId, 
  onPermitSelect,
  onCancel 
}: PermitSelectForTransferProps) {
  const [permits, setPermits] = useState<PermitWithApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);

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
        setLoading(false);
        return;
      }

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
            water_source,
            water_purpose,
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
        .in('status', ['active', 'expiring_soon']) // Only transferable permits
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

  const filteredPermits = permits.filter(permit => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      permit.permit_number?.toLowerCase().includes(search) ||
      permit.application?.project_title?.toLowerCase().includes(search) ||
      permit.application?.district?.toLowerCase().includes(search) ||
      permit.application?.applicant?.company_name?.toLowerCase().includes(search) ||
      `${permit.application?.applicant?.first_name || ''} ${permit.application?.applicant?.last_name || ''}`.toLowerCase().includes(search)
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
    const applicant = permit.application?.applicant;
    if (!applicant) return 'Unknown';
    if (applicant.company_name) return applicant.company_name;
    return `${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || 'Unknown';
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
            <FileCheck className="h-5 w-5 text-blue-600" />
            Select Permit to Transfer
          </CardTitle>
          <CardDescription>
            Choose the water use permit you want to transfer. Only active permits can be transferred.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by permit number, project name, or holder..."
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
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-muted-foreground">Loading permits...</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && permits.length === 0 && (
            <div className="text-center py-12">
              <FileCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Permits Available</h3>
              <p className="text-muted-foreground">
                There are no active permits available for transfer.
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
                      ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedPermitId(permit.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-blue-600">
                            {permit.permit_number}
                          </span>
                          {getStatusBadge(permit.status)}
                          {selectedPermitId === permit.id && (
                            <CheckCircle className="h-5 w-5 text-blue-600" />
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
                            {permit.application?.district}, {permit.application?.province}
                          </span>
                          <span className="flex items-center gap-1">
                            <Droplet className="h-3.5 w-3.5" />
                            {permit.purpose?.replace(/_/g, ' ')}
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

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSelectPermit}
              disabled={!selectedPermitId}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              Continue with Transfer
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PermitSelectForTransfer;
