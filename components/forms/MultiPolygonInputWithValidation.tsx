"use client";

// =============================================
// Multi-Polygon Input with Validation
// Rwanda Water Resources Board - Water Permit System
// =============================================

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Map, Edit3, Trash2, Plus, RefreshCw, Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { CoordinatePoint } from "@/lib/geoUtils";
import { validatePolygons, type ValidationResponse } from "@/lib/polygonValidation";

const MIN_POLYGON_POINTS = 4;

const MultiPolygonMap = dynamic(
  () => import("@/components/maps/MultiPolygonMap").then((mod) => ({ default: mod.MultiPolygonMap })),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full flex items-center justify-center bg-gray-100 rounded">Loading map...</div>
    ),
  }
);

export interface MultiPolygonInputWithValidationProps {
  polygons: CoordinatePoint[][];
  onPolygonsChange: (polygons: CoordinatePoint[][]) => void;
  onValidationChange?: (validation: ValidationResponse | null) => void;
  applicationId?: string;
  excludeApplicationIds?: string[];
  disabled?: boolean;
  className?: string;
  showValidation?: boolean;
}

function emptyPoint(): CoordinatePoint {
  return { latitude: "", longitude: "" };
}

function defaultPolygon(): CoordinatePoint[] {
  // Start with the minimum required points; user can add more.
  return Array.from({ length: MIN_POLYGON_POINTS }, () => emptyPoint());
}

function countCompletePoints(poly: CoordinatePoint[]): number {
  return poly.filter((p) => String(p.latitude ?? "").trim() !== "" && String(p.longitude ?? "").trim() !== "").length;
}

export function MultiPolygonInputWithValidation({
  polygons,
  onPolygonsChange,
  onValidationChange,
  applicationId,
  excludeApplicationIds,
  disabled = false,
  className = "",
  showValidation = true,
}: MultiPolygonInputWithValidationProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "map">("manual");
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);

  const safePolygons = useMemo(() => {
    const base = Array.isArray(polygons) ? polygons : [];
    const single = base.length > 0 ? base[0] : defaultPolygon();
    return [single];
  }, [polygons]);

  const activePolygon = safePolygons[0] || defaultPolygon();

  const setPolys = (next: CoordinatePoint[][]) => {
    const single = next.length > 0 ? next[0] : defaultPolygon();
    onPolygonsChange([single]);
  };

  const updatePoint = (pointIndex: number, field: "latitude" | "longitude", value: string) => {
    if (disabled) return;
    const updated = [...activePolygon];
    updated[pointIndex] = { ...updated[pointIndex], [field]: value };
    setPolys([updated]);
  };

  const addPoint = () => {
    if (disabled) return;
    setPolys([[...activePolygon, emptyPoint()]]);
  };

  const deletePoint = (pointIndex: number) => {
    if (disabled) return;
    if (activePolygon.length <= MIN_POLYGON_POINTS) return;
    const next = activePolygon.filter((_, idx) => idx !== pointIndex);
    setPolys([next]);
  };

  const performValidation = async () => {
    setIsValidating(true);
    try {
      const result = await validatePolygons(
        {
          polygons: safePolygons,
          applicationId,
          excludeApplicationIds,
        },
        true
      );
      setValidation(result);
      onValidationChange?.(result);
    } catch (e) {
      const err: ValidationResponse = {
        isValid: false,
        intersections: [],
        errors: [`Validation failed: ${e instanceof Error ? e.message : "Unknown error"}`],
        polygon: null,
      };
      setValidation(err);
      onValidationChange?.(err);
    } finally {
      setIsValidating(false);
    }
  };

  const getBadge = () => {
    if (isValidating) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Validating...
        </Badge>
      );
    }

    if (!validation) {
      const totals = safePolygons.map((p) => countCompletePoints(p));
      const completePolys = totals.filter((n) => n >= MIN_POLYGON_POINTS).length;
      return (
        <Badge variant="outline">
          {completePolys >= 1 ? "Polygon has" : "Needs"} ≥{MIN_POLYGON_POINTS} points
        </Badge>
      );
    }

    return validation.isValid ? (
      <Badge variant="default" className="bg-green-500 text-white flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Valid
      </Badge>
    ) : (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Invalid
      </Badge>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Water Activity Area
          </CardTitle>
          {showValidation && getBadge()}
        </div>
        <div className="text-sm text-muted-foreground">
          Define the polygon with at least <strong>{MIN_POLYGON_POINTS} points</strong> (more points = better accuracy).
          The system validates the polygon is within Rwanda and not duplicated in another application.
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "map")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              Map View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-3">
              {activePolygon.map((pt, i) => (
                <div key={`pt-${i}`} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium">Point {i + 1}</Label>
                  </div>
                  <div className="md:col-span-5">
                    <Label htmlFor={`lat-${i}`} className="text-xs text-muted-foreground">
                      Latitude *
                    </Label>
                    <Input
                      id={`lat-${i}`}
                      type="text"
                      placeholder="e.g., -1.9441"
                      value={String(pt.latitude ?? "")}
                      onChange={(e) => updatePoint(i, "latitude", e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <Label htmlFor={`lng-${i}`} className="text-xs text-muted-foreground">
                      Longitude *
                    </Label>
                    <Input
                      id={`lng-${i}`}
                      type="text"
                      placeholder="e.g., 29.8739"
                      value={String(pt.longitude ?? "")}
                      onChange={(e) => updatePoint(i, "longitude", e.target.value)}
                      disabled={disabled}
                    />
                  </div>

                  {!disabled && activePolygon.length > MIN_POLYGON_POINTS && (
                    <div className="md:col-span-12 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePoint(i)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove point
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!disabled && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addPoint}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add point
                </Button>

                {showValidation && (
                  <Button type="button" variant="outline" size="sm" onClick={performValidation} disabled={isValidating}>
                    {isValidating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Validate polygons
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="map" className="space-y-3">
            <MultiPolygonMap polygons={safePolygons} activePolygonIndex={0} height="400px" />
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Map is view-only. Add/edit points in <strong>Manual Entry</strong>, then check shapes here.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        {/* Validation results */}
        {showValidation && validation && !validation.isValid && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Validation failed</strong>
              <ul className="mt-2 space-y-1">
                {validation.errors.map((err, idx) => (
                  <li key={idx} className="text-sm">
                    • {err}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {showValidation && validation && validation.isValid && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              ✅ <strong>Polygon is valid!</strong>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}




