"use client";

// =============================================
// Coordinate Input with Polygon Validation
// Rwanda Water Board - Water Permit System
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
import { PolygonDrawingMap } from "@/components/maps/PolygonDrawingMap";
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
  const [manualCoordinates, setManualCoordinates] = useState<CoordinatePoint[]>(coordinates);
  
  // Ref to track if we're updating from internal changes
  const internalUpdate = useRef(false);

  // =============================================
  // EFFECTS
  // =============================================

  // Update manual coordinates when prop changes (only from external changes)
  useEffect(() => {
    // Skip if this is an internal update to prevent loops
    if (internalUpdate.current) {
      internalUpdate.current = false;
      return;
    }
    
    setManualCoordinates(coordinates);
  }, [coordinates]);

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

    const updated = [...manualCoordinates];
    updated[index] = { ...updated[index], [field]: value };
    setManualCoordinates(updated);
    
    // Mark as internal update to prevent useEffect loop
    internalUpdate.current = true;
    onCoordinatesChange(updated);
  };

  const handleMapCoordinatesChange = (mapCoordinates: CoordinatePoint[]) => {
    if (disabled) return;
    
    setManualCoordinates(mapCoordinates);
    
    // Mark as internal update to prevent useEffect loop
    internalUpdate.current = true;
    onCoordinatesChange(mapCoordinates);
  };

  const handleValidationChange = (validationResult: ValidationResponse | null) => {
    setValidation(validationResult);
    onValidationChange?.(validationResult);
  };

  const copyFromMap = () => {
    setManualCoordinates([...coordinates]);
    setActiveTab("manual");
  };

  const copyToMap = () => {
    onCoordinatesChange([...manualCoordinates]);
    setActiveTab("map");
  };

  const handleDeleteCoordinate = (index: number) => {
    if (disabled) return;
    
    // Create new coordinate to replace the deleted one
    const newCoordinate = { latitude: "", longitude: "" };
    const updated = [...manualCoordinates];
    updated[index] = newCoordinate;
    
    setManualCoordinates(updated);
    
    // Mark as internal update to prevent useEffect loop
    internalUpdate.current = true;
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
        {validation.intersections.length} conflict(s)
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
          The system will validate that your polygon doesn't intersect with existing water permits.
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
              {manualCoordinates.map((coord, index) => {
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

            <div className="flex items-center gap-2">
              <Button
                onClick={copyFromMap}
                variant="outline"
                size="sm"
                disabled={disabled || coordinates.length !== 5}
              >
                <Edit3 className="h-4 w-4 mr-1" />
                Copy to Manual Entry
              </Button>
            </div>
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

            {validation.intersections.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Conflicting Permits:</h4>
                {validation.intersections.map((intersection, index) => (
                  <div key={index} className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                    <div className="font-medium">{intersection.permitNumber}</div>
                    <div className="text-muted-foreground">{intersection.projectTitle}</div>
                    <div className="text-xs text-red-600 mt-1">
                      {intersection.intersectionType.replace(/_/g, ' ')} • 
                      {intersection.overlapPercentage.toFixed(1)}% overlap • 
                      {intersection.intersectionArea.toFixed(0)} m² affected area
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Success message */}
        {showValidation && validation && validation.isValid && (
          <div className="mt-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ <strong>Polygon is valid!</strong> No intersections with existing permits found.
                {validation.summary && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Polygon area validated against {validation.summary.totalIntersections === 0 ? 'all' : validation.summary.totalIntersections} existing permits.
                  </div>
                )}
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
                  <li>• The system will automatically validate against existing permits</li>
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
