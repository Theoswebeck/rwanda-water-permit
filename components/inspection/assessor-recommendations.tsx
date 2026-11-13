"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardCheck, CheckCircle, Loader2, Save } from "lucide-react";

interface AssessorRecommendationsProps {
  // Requested values (from applicant submission shown in workflow - read-only)
  requestedDurationYears?: number | null;
  requestedVolumeM3?: number | null;

  // Assessor recommended values (editable)
  recommendedDurationYears?: number | null;
  recommendedVolumeM3?: number | null;
  /** Unit the assessor last entered the volume in. The value itself is always m³/year. */
  recommendedVolumeUnit?: VolumeUnit | null;

  // Callbacks for saving changes
  onDurationChange?: (years: number) => Promise<void>;
  /** `volume` is always m³/year; `unit` is what the assessor typed it in. */
  onVolumeChange?: (volume: number, unit: VolumeUnit) => Promise<void>;

  // State flags
  readOnly?: boolean;
  durationSaving?: boolean;
  volumeSaving?: boolean;

  /** When true, show "Surface concession area" labels instead of volume labels. */
  isConcession?: boolean;

  /** When true (District Water Supply), hide the output volume row — volume is per-network. */
  isBulk?: boolean;

  // Groundwater pumping rate (m³/day)
  isGroundwater?: boolean;
  requestedPumpingRateM3Day?: number | null;
  recommendedPumpingRateM3Day?: number | null;
  onPumpingRateSave?: (value: number) => void | Promise<void>;
  pumpingRateSaving?: boolean;
}

export type VolumeUnit = "m3/year" | "m3/day";

/** Read the saved volume unit from an application's `internal_notes`. */
export function assessorVolumeUnit(internalNotes: unknown): VolumeUnit {
  let notes: any = internalNotes;
  if (typeof notes === "string") {
    try { notes = JSON.parse(notes); } catch { notes = null; }
  }
  return notes?._assessorAdjustments?.recommendedVolumeUnit === "m3/day" ? "m3/day" : "m3/year";
}

type ConfirmState =
  | { kind: "none" }
  | { kind: "duration"; nextYears: number }
  | { kind: "volume"; nextVolume: number; nextUnit: VolumeUnit }
  | { kind: "pumpingRate"; nextRate: number };

