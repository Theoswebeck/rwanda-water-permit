"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, Droplets, Filter } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EnhancedWaterConcessionMap } from "@/components/maps/EnhancedWaterConcessionMap";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((mod) => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((mod) => mod.Tooltip), { ssr: false });

interface WaterPermit {
  id: string;
  permit_number: string;
  application_number: string;
  project_title: string;
  status: string;
  water_source: string;
  water_purpose: string;
  water_allowance: number;
  allowance_unit: string;
  water_body_surface_area: number;
  surface_area_unit: string;
  province: string;
  district: string;
  sector: string;
  latitude: number;
  longitude: number;
  applicant_name: string;
  issued_date: string;
  expiry_date: string;
  monitoring_frequency: string;
}

const STATUS_COLORS = {
  'active': '#10b981',
  'expired': '#ef4444',
  'expiring_soon': '#f59e0b',
  'suspended': '#8b5cf6',
  'revoked': '#6b7280'
};

const getUsageIntensityColor = (usage: number) => {
  if (usage >= 50000) return '#0d47a1'; // Very high - Dark blue
  if (usage >= 30000) return '#1976d2'; // High - Blue
  if (usage >= 15000) return '#29b6f6'; // Medium - Light blue
  if (usage >= 5000) return '#81d4fa';  // Low - Very light blue
  return '#e0f2fe';                     // Very low - Pale blue
};

export function WaterConcessionMap({ registryStats }: { registryStats?: { total: number; operational: number; expired: number; expiringSoon: number } }) {
  return <EnhancedWaterConcessionMap registryStats={registryStats} />;
}

