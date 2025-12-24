"use client";

// =============================================
// Polygon Drawing Map Component
// Rwanda Water Resources Board - Water Permit System
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

// Create a fully client-side map component
const ClientOnlyMap = dynamic(() => import('./ClientOnlyMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded">Loading map...</div>
});

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

// Map interaction is now handled in ClientOnlyMap

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
        String(coord.latitude).trim() !== '' && String(coord.longitude).trim() !== ''
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
        Invalid
      </Badge>
    );
  };

  // Color functions moved to ClientOnlyMap component

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
          <ClientOnlyMap
            coordinates={coordinates}
            currentPolygon={currentPolygon}
            existingPermits={existingPermits}
            showPermits={showPermits}
            validation={validation}
            onMapClick={handleMapClick}
            isDrawing={isDrawing}
            height={height}
          />
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
          </div>
        )}

        {/* Success message */}
        {validation && validation.isValid && (
          <div className="p-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ Polygon is valid! It is within Rwanda and does not duplicate an existing application polygon.
                {currentPolygon && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Area: {getPolygonSummary(currentPolygon).area}
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
                The system will validate that the polygon is within Rwanda and unique across applications.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
