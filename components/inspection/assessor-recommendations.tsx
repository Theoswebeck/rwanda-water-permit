"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardCheck, CheckCircle, Loader2 } from "lucide-react";

interface AssessorRecommendationsProps {
  // Requested values (from applicant submission shown in workflow - read-only)
  requestedDurationYears?: number | null;
  requestedVolumeM3?: number | null;
  
  // Assessor recommended values (editable)
  recommendedDurationYears?: number | null;
  recommendedVolumeM3?: number | null;
  
  // Callbacks for saving changes
  onDurationChange?: (years: number) => Promise<void>;
  onVolumeChange?: (volume: number) => Promise<void>;
  
  // State flags
  readOnly?: boolean;
  durationSaving?: boolean;
  volumeSaving?: boolean;

  /** When true, show "Surface concession area" labels instead of volume labels. */
  isConcession?: boolean;
}

export function AssessorRecommendations({
  requestedDurationYears,
  requestedVolumeM3,
  recommendedDurationYears,
  recommendedVolumeM3,
  onDurationChange,
  onVolumeChange,
  readOnly = false,
  durationSaving = false,
  volumeSaving = false,
  isConcession = false,
}: AssessorRecommendationsProps) {
  const [localVolume, setLocalVolume] = useState<string>(
    recommendedVolumeM3 != null ? String(recommendedVolumeM3) : ""
  );

  const formatVolume = (vol: number | null | undefined): string => {
    if (vol == null) return "Not specified";
    return isConcession
      ? `${vol.toLocaleString()} ha`
      : `${vol.toLocaleString()} m³/year`;
  };

  // Format duration
  const formatDuration = (years: number | null | undefined): string => {
    if (years == null) return "Not specified";
    return `${years} ${years === 1 ? "year" : "years"}`;
  };

  const handleVolumeBlur = async () => {
    if (readOnly || !onVolumeChange) return;
    const parsed = parseFloat(localVolume);
    if (!isNaN(parsed) && parsed > 0) {
      await onVolumeChange(parsed);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-amber-600" />
          Assessor Recommendations
        </CardTitle>
        <CardDescription>
          Compare the applicant's requested values with the assessor's recommended values.
          The recommended values will be used for the permit and terms & conditions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Two-column comparison table */}
        <div className="rounded-lg border bg-white overflow-hidden">
          {/* Header Row */}
          <div className="grid grid-cols-3 border-b bg-muted/50">
            <div className="px-4 py-3 font-medium text-sm text-muted-foreground">
              Parameter
            </div>
            <div className="px-4 py-3 font-medium text-sm text-center border-l">
              Requested
            </div>
            <div className="px-4 py-3 font-medium text-sm text-center border-l">
              Assessor Recommended
            </div>
          </div>

          {/* Row 1: Current requested permit duration */}
          <div className="grid grid-cols-3 border-b">
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">
                Water Permit Duration
              </Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatDuration(requestedDurationYears)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2">
              {readOnly ? (
                <span className="text-sm font-medium">
                  {formatDuration(recommendedDurationYears)}
                </span>
              ) : (
                <>
                  <Select
                    value={recommendedDurationYears?.toString() || ""}
                    onValueChange={(value) => {
                      const newLength = parseInt(value, 10);
                      onDurationChange?.(newLength);
                    }}
                    disabled={durationSaving}
                  >
                    <SelectTrigger className="w-32 bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year} {year === 1 ? "year" : "years"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {durationSaving && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!durationSaving && recommendedDurationYears && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: Current requested water output volume / surface concession area */}
          <div className="grid grid-cols-3">
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">
                {isConcession ? "Surface Concession Area" : "Water Output Volume"}
              </Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatVolume(requestedVolumeM3)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2">
              {readOnly ? (
                <span className="text-sm font-medium">
                  {formatVolume(recommendedVolumeM3)}
                </span>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={localVolume}
                      onChange={(e) => setLocalVolume(e.target.value)}
                      onBlur={handleVolumeBlur}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleVolumeBlur();
                        }
                      }}
                      placeholder={isConcession ? "Enter area" : "Enter volume"}
                      className="w-32 bg-white"
                      disabled={volumeSaving}
                    />
                    <span className="text-sm text-muted-foreground">{isConcession ? "ha" : "m³/year"}</span>
                  </div>
                  {volumeSaving && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!volumeSaving && recommendedVolumeM3 != null && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </>
              )}
            </div>
          </div>

        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground mt-3">
          <strong>Note:</strong> The "Requested" column shows values from the applicant's current submission (read-only).
          The "Assessor Recommended" values will be used when generating the permit and terms & conditions.
        </p>
      </CardContent>
    </Card>
  );
}
