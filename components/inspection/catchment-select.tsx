"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEVEL1_OPTIONS,
  findCatchmentByLevel1,
  getLevel2Options,
  isValidLevel2,
} from "@/lib/rwanda-catchments";

/**
 * Cascading Level I → Level II catchment selector backed by the official RWB
 * catchment list (`lib/rwanda-catchments.ts`).
 *
 * Emits a single atomic `onChange({ level1, level2 })` rather than two separate
 * callbacks: the parent writes both keys into `locked_field_overrides` in one
 * update, so the cascade reset (clearing a now-invalid Level II when Level I
 * changes) can't be clobbered by a stale render snapshot.
 *
 * Renders as two grid cells (Level I, Level II) to slot into the surrounding
 * `md:grid-cols-3` layout, matching the fields it replaces.
 */
export function CatchmentSelect({
  level1Value,
  level2Value,
  disabled,
  onChange,
}: {
  level1Value: string;
  level2Value: string;
  disabled: boolean;
  onChange: (next: { level1: string; level2: string }) => void;
}) {
  const level1 = (level1Value ?? "").trim();
  const level2 = (level2Value ?? "").trim();

  // Preserve a legacy/unknown Level I value so it isn't silently dropped.
  const level1IsLegacy = level1 !== "" && !findCatchmentByLevel1(level1);

  const level2Options = getLevel2Options(level1);
  const level2IsLegacy = level2 !== "" && !isValidLevel2(level1, level2);

  const handleLevel1 = (next: string) => {
    // Keep the current Level II only if it still belongs to the new Level I.
    const nextLevel2 = isValidLevel2(next, level2) ? level2 : "";
    onChange({ level1: next, level2: nextLevel2 });
  };

  const handleLevel2 = (next: string) => {
    onChange({ level1, level2: next });
  };

  const level2HelperText = !level1
    ? "Select a Level I catchment first"
    : level2Options.length === 0 && !level2IsLegacy
      ? "No Level II sub-catchments for this catchment"
      : null;

  const level2Disabled =
    disabled || (level2Options.length === 0 && !level2IsLegacy);

  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm">Level I Catchment</Label>
        <Select
          value={level1 || undefined}
          disabled={disabled}
          onValueChange={handleLevel1}
        >
          <SelectTrigger className="h-11 border-slate-200 dark:border-slate-800">
            <SelectValue placeholder="Select Level I catchment…" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL1_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
            {level1IsLegacy && (
              <SelectItem key={level1} value={level1}>
                {level1} (current)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Level II Catchment</Label>
        <Select
          value={level2 || undefined}
          disabled={level2Disabled}
          onValueChange={handleLevel2}
        >
          <SelectTrigger className="h-11 border-slate-200 dark:border-slate-800">
            <SelectValue placeholder="Select Level II catchment…" />
          </SelectTrigger>
          <SelectContent>
            {level2Options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
            {level2IsLegacy && (
              <SelectItem key={level2} value={level2}>
                {level2} (current)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {level2HelperText && (
          <p className="text-xs text-muted-foreground">{level2HelperText}</p>
        )}
      </div>
    </>
  );
}