export function AssessorRecommendations({
  requestedDurationYears,
  requestedVolumeM3,
  recommendedDurationYears,
  recommendedVolumeM3,
  recommendedVolumeUnit,
  onDurationChange,
  onVolumeChange,
  readOnly = false,
  durationSaving = false,
  volumeSaving = false,
  isConcession = false,
  isBulk = false,
  isGroundwater = false,
  requestedPumpingRateM3Day,
  recommendedPumpingRateM3Day,
  onPumpingRateSave,
  pumpingRateSaving = false,
}: AssessorRecommendationsProps) {
  // Draft state — what the user has typed/picked but not yet saved.
  const savedDurationStr = recommendedDurationYears != null ? String(recommendedDurationYears) : "";
  const savedUnit: VolumeUnit = !isConcession && recommendedVolumeUnit === "m3/day" ? "m3/day" : "m3/year";
  const toUnit = (yearly: number, unit: VolumeUnit) =>
    unit === "m3/day" ? Math.round((yearly / 365) * 100) / 100 : yearly;
  const savedVolumeStr = recommendedVolumeM3 != null ? String(toUnit(recommendedVolumeM3, savedUnit)) : "";
  const savedPumpingRateStr = recommendedPumpingRateM3Day != null ? String(recommendedPumpingRateM3Day) : "";

  const [draftDuration, setDraftDuration] = useState<string>(savedDurationStr);
  const [draftVolume, setDraftVolume] = useState<string>(savedVolumeStr);
  const [draftUnit, setDraftUnit] = useState<VolumeUnit>(savedUnit);
  const [draftPumpingRate, setDraftPumpingRate] = useState<string>(savedPumpingRateStr);
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: "none" });

  // When the saved values change (e.g. parent state refresh after a save),
  // re-baseline the drafts so the form stays in sync with the source of truth.
  useEffect(() => {
    setDraftDuration(savedDurationStr);
  }, [savedDurationStr]);
  useEffect(() => {
    setDraftVolume(savedVolumeStr);
    setDraftUnit(savedUnit);
  }, [savedVolumeStr, savedUnit]);
  useEffect(() => {
    setDraftPumpingRate(savedPumpingRateStr);
  }, [savedPumpingRateStr]);

  const formatVolume = (vol: number | null | undefined, unit: VolumeUnit = "m3/year"): string => {
    if (vol == null) return "Not specified";
    if (isConcession) return `${vol.toLocaleString()} ha`;
    return unit === "m3/day"
      ? `${toUnit(vol, unit).toLocaleString()} m³/day`
      : `${vol.toLocaleString()} m³/year`;
  };

  const formatDuration = (years: number | null | undefined): string => {
    if (years == null) return "Not specified";
    return `${years} ${years === 1 ? "year" : "years"}`;
  };

  const formatPumpingRate = (rate: number | null | undefined): string => {
    if (rate == null) return "Not specified";
    return `${rate.toLocaleString()} m³/day`;
  };

  const parsedDraftDuration = (() => {
    const n = parseInt(draftDuration, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  // Always m³/year — a daily entry is multiplied by 365.
  const parsedDraftVolume = (() => {
    const n = parseFloat(draftVolume);
    if (!Number.isFinite(n) || n <= 0) return null;
    return draftUnit === "m3/day" ? Math.round(n * 365 * 100) / 100 : n;
  })();

  const parsedDraftPumpingRate = (() => {
    const n = parseFloat(draftPumpingRate);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const durationDirty =
    parsedDraftDuration != null && parsedDraftDuration !== (recommendedDurationYears ?? null);
  const volumeDirty =
    parsedDraftVolume != null &&
    (draftVolume !== savedVolumeStr || draftUnit !== savedUnit);
  const pumpingRateDirty =
    parsedDraftPumpingRate != null && parsedDraftPumpingRate !== (recommendedPumpingRateM3Day ?? null);

  const requestSaveDuration = () => {
    if (!parsedDraftDuration || !durationDirty) return;
    setConfirm({ kind: "duration", nextYears: parsedDraftDuration });
  };

  const requestSaveVolume = () => {
    if (parsedDraftVolume == null || !volumeDirty) return;
    setConfirm({ kind: "volume", nextVolume: parsedDraftVolume, nextUnit: draftUnit });
  };

  const requestSavePumpingRate = () => {
    if (parsedDraftPumpingRate == null || !pumpingRateDirty) return;
    setConfirm({ kind: "pumpingRate", nextRate: parsedDraftPumpingRate });
  };

  const closeConfirm = () => {
    if (durationSaving || volumeSaving || pumpingRateSaving) return;
    setConfirm({ kind: "none" });
  };

  const performConfirmedSave = async () => {
    if (confirm.kind === "duration") {
      await onDurationChange?.(confirm.nextYears);
    } else if (confirm.kind === "volume") {
      await onVolumeChange?.(confirm.nextVolume, confirm.nextUnit);
    } else if (confirm.kind === "pumpingRate") {
      await onPumpingRateSave?.(confirm.nextRate);
    }
    setConfirm({ kind: "none" });
  };

  const volumeFieldLabel = isConcession ? "Surface Concession Area" : "Water Output Volume";

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-amber-600" />
          Assessor Recommendations
        </CardTitle>
        <CardDescription>
          Compare the applicant's requested values with the assessor's recommended values.
          Changes only take effect after you click <span className="font-medium">Save</span> and confirm.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border bg-white overflow-hidden">
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

          {/* Duration row */}
          <div className="grid grid-cols-3 border-b">
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">Water Permit Duration</Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatDuration(requestedDurationYears)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2 flex-wrap">
              {readOnly || !onDurationChange ? (
                <span className="text-sm font-medium">
                  {formatDuration(recommendedDurationYears)}
                </span>
              ) : (
                <>
                  <Select
                    value={draftDuration}
                    onValueChange={(value) => setDraftDuration(value)}
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
                  <Button
                    type="button"
                    size="sm"
                    onClick={requestSaveDuration}
                    disabled={!durationDirty || durationSaving}
                  >
                    {durationSaving ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save
                  </Button>
                  {!durationSaving && !durationDirty && recommendedDurationYears != null && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Volume row — hidden for District Water Supply (volume is captured per-network) */}
          {!isBulk && (
          <div className={`grid grid-cols-3${isGroundwater ? " border-b" : ""}`}>
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">{volumeFieldLabel}</Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatVolume(requestedVolumeM3, savedUnit)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2 flex-wrap">
              {readOnly || !onVolumeChange ? (
                <span className="text-sm font-medium">
                  {formatVolume(recommendedVolumeM3, savedUnit)}
                </span>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftVolume}
                      onChange={(e) => setDraftVolume(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          requestSaveVolume();
                        }
                      }}
                      placeholder={isConcession ? "Enter area" : "Enter volume"}
                      className="w-32 bg-white"
                      disabled={volumeSaving}
                    />
                    {isConcession ? (
                      <span className="text-sm text-muted-foreground">ha</span>
                    ) : (
                      <Select
                        value={draftUnit}
                        onValueChange={(u) => {
                          // Convert what is typed so switching unit keeps the same volume.
                          const n = parseFloat(draftVolume);
                          if (Number.isFinite(n) && n > 0) {
                            const yearly = draftUnit === "m3/day" ? n * 365 : n;
                            setDraftVolume(String(toUnit(yearly, u as VolumeUnit)));
                          }
                          setDraftUnit(u as VolumeUnit);
                        }}
                        disabled={volumeSaving}
                      >
                        <SelectTrigger className="w-28 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="m3/year">m³/year</SelectItem>
                          <SelectItem value="m3/day">m³/day</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={requestSaveVolume}
                    disabled={!volumeDirty || volumeSaving}
                  >
                    {volumeSaving ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save
                  </Button>
                  {!volumeSaving && !volumeDirty && recommendedVolumeM3 != null && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </>
              )}
            </div>
          </div>
          )}

          {/* Pumping rate row — shown only for groundwater applications */}
          {isGroundwater && (
          <div className="grid grid-cols-3">
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">Pumping rate (m³/day)</Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatPumpingRate(requestedPumpingRateM3Day)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2 flex-wrap">
              {readOnly || !onPumpingRateSave ? (
                <span className="text-sm font-medium">
                  {formatPumpingRate(recommendedPumpingRateM3Day)}
                </span>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftPumpingRate}
                      onChange={(e) => setDraftPumpingRate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          requestSavePumpingRate();
                        }
                      }}
                      placeholder="Enter rate"
                      className="w-32 bg-white"
                      disabled={pumpingRateSaving}
                    />
                    <span className="text-sm text-muted-foreground">m³/day</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={requestSavePumpingRate}
                    disabled={!pumpingRateDirty || pumpingRateSaving}
                  >
                    {pumpingRateSaving ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save
                  </Button>
                  {!pumpingRateSaving && !pumpingRateDirty && recommendedPumpingRateM3Day != null && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </>
              )}
            </div>
          </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          <strong>Note:</strong> The "Requested" column shows values from the applicant's current submission (read-only).
          The "Assessor Recommended" values will be used when generating the permit and terms & conditions.
        </p>
      </CardContent>

      <AlertDialog
        open={confirm.kind !== "none"}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm.kind === "duration"
                ? "Update permit duration?"
                : confirm.kind === "volume"
                  ? `Update ${volumeFieldLabel.toLowerCase()}?`
                  : confirm.kind === "pumpingRate"
                    ? "Update pumping rate?"
                    : "Confirm change"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This value will be used in the permit and terms & conditions, and the
              preview will refresh after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm.kind !== "none" && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {confirm.kind === "duration" ? (
                <p>
                  <span className="text-muted-foreground line-through mr-2">
                    {formatDuration(recommendedDurationYears)}
                  </span>
                  <span className="font-medium">→ {formatDuration(confirm.nextYears)}</span>
                </p>
              ) : confirm.kind === "volume" ? (
                <p>
                  <span className="text-muted-foreground line-through mr-2">
                    {formatVolume(recommendedVolumeM3, savedUnit)}
                  </span>
                  <span className="font-medium">→ {formatVolume(confirm.nextVolume, confirm.nextUnit)}</span>
                </p>
              ) : (
                <p>
                  <span className="text-muted-foreground line-through mr-2">
                    {formatPumpingRate(recommendedPumpingRateM3Day)}
                  </span>
                  <span className="font-medium">→ {formatPumpingRate(confirm.nextRate)}</span>
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={durationSaving || volumeSaving || pumpingRateSaving}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={durationSaving || volumeSaving || pumpingRateSaving}
              onClick={async (e) => {
                e.preventDefault();
                await performConfirmedSave();
              }}
            >
              {durationSaving || volumeSaving || pumpingRateSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Yes, save"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