// Legacy component - keeping for backward compatibility
export function LegacyWaterConcessionMap() {
  const [permits, setPermits] = useState<WaterPermit[]>([]);
  const [filteredPermits, setFilteredPermits] = useState<WaterPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");

  useEffect(() => {
    fetchPermits();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [permits, statusFilter, purposeFilter, provinceFilter]);

  const fetchPermits = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('permits')
        .select(`
          id,
          permit_number,
          status,
          water_source,
          purpose,
          water_allowance,
          allowance_unit,
          water_body_surface_area,
          surface_area_unit,
          issued_date,
          expiry_date,
          monitoring_frequency,
          application:applications!application_id(
            application_number,
            project_title,
            province,
            district,
            sector,
            coordinates,
            applicant:users!applicant_id(first_name, last_name, company_name)
          )
        `)
        .not('application.coordinates', 'is', null);

      if (queryError) {
        throw queryError;
      }

      const formattedData: WaterPermit[] = data?.map((permit: any) => ({
        id: permit.id,
        permit_number: permit.permit_number,
        application_number: permit.application?.application_number || '',
        project_title: permit.application?.project_title || '',
        status: permit.status,
        water_source: permit.water_source,
        water_purpose: permit.purpose,
        water_allowance: permit.water_allowance || 0,
        allowance_unit: permit.allowance_unit || 'm³/month',
        water_body_surface_area: permit.water_body_surface_area || 0,
        surface_area_unit: permit.surface_area_unit || 'hectares',
        province: permit.application?.province || '',
        district: permit.application?.district || '',
        sector: permit.application?.sector || '',
        latitude: permit.application?.coordinates?.coordinates?.[1] || 0,
        longitude: permit.application?.coordinates?.coordinates?.[0] || 0,
        applicant_name: permit.application?.applicant?.company_name || 
                      `${permit.application?.applicant?.first_name || ''} ${permit.application?.applicant?.last_name || ''}`.trim(),
        issued_date: permit.issued_date,
        expiry_date: permit.expiry_date,
        monitoring_frequency: permit.monitoring_frequency || 'Annually'
      })) || [];

      setPermits(formattedData);
    } catch (err) {
      console.error('Failed to fetch permits:', err);
      setError('Failed to load permit data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...permits];

    if (statusFilter !== "all") {
      filtered = filtered.filter(permit => permit.status === statusFilter);
    }

    if (purposeFilter !== "all") {
      filtered = filtered.filter(permit => permit.water_purpose === purposeFilter);
    }

    if (provinceFilter !== "all") {
      filtered = filtered.filter(permit => permit.province === provinceFilter);
    }

    setFilteredPermits(filtered);
  };

  const getCircleRadius = (surfaceArea: number) => {
    // Scale circle size based on water body surface area
    // Min radius: 8, Max radius: 60
    const minArea = Math.min(...permits.map(p => p.water_body_surface_area));
    const maxArea = Math.max(...permits.map(p => p.water_body_surface_area));
    
    if (maxArea === minArea) return 20;
    
    const normalized = (surfaceArea - minArea) / (maxArea - minArea);
    return Math.max(8, Math.min(60, 8 + (normalized * 52)));
  };

  const getCircleColor = (usage: number, status: string) => {
    // Use usage intensity for color, but dim if not active
    const intensityColor = getUsageIntensityColor(usage);
    return status === 'active' ? intensityColor : STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#6b7280';
  };

  const formatUsage = (volume: number, unit: string) => {
    if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}k ${unit}`;
    }
    return `${volume.toLocaleString()} ${unit}`;
  };

  const formatSurfaceArea = (area: number, unit: string) => {
    return `${area.toLocaleString()} ${unit}`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'expired': return 'destructive';
      case 'expiring_soon': return 'secondary';
      case 'suspended': return 'outline';
      default: return 'secondary';
    }
  };

  const getUsageIntensityLabel = (usage: number) => {
    if (usage >= 50000) return 'Very High';
    if (usage >= 30000) return 'High';
    if (usage >= 15000) return 'Medium';
    if (usage >= 5000) return 'Low';
    return 'Very Low';
  };

  if (loading) {
    return (
      <Card className="w-full h-[600px]">
        <CardContent className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Loading consolidated map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full h-[600px]">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <MapPin className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Map</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchPermits} variant="outline">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Map Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Active Water Concession Permits Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>

            <Select value={purposeFilter} onValueChange={setPurposeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Purposes</SelectItem>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="irrigation">Irrigation</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
                <SelectItem value="municipal_supply">Municipal</SelectItem>
                <SelectItem value="mining">Mining</SelectItem>
                <SelectItem value="electricity_generation">Power Generation</SelectItem>
              </SelectContent>
            </Select>

            <Select value={provinceFilter} onValueChange={setProvinceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Province" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Provinces</SelectItem>
                <SelectItem value="Kigali">Kigali</SelectItem>
                <SelectItem value="Northern">Northern</SelectItem>
                <SelectItem value="Southern">Southern</SelectItem>
                <SelectItem value="Eastern">Eastern</SelectItem>
                <SelectItem value="Western">Western</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            Showing {filteredPermits.length} of {permits.length} active permits
            • Circle size = Water body surface area • Color intensity = Usage volume
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="h-[600px] w-full rounded-lg overflow-hidden">
            <MapContainer
              center={[-1.9403, 29.8739]} // Rwanda center coordinates
              zoom={8}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {filteredPermits.map((permit) => (
                <CircleMarker
                  key={permit.id}
                  center={[permit.latitude, permit.longitude]}
                  radius={getCircleRadius(permit.water_body_surface_area)}
                  pathOptions={{
                    fillColor: getCircleColor(permit.water_allowance, permit.status),
                    color: '#ffffff',
                    weight: 2,
                    opacity: 0.9,
                    fillOpacity: 0.7
                  }}
                >
                  <Popup>
                    <div className="p-2 min-w-[300px]">
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-semibold text-sm mb-1">{permit.application_number}</h4>
                          <p className="text-xs text-gray-600">{permit.permit_number}</p>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Badge variant={getStatusBadgeVariant(permit.status)} className="text-xs">
                            {permit.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                            {getUsageIntensityLabel(permit.water_allowance)} Usage
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Water Usage:</span>
                            <p className="font-medium">{formatUsage(permit.water_allowance, permit.allowance_unit)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Water Body Area:</span>
                            <p className="font-medium">{formatSurfaceArea(permit.water_body_surface_area, permit.surface_area_unit)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Source:</span>
                            <p className="font-medium">{permit.water_source.replace('_', ' ')}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Purpose:</span>
                            <p className="font-medium">{permit.water_purpose}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Location:</span>
                            <p className="font-medium">{permit.district}, {permit.province}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Monitoring:</span>
                            <p className="font-medium">{permit.monitoring_frequency}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100">
                          <span className="text-gray-500 text-xs">Permit Holder:</span>
                          <p className="font-medium text-xs">{permit.applicant_name}</p>
                          <p className="text-xs text-gray-500">
                            Valid until: {new Date(permit.expiry_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Popup>
                  
                  <Tooltip>
                    <div className="text-xs">
                      <strong>{permit.application_number}</strong><br />
                      Usage: {formatUsage(permit.water_allowance, permit.allowance_unit)}<br />
                      Area: {formatSurfaceArea(permit.water_body_surface_area, permit.surface_area_unit)}
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Map Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Permit Status</h4>
              <div className="space-y-1">
                {Object.entries(STATUS_COLORS).map(([status, color]) => (
                  <div key={status} className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full border border-white"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs capitalize">{status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-2">Usage Intensity (Color)</h4>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#e0f2fe' }} />
                  <span className="text-xs">Very Low (0-5k m³/month)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#81d4fa' }} />
                  <span className="text-xs">Low (5-15k m³/month)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#29b6f6' }} />
                  <span className="text-xs">Medium (15-30k m³/month)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#1976d2' }} />
                  <span className="text-xs">High (30-50k m³/month)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0d47a1' }} />
                  <span className="text-xs">Very High (50k+ m³/month)</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-2">Circle Size</h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>• Larger circles = Larger water body surface area</p>
                <p>• Smaller circles = Smaller water body area</p>
                <p>• Click circles for detailed permit information</p>
                <p>• Multiple permits may use the same water body</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 