"use client";

// =============================================
// Coordinate Input with Polygon Validation
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  Loader2,
  Map,
  Edit3,
  Info,
  RefreshCw,
  Trash2
} from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import the map component to avoid SSR issues
const PolygonDrawingMap = dynamic(
  () => import("@/components/maps/PolygonDrawingMap").then((mod) => mod.PolygonDrawingMap),
  { 
    ssr: false,
    loading: () => <div className="h-96 w-full flex items-center justify-center bg-gray-100 rounded">Loading map...</div>
  }
);
import { validateCoordinates, type ValidationResponse } from "@/lib/polygonValidation";
import { isValidCoordinate, isWithinRwanda, type CoordinatePoint } from "@/lib/geoUtils";

// =============================================
// TYPES AND INTERFACES
// =============================================

export interface CoordinateInputWithValidationProps {
  coordinates: CoordinatePoint[];
  onCoordinatesChange: (coordinates: CoordinatePoint[]) => void;
  onValidationChange?: (validation: ValidationResponse | null) => void;
  applicationId?: string;
  disabled?: boolean;
  className?: string;
  showValidation?: boolean;
  autoValidate?: boolean;
}

// =============================================
// MAIN COMPONENT
// =============================================

export function CoordinateInputWithValidation({
  coordinates,
  onCoordinatesChange,
  onValidationChange,
  applicationId,
  disabled = false,
  className = "",
  showValidation = true,
  autoValidate = false
}: CoordinateInputWithValidationProps) {
  // State management
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<"manual" | "map">("manual");

  // =============================================
  // EFFECTS
  // =============================================

  // Auto-validation disabled - validation only happens on manual trigger

  // =============================================
  // HANDLERS
  // =============================================

  const performValidation = async () => {
    // Require all 5 coordinates to be filled
    if (coordinates.length !== 5) {
      console.warn('Validation requires exactly 5 coordinates');
      return;
    }

    // Check that all coordinates have both latitude and longitude
    const incompleteCoords = coordinates.filter(coord => !coord.latitude || !coord.longitude);
    if (incompleteCoords.length > 0) {
      const errorResult = {
        isValid: false,
        intersections: [],
        errors: [`Please fill in all 5 coordinate points. ${incompleteCoords.length} point(s) are incomplete.`]
      };
      setValidation(errorResult);
      onValidationChange?.(errorResult);
      return;
    }

    // Check that all coordinates are valid
    const invalidCoords = coordinates.filter(coord => !isValidCoordinate(coord));
    if (invalidCoords.length > 0) {
      const errorResult = {
        isValid: false,
        intersections: [],
        errors: [`${invalidCoords.length} coordinate(s) have invalid format. Please check latitude and longitude values.`]
      };
      setValidation(errorResult);
      onValidationChange?.(errorResult);
      return;
    }

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
      const errorResult = {
        isValid: false,
        intersections: [],
        errors: ['Validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
      };
      setValidation(errorResult);
      onValidationChange?.(errorResult);
    } finally {
      setIsValidating(false);
    }
  };

  const handleManualCoordinateChange = (index: number, field: 'latitude' | 'longitude', value: string) => {
    if (disabled) return;

    const updated = [...coordinates];
    updated[index] = { ...updated[index], [field]: value };
    onCoordinatesChange(updated);
  };

  const handleMapCoordinatesChange = (mapCoordinates: CoordinatePoint[]) => {
    if (disabled) return;
    
    onCoordinatesChange(mapCoordinates);
  };

  const handleValidationChange = (validationResult: ValidationResponse | null) => {
    setValidation(validationResult);
    onValidationChange?.(validationResult);
  };

  const copyFromMap = () => {
    // Coordinates are already synced, just switch tab
    setActiveTab("manual");
  };

  const copyToMap = () => {
    // Coordinates are already synced, just switch tab
    setActiveTab("map");
  };

  const handleDeleteCoordinate = (index: number) => {
    if (disabled) return;
    
    // Create new coordinate to replace the deleted one
    const newCoordinate = { latitude: "", longitude: "" };
    const updated = [...coordinates];
    updated[index] = newCoordinate;
    
    onCoordinatesChange(updated);
  };

  // =============================================
  // VALIDATION HELPERS
  // =============================================

  const getCoordinateValidationState = (coord: CoordinatePoint) => {
    // Disable real-time validation to prevent input field interference
    if (!coord.latitude || !coord.longitude) return 'empty';
    // Skip validation checks during input to prevent field disabling
    return 'empty';
  };

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
      const completeCoords = coordinates.filter(c => c.latitude && c.longitude).length;
      if (completeCoords === 0) {
        return <Badge variant="outline">No coordinates</Badge>;
      }
      return (
        <Badge variant="outline">
          {completeCoords}/5 points entered
        </Badge>
      );
    }

    if (validation.isValid) {
      return (
        <Badge variant="default" className="bg-green-500 text-white flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Valid polygon
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Invalid polygon
      </Badge>
    );
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
            Water Source Coordinates (Polygon - 5 Points Required)
          </CardTitle>
          {showValidation && getValidationBadge()}
        </div>
        
        <div className="text-sm text-muted-foreground">
          Define the exact area of your water source by providing 5 coordinate points that form a polygon. 
          The system will validate that your polygon is within Rwanda and does not duplicate an existing application polygon.
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "manual" | "map")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              Interactive Map
            </TabsTrigger>
          </TabsList>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-4">
              {coordinates.map((coord, index) => {
                const validationState = getCoordinateValidationState(coord);
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Point {index + 1} {index === 0 && "(Starting Point)"}
                        {validationState === 'valid' && <CheckCircle className="h-4 w-4 text-green-500 inline ml-2" />}
                        {validationState === 'invalid' && <AlertTriangle className="h-4 w-4 text-red-500 inline ml-2" />}
                        {validationState === 'outside_rwanda' && <AlertTriangle className="h-4 w-4 text-amber-500 inline ml-2" />}
                      </Label>
                      
                      {/* Delete button - only show if coordinate has data */}
                      {(coord.latitude || coord.longitude) && !disabled && (
                        <Button
                          onClick={() => handleDeleteCoordinate(index)}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`lat-${index}`} className="text-xs text-muted-foreground">
                          Latitude *
                        </Label>
                        <Input
                          id={`lat-${index}`}
                          type="text"
                          placeholder="e.g., -1.9441"
                          value={coord.latitude}
                          onChange={(e) => handleManualCoordinateChange(index, 'latitude', e.target.value)}
                          disabled={disabled}
                          className={`${
                            validationState === 'valid' ? 'border-green-200 focus:border-green-400' :
                            validationState === 'invalid' ? 'border-red-200 focus:border-red-400' :
                            validationState === 'outside_rwanda' ? 'border-amber-200 focus:border-amber-400' :
                            'border-blue-200 focus:border-blue-400'
                          }`}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`lng-${index}`} className="text-xs text-muted-foreground">
                          Longitude *
                        </Label>
                        <Input
                          id={`lng-${index}`}
                          type="text"
                          placeholder="e.g., 29.8739"
                          value={coord.longitude}
                          onChange={(e) => handleManualCoordinateChange(index, 'longitude', e.target.value)}
                          disabled={disabled}
                          className={`${
                            validationState === 'valid' ? 'border-green-200 focus:border-green-400' :
                            validationState === 'invalid' ? 'border-red-200 focus:border-red-400' :
                            validationState === 'outside_rwanda' ? 'border-amber-200 focus:border-amber-400' :
                            'border-blue-200 focus:border-blue-400'
                          }`}
                        />
                      </div>
                    </div>
                    
                    {/* Coordinate-specific validation messages */}
                    {validationState === 'invalid' && (
                      <div className="text-xs text-red-600">
                        Invalid coordinate format. Latitude must be between -90 and 90, longitude between -180 and 180.
                      </div>
                    )}
                    {validationState === 'outside_rwanda' && (
                      <div className="text-xs text-amber-600">
                        Coordinate is outside Rwanda boundaries. Please verify the location.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={copyToMap}
                variant="outline"
                size="sm"
                disabled={disabled}
              >
                <Map className="h-4 w-4 mr-1" />
                View on Map
              </Button>
              
              {showValidation && (
                <Button
                  onClick={performValidation}
                  variant="outline"
                  size="sm"
                  disabled={disabled || isValidating}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Validate
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Interactive Map Tab */}
          <TabsContent value="map" className="space-y-4">
            <PolygonDrawingMap
              initialCoordinates={coordinates}
              onCoordinatesChange={handleMapCoordinatesChange}
              onValidationChange={handleValidationChange}
              applicationId={applicationId}
              readOnly={disabled}
              showExistingPermits={false}
              height="400px"
            />

          </TabsContent>
        </Tabs>

        {/* Validation Results */}
        {showValidation && validation && !validation.isValid && (
          <div className="mt-4 space-y-2">
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
        {showValidation && validation && validation.isValid && (
          <div className="mt-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ <strong>Polygon is valid!</strong> It is within Rwanda and does not duplicate an existing application polygon.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Instructions */}
        {coordinates.filter(c => c.latitude && c.longitude).length === 0 && (
          <div className="mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>How to define your water source area:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Enter 5 coordinate points that define the boundary of your water source area</li>
                  <li>• Use the Interactive Map tab for easier point placement</li>
                  <li>• All coordinates must be within Rwanda boundaries</li>
                  <li>• The system will validate that the polygon is unique across applications</li>
                  <li>• Points will be connected to form a closed polygon</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
