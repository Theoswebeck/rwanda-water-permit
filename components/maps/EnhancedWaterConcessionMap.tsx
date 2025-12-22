"use client";

// =============================================
// Enhanced Water Concession Map with Polygon Support
// Rwanda Water Board - Water Permit System
// =============================================

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Loader2, 
  MapPin, 
  Droplets, 
  Filter, 
  Eye, 
  EyeOff,
  RefreshCw,
  Info,
  Calendar,
  Ruler
} from "lucide-react";
import { formatArea, formatCoordinate } from "@/lib/geoUtils";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((mod) => mod.CircleMarker), { ssr: false });
const Polygon = dynamic(() => import("react-leaflet").then((mod) => mod.Polygon), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((mod) => mod.Tooltip), { ssr: false });

// =============================================
// TYPES AND INTERFACES
// =============================================

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
  water_body_surface_area?: number;
  surface_area_unit?: string;
  province: string;
  district: string;
  sector: string;
  latitude?: number;
  longitude?: number;
  applicant_name: string;
  issued_date: string;
  expiry_date: string;
  monitoring_frequency: string;
  coordinates?: any; // GeoJSON geometry
}

interface PermitPolygon {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: [number, number][];
  status: string;
  issuedDate: string;
  expiryDate: string;
  area?: number;
}

export interface EnhancedWaterConcessionMapProps {
  showPolygons?: boolean;
  showPointMarkers?: boolean;
  height?: string;
  className?: string;
  onPermitSelect?: (permit: WaterPermit | PermitPolygon) => void;
}

// =============================================
// CONSTANTS
// =============================================

const STATUS_COLORS = {
  'active': '#10b981',
  'expired': '#ef4444',
  'expiring_soon': '#f59e0b',
  'suspended': '#8b5cf6',
  'revoked': '#6b7280'
};

const PURPOSE_COLORS = {
  'domestic': '#3b82f6',
  'irrigation': '#10b981',
  'industrial': '#f59e0b',
  'electricity_generation': '#8b5cf6',
  'mining': '#ef4444',
  'recreation': '#06b6d4'
};

// =============================================
// UTILITY FUNCTIONS
// =============================================

const getUsageIntensityColor = (usage: number) => {
  if (usage < 1000) return '#10b981'; // Green for low usage
  if (usage < 10000) return '#f59e0b'; // Orange for medium usage
  return '#ef4444'; // Red for high usage
};

const getCircleRadius = (area: number) => {
  if (area < 100) return 5;
  if (area < 1000) return 8;
  if (area < 10000) return 12;
  return 15;
};

const getCircleColor = (usage: number, status: string) => {
  if (status !== 'active') return STATUS_COLORS[status as keyof typeof STATUS_COLORS];
  return getUsageIntensityColor(usage);
};

const isExpiringSoon = (expiryDate: string): boolean => {
  const expiry = new Date(expiryDate);
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  return expiry <= thirtyDaysFromNow && expiry > today;
};

// =============================================
// MAIN COMPONENT
// =============================================

