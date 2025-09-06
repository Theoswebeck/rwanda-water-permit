"use client";

// =============================================
// Polygon Drawing Map Component
// Rwanda Water Board - Water Permit System
// =============================================

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  MapPin, 
  Trash2, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  Info,
  Eye,
  EyeOff
} from "lucide-react";
import { validateCoordinates, type ValidationResponse } from "@/lib/polygonValidation";
import { 
  coordinatesToGeoJSON, 
  geoJSONToLeafletCoords,
  formatArea,
  getPolygonSummary,
  type CoordinatePoint 
} from "@/lib/geoUtils";
import type { Feature, Polygon } from 'geojson';
import L from 'leaflet';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), { ssr: false });
const Polygon = dynamic(() => import("react-leaflet").then((mod) => mod.Polygon), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });
const useMapEvents = dynamic(() => import("react-leaflet").then((mod) => mod.useMapEvents), { ssr: false });

// =============================================
// TYPES AND INTERFACES
// =============================================

export interface PolygonDrawingMapProps {
  initialCoordinates?: CoordinatePoint[];
  onCoordinatesChange?: (coordinates: CoordinatePoint[]) => void;
  onValidationChange?: (validation: ValidationResponse | null) => void;
  applicationId?: string;
  readOnly?: boolean;
  showExistingPermits?: boolean;
  height?: string;
  className?: string;
}

interface ExistingPermit {
  permitId: string;
  permitNumber: string;
  projectTitle: string;
  coordinates: [number, number][];
  status: string;
}

// =============================================
// MAP INTERACTION COMPONENT
// =============================================

