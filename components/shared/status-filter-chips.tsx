"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChipPriority = "primary" | "secondary" | "downstream";

export interface StatusChipDef {
  /** Unique identifier for this chip. */
  id: string;
  /** Short label shown on the chip. */
  label: string;
  /** Application statuses this chip filters by. */
  statuses: string[];
  /** Visual priority group. Primary = my queue, secondary = adjacent stage, downstream = later stages. */
  priority: ChipPriority;
}

export interface StatusFilterChipsProps {
  /** Chip definitions — order determines display order. */
  chips: StatusChipDef[];
  /** The ID of the currently active chip (controlled). */
  activeChipId: string;
  /** Callback when a chip is clicked. */
  onChipChange: (chipId: string) => void;
  /** Full applications array (used to compute counts). Must have a `.status` field. */
  applications: Array<{ status: string }>;
  /** Optional className for the outer container. */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusFilterChips({
  chips,
  activeChipId,
  onChipChange,
  applications,
  className,
}: StatusFilterChipsProps) {
  // Compute counts per chip from the full applications list
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const chip of chips) {
      map[chip.id] = chip.statuses.length === 0 ? applications.length : 0;
    }
    for (const app of applications) {
      for (const chip of chips) {
        if (chip.statuses.length === 0) {
          continue;
        }
        if (chip.statuses.includes(app.status)) {
          map[chip.id]++;
        }
      }
    }
    return map;
  }, [chips, applications]);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        {chips.map((chip) => {
          const isActive = chip.id === activeChipId;
          const count = counts[chip.id] ?? 0;

          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChipChange(chip.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 border select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                // Active state
                isActive && "bg-primary text-primary-foreground border-primary shadow-sm",
                // Inactive states by priority
                !isActive && chip.priority === "primary" &&
                  "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400",
                !isActive && chip.priority === "secondary" &&
                  "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300",
                !isActive && chip.priority === "downstream" &&
                  "bg-transparent border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300",
              )}
            >
              {chip.label}
              <Badge
                variant="secondary"
                className={cn(
                  "h-5.5 min-w-[22px] px-1.5 text-[11px] font-semibold rounded-full tabular-nums",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : count > 0
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600",
                )}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