export function EnhancedWaterConcessionMap({
  showPolygons = true,
  showPointMarkers = true,
  height = "600px",
  className = "",
  onPermitSelect
}: EnhancedWaterConcessionMapProps) {
  // State management
  const [permits, setPermits] = useState<WaterPermit[]>([]);
  const [permitPolygons, setPermitPolygons] = useState<PermitPolygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');
  const [provinceFilter, setProvinceFilter] = useState<string>('all');
  
  // View states
  const [showPolygonLayer, setShowPolygonLayer] = useState(showPolygons);
  const [showPointLayer, setShowPointLayer] = useState(showPointMarkers);
  
  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expiring: 0,
    expired: 0
  });

  // Rwanda center coordinates
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];

  // =============================================
  // EFFECTS
  // =============================================

  useEffect(() => {
    loadPermitData();
  }, []);

  useEffect(() => {
    updateStats();
  }, [permits, permitPolygons]);

  // =============================================
  // DATA LOADING
  // =============================================

  const loadPermitData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load both point permits and polygon permits
      await Promise.all([
        loadPointPermits(),
        loadPolygonPermits()
      ]);
    } catch (err) {
      console.error('Error loading permit data:', err);
      setError('Failed to load permit data');
    } finally {
      setLoading(false);
    }
  };

  const loadPointPermits = async () => {
    try {
      // This would typically come from your existing permits API
      // For now, using mock data structure similar to your existing component
      const mockPermits: WaterPermit[] = []; // You can populate this from your existing API
      setPermits(mockPermits);
    } catch (error) {
      console.error('Error loading point permits:', error);
    }
  };

  const loadPolygonPermits = async () => {
    try {
      const response = await fetch('/api/approved-permits/polygons?format=geojson&includeExpired=false');
      if (!response.ok) {
        throw new Error('Failed to fetch polygon permits');
      }

      const data = await response.json();
      if (data.success && data.data.features) {
        const polygons: PermitPolygon[] = data.data.features.map((feature: any) => ({
          permitId: feature.id,
          permitNumber: feature.properties.permitNumber,
          projectTitle: feature.properties.projectTitle,
          coordinates: feature.geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]), // Convert to Leaflet format
          status: feature.properties.status,
          issuedDate: feature.properties.issuedDate,
          expiryDate: feature.properties.expiryDate,
          area: feature.properties.area
        }));
        
        setPermitPolygons(polygons);
      }
    } catch (error) {
      console.error('Error loading polygon permits:', error);
    }
  };

  const updateStats = () => {
    const allPermits = [...permits, ...permitPolygons];
    const total = allPermits.length;
    const active = allPermits.filter(p => p.status === 'active').length;
    const expiring = allPermits.filter(p => p.status === 'active' && isExpiringSoon(p.expiry_date || p.expiryDate)).length;
    const expired = allPermits.filter(p => p.status === 'expired').length;

    setStats({ total, active, expiring, expired });
  };

  // =============================================
  // FILTERING
  // =============================================

  const filteredPermits = permits.filter(permit => {
    if (statusFilter !== 'all' && permit.status !== statusFilter) return false;
    if (purposeFilter !== 'all' && permit.water_purpose !== purposeFilter) return false;
    if (provinceFilter !== 'all' && permit.province !== provinceFilter) return false;
    return true;
  });

  const filteredPolygons = permitPolygons.filter(permit => {
    if (statusFilter !== 'all' && permit.status !== statusFilter) return false;
    if (provinceFilter !== 'all') return true; // Would need province data in polygon permits
    return true;
  });

  // =============================================
  // RENDER HELPERS
  // =============================================

  const renderPermitPopup = (permit: WaterPermit) => (
    <div className="p-2 min-w-[300px] space-y-2">
      <div className="border-b pb-2">
        <h3 className="font-semibold text-sm">{permit.permit_number}</h3>
        <p className="text-xs text-muted-foreground">{permit.application_number}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="font-medium">Status:</span>
          <Badge variant="outline" className="ml-1 text-xs">
            {permit.status}
          </Badge>
        </div>
        <div>
          <span className="font-medium">Purpose:</span>
          <span className="ml-1">{permit.water_purpose}</span>
        </div>
        <div>
          <span className="font-medium">Allowance:</span>
          <span className="ml-1">{permit.water_allowance?.toLocaleString()} {permit.allowance_unit}</span>
        </div>
        <div>
          <span className="font-medium">Expires:</span>
          <span className="ml-1">{new Date(permit.expiry_date).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="text-xs">
        <span className="font-medium">Location:</span>
        <span className="ml-1">{permit.district}, {permit.province}</span>
      </div>
      
      <div className="text-xs">
        <span className="font-medium">Applicant:</span>
        <span className="ml-1">{permit.applicant_name}</span>
      </div>
    </div>
  );

  const renderPolygonPopup = (polygon: PermitPolygon) => (
    <div className="p-2 min-w-[300px] space-y-2">
      <div className="border-b pb-2">
        <h3 className="font-semibold text-sm">{polygon.permitNumber}</h3>
        <p className="text-xs text-muted-foreground">{polygon.projectTitle}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="font-medium">Status:</span>
          <Badge variant="outline" className="ml-1 text-xs">
            {polygon.status}
          </Badge>
        </div>
        <div>
          <span className="font-medium">Area:</span>
          <span className="ml-1">{polygon.area ? formatArea(polygon.area.toString()) : 'N/A'}</span>
        </div>
        <div>
          <span className="font-medium">Issued:</span>
          <span className="ml-1">{new Date(polygon.issuedDate).toLocaleDateString()}</span>
        </div>
        <div>
          <span className="font-medium">Expires:</span>
          <span className="ml-1">{new Date(polygon.expiryDate).toLocaleDateString()}</span>
        </div>
      </div>
      
      {isExpiringSoon(polygon.expiryDate) && (
        <div className="text-xs text-amber-600 bg-amber-50 p-1 rounded">
          ⚠️ Expiring soon
        </div>
      )}
    </div>
  );

  // =============================================
  // RENDER
  // =============================================

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loading water permits...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            <Button onClick={loadPermitData} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Permits</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Expiring Soon</p>
                <p className="text-2xl font-bold text-amber-600">{stats.expiring}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div>
                <p className="text-sm font-medium">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Map Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Rwanda Water Permits Map
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={loadPermitData}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters and Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Layer Controls */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowPolygonLayer(!showPolygonLayer)}
                variant={showPolygonLayer ? "default" : "outline"}
                size="sm"
              >
                {showPolygonLayer ? (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Polygons
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Polygons
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => setShowPointLayer(!showPointLayer)}
                variant={showPointLayer ? "default" : "outline"}
                size="sm"
              >
                {showPointLayer ? (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Points
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Points
                  </>
                )}
              </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expiring_soon">Expiring</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>

              <Select value={purposeFilter} onValueChange={setPurposeFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Purposes</SelectItem>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="irrigation">Irrigation</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="electricity_generation">Electricity</SelectItem>
                  <SelectItem value="mining">Mining</SelectItem>
                </SelectContent>
              </Select>

              <Select value={provinceFilter} onValueChange={setProvinceFilter}>
                <SelectTrigger className="w-32">
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
          </div>

          {/* Legend */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-4">
              <span className="font-medium">Status:</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span>Expiring</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Expired</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div style={{ height }} className="w-full rounded-lg overflow-hidden">
            <MapContainer
              center={rwandaCenter}
              zoom={8}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Point Markers */}
              {showPointLayer && filteredPermits.map((permit) => {
                if (!permit.latitude || !permit.longitude) return null;
                
                return (
                  <CircleMarker
                    key={`point-${permit.id}`}
                    center={[permit.latitude, permit.longitude]}
                    radius={getCircleRadius(permit.water_body_surface_area || 0)}
                    pathOptions={{
                      fillColor: getCircleColor(permit.water_allowance, permit.status),
                      color: '#ffffff',
                      weight: 2,
                      opacity: 0.9,
                      fillOpacity: 0.7
                    }}
                    eventHandlers={{
                      click: () => onPermitSelect?.(permit)
                    }}
                  >
                    <Popup>{renderPermitPopup(permit)}</Popup>
                    <Tooltip>
                      <div className="text-xs">
                        <strong>{permit.permit_number}</strong><br />
                        {permit.application_number}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}

              {/* Polygon Permits */}
              {showPolygonLayer && filteredPolygons.map((polygon) => (
                <Polygon
                  key={`polygon-${polygon.permitId}`}
                  positions={polygon.coordinates}
                  pathOptions={{
                    fillColor: STATUS_COLORS[polygon.status as keyof typeof STATUS_COLORS] || '#6b7280',
                    color: STATUS_COLORS[polygon.status as keyof typeof STATUS_COLORS] || '#6b7280',
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.3
                  }}
                  eventHandlers={{
                    click: () => onPermitSelect?.(polygon)
                  }}
                >
                  <Popup>{renderPolygonPopup(polygon)}</Popup>
                  <Tooltip>
                    <div className="text-xs">
                      <strong>{polygon.permitNumber}</strong><br />
                      {polygon.projectTitle}
                    </div>
                  </Tooltip>
                </Polygon>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
