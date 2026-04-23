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

type ConfirmState =
  | { kind: "none" }
  | { kind: "duration"; nextYears: number }
  | { kind: "volume"; nextVolume: number };

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
  // Draft state — what the user has typed/picked but not yet saved.
  const savedDurationStr = recommendedDurationYears != null ? String(recommendedDurationYears) : "";
  const savedVolumeStr = recommendedVolumeM3 != null ? String(recommendedVolumeM3) : "";

  const [draftDuration, setDraftDuration] = useState<string>(savedDurationStr);
  const [draftVolume, setDraftVolume] = useState<string>(savedVolumeStr);
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: "none" });

  // When the saved values change (e.g. parent state refresh after a save),
  // re-baseline the drafts so the form stays in sync with the source of truth.
  useEffect(() => {
    setDraftDuration(savedDurationStr);
  }, [savedDurationStr]);
  useEffect(() => {
    setDraftVolume(savedVolumeStr);
  }, [savedVolumeStr]);

  const formatVolume = (vol: number | null | undefined): string => {
    if (vol == null) return "Not specified";
    return isConcession
      ? `${vol.toLocaleString()} ha`
      : `${vol.toLocaleString()} m³/year`;
  };

  const formatDuration = (years: number | null | undefined): string => {
    if (years == null) return "Not specified";
    return `${years} ${years === 1 ? "year" : "years"}`;
  };

  const parsedDraftDuration = (() => {
    const n = parseInt(draftDuration, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const parsedDraftVolume = (() => {
    const n = parseFloat(draftVolume);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const durationDirty =
    parsedDraftDuration != null && parsedDraftDuration !== (recommendedDurationYears ?? null);
  const volumeDirty =
    parsedDraftVolume != null && parsedDraftVolume !== (recommendedVolumeM3 ?? null);

  const requestSaveDuration = () => {
    if (!parsedDraftDuration || !durationDirty) return;
    setConfirm({ kind: "duration", nextYears: parsedDraftDuration });
  };

  const requestSaveVolume = () => {
    if (parsedDraftVolume == null || !volumeDirty) return;
    setConfirm({ kind: "volume", nextVolume: parsedDraftVolume });
  };

  const closeConfirm = () => {
    if (durationSaving || volumeSaving) return;
    setConfirm({ kind: "none" });
  };

  const performConfirmedSave = async () => {
    if (confirm.kind === "duration") {
      await onDurationChange?.(confirm.nextYears);
    } else if (confirm.kind === "volume") {
      await onVolumeChange?.(confirm.nextVolume);
    }
    setConfirm({ kind: "none" });
  };

  const volumeUnitLabel = isConcession ? "ha" : "m³/year";
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
              {readOnly ? (
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

          {/* Volume row */}
          <div className="grid grid-cols-3">
            <div className="px-4 py-4 flex items-center">
              <Label className="text-sm font-medium">{volumeFieldLabel}</Label>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l bg-muted/20">
              <span className="text-sm text-muted-foreground">
                {formatVolume(requestedVolumeM3)}
              </span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-l gap-2 flex-wrap">
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
                    <span className="text-sm text-muted-foreground">{volumeUnitLabel}</span>
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
              ) : (
                <p>
                  <span className="text-muted-foreground line-through mr-2">
                    {formatVolume(recommendedVolumeM3)}
                  </span>
                  <span className="font-medium">→ {formatVolume(confirm.nextVolume)}</span>
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={durationSaving || volumeSaving}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={durationSaving || volumeSaving}
              onClick={async (e) => {
                e.preventDefault();
                await performConfirmedSave();
              }}
            >
              {durationSaving || volumeSaving ? (
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