function MapClickHandler({ 
  onMapClick, 
  isDrawing 
}: { 
  onMapClick: (lat: number, lng: number) => void;
  isDrawing: boolean;
}) {
  useMapEvents({
    click: (e) => {
      if (isDrawing) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// =============================================
// MAIN COMPONENT
// =============================================

export function PolygonDrawingMap({
  initialCoordinates = [],
  onCoordinatesChange,
  onValidationChange,
  applicationId,
  readOnly = false,
  showExistingPermits = true,
  height = "400px",
  className = ""
}: PolygonDrawingMapProps) {
  // State management
  const [coordinates, setCoordinates] = useState<CoordinatePoint[]>(initialCoordinates);
  const [isDrawing, setIsDrawing] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [existingPermits, setExistingPermits] = useState<ExistingPermit[]>([]);
  const [showPermits, setShowPermits] = useState(showExistingPermits);
  const [currentPolygon, setCurrentPolygon] = useState<Feature<Polygon> | null>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(false);

  // Rwanda center coordinates
  const rwandaCenter: [number, number] = [-1.9403, 29.8739];

  // =============================================
  // EFFECTS
  // =============================================

  // Update coordinates when initialCoordinates changes (only once on mount)
  useEffect(() => {
    if (!initialLoadRef.current && initialCoordinates.length > 0) {
      setCoordinates(initialCoordinates);
      initialLoadRef.current = true;
    }
  }, [initialCoordinates]);

  // Generate polygon when coordinates change (no validation, no parent updates)
  useEffect(() => {
    if (coordinates.length === 5) {
      // Check if all coordinates are valid before creating polygon
      const allValid = coordinates.every(coord => 
        coord.latitude && coord.longitude && 
        coord.latitude.trim() !== '' && coord.longitude.trim() !== ''
      );
      
      if (allValid) {
        try {
          const polygon = coordinatesToGeoJSON(coordinates);
          setCurrentPolygon(polygon);
        } catch (error) {
          console.warn('Failed to create polygon:', error);
          setCurrentPolygon(null);
        }
      } else {
        setCurrentPolygon(null);
      }
    } else {
      setCurrentPolygon(null);
    }
  }, [coordinates]);

  // Load existing permits on mount
  useEffect(() => {
    if (showExistingPermits) {
      loadExistingPermits();
    }
  }, [showExistingPermits]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // =============================================
  // HANDLERS
  // =============================================

  const loadExistingPermits = async () => {
    try {
      const response = await fetch('/api/approved-permits/polygons?format=simple');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const permits: ExistingPermit[] = data.data.map((permit: any) => ({
            permitId: permit.permitId,
            permitNumber: permit.permitNumber,
            projectTitle: permit.projectTitle,
            coordinates: permit.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]), // Convert to Leaflet format
            status: permit.status
          }));
          setExistingPermits(permits);
        }
      }
    } catch (error) {
      console.error('Error loading existing permits:', error);
    }
  };

  const performValidation = async () => {
    if (coordinates.length !== 5) return;

    setIsValidating(true);
    try {
      const result = await validateCoordinates(
        {
          coordinates,
          applicationId
        },
        true // Use server validation
      );
      
      setValidation(result);
      onValidationChange?.(result);
    } catch (error) {
      console.error('Validation error:', error);
      setValidation({
        isValid: false,
        intersections: [],
        errors: ['Validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    // Map is view-only, no drawing allowed
    return;
  }, []);

  const startDrawing = () => {
    // Drawing disabled - map is view-only
    return;
  };

  const clearCoordinates = () => {
    // Drawing disabled - map is view-only
    return;
  };

  const removeLastPoint = () => {
    // Drawing disabled - map is view-only
    return;
  };

  // =============================================
  // RENDER HELPERS
  // =============================================

  const getValidationBadge = () => {
    if (isValidating) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Validating...
        </Badge>
      );
    }

    if (!validation) {
      return (
        <Badge variant="outline">
          No validation
        </Badge>
      );
    }

    if (validation.isValid) {
      return (
        <Badge variant="default" className="bg-green-500 text-white flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Valid
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Invalid ({validation.intersections.length} conflicts)
      </Badge>
    );
  };

  const getPolygonColor = () => {
    if (!validation) return '#3b82f6'; // Blue for no validation
    return validation.isValid ? '#10b981' : '#ef4444'; // Green for valid, red for invalid
  };

  const getPermitPolygonColor = (status: string) => {
    switch (status) {
      case 'active': return '#6366f1'; // Indigo
      case 'expiring_soon': return '#f59e0b'; // Amber
      default: return '#6b7280'; // Gray
    }
  };

  // =============================================
  // RENDER
  // =============================================

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Water Source Location (Polygon)
          </CardTitle>
          {getValidationBadge()}
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">          
          {showExistingPermits && (
            <Button
              onClick={() => setShowPermits(!showPermits)}
              variant="outline"
              size="sm"
            >
              {showPermits ? (
                <>
                  <EyeOff className="h-4 w-4 mr-1" />
                  Hide Permits
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Show Permits
                </>
              )}
            </Button>
          )}
        </div>

        {/* Progress indicator */}
        {coordinates.length > 0 && coordinates.length < 5 && (
          <div className="text-sm text-muted-foreground">
            {coordinates.length}/5 points placed. {5 - coordinates.length} more needed.
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* Map */}
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
            
            <MapClickHandler onMapClick={handleMapClick} isDrawing={isDrawing} />
            
            {/* Current coordinate markers */}
            {coordinates.map((coord, index) => {
              const lat = typeof coord.latitude === 'string' ? parseFloat(coord.latitude) : coord.latitude;
              const lng = typeof coord.longitude === 'string' ? parseFloat(coord.longitude) : coord.longitude;
              
              if (isNaN(lat) || isNaN(lng)) return null;
              
              return (
                <Marker
                  key={index}
                  position={[lat, lng]}
                  icon={L.divIcon({
                    html: `<div style="
                      width: 30px; 
                      height: 30px; 
                      background: #3b82f6; 
                      color: white; 
                      border: 2px solid white; 
                      border-radius: 50%; 
                      display: flex; 
                      align-items: center; 
                      justify-content: center; 
                      font-weight: bold; 
                      font-size: 14px;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    ">${index + 1}</div>`,
                    className: 'custom-numbered-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                  })}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>Point {index + 1}</strong><br />
                      Lat: {lat.toFixed(6)}<br />
                      Lng: {lng.toFixed(6)}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            
            {/* Current polygon */}
            {currentPolygon && (
              <Polygon
                positions={geoJSONToLeafletCoords(currentPolygon)}
                pathOptions={{
                  fillColor: getPolygonColor(),
                  color: getPolygonColor(),
                  weight: 2,
                  opacity: 0.8,
                  fillOpacity: 0.3
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>Your Application Area</strong><br />
                    {currentPolygon && (
                      <>
                        Area: {formatArea(getPolygonSummary(currentPolygon).area)}<br />
                        Status: {validation?.isValid ? 'Valid' : 'Invalid'}<br />
                        {validation?.intersections.length ? (
                          <>Conflicts: {validation.intersections.length}</>
                        ) : null}
                      </>
                    )}
                  </div>
                </Popup>
              </Polygon>
            )}
            
            {/* Existing permits */}
            {showPermits && existingPermits.map((permit) => (
              <Polygon
                key={permit.permitId}
                positions={permit.coordinates}
                pathOptions={{
                  fillColor: getPermitPolygonColor(permit.status),
                  color: getPermitPolygonColor(permit.status),
                  weight: 1,
                  opacity: 0.6,
                  fillOpacity: 0.2
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{permit.permitNumber}</strong><br />
                    {permit.projectTitle}<br />
                    Status: <Badge variant="outline" className="text-xs">
                      {permit.status}
                    </Badge>
                  </div>
                </Popup>
              </Polygon>
            ))}
          </MapContainer>
        </div>

        {/* Validation Results */}
        {validation && !validation.isValid && (
          <div className="p-4 space-y-2">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Polygon Validation Failed</strong>
                <ul className="mt-2 space-y-1">
                  {validation.errors.map((error, index) => (
                    <li key={index} className="text-sm">• {error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>

            {validation.intersections.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Conflicting Permits:</h4>
                {validation.intersections.map((intersection, index) => (
                  <div key={index} className="p-2 bg-red-50 rounded text-sm">
                    <strong>{intersection.permitNumber}</strong> - {intersection.projectTitle}<br />
                    <span className="text-xs text-muted-foreground">
                      {intersection.intersectionType.replace(/_/g, ' ')} • 
                      {intersection.overlapPercentage.toFixed(1)}% overlap • 
                      {formatArea(intersection.intersectionArea.toString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Success message */}
        {validation && validation.isValid && (
          <div className="p-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ Polygon is valid! No intersections with existing permits found.
                {currentPolygon && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Area: {formatArea(getPolygonSummary(currentPolygon).area)}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Instructions */}
        {coordinates.length === 0 && !readOnly && (
          <div className="p-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Click "Start Drawing" then click on the map to place exactly 5 points to define your water source area. 
                The system will automatically validate against existing permits.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
