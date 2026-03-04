"use client";

import type { WorkflowDates } from "@/lib/workflow-dates";

/**
 * Compact staff table cell that shows only submission timestamp.
 */

interface WorkflowDatesCellProps {
  dates?: WorkflowDates | null;
}

const TIMESTAMP_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function fmtTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-GB", TIMESTAMP_FMT);
  } catch {
    return null;
  }
}

export function WorkflowDatesCell({ dates }: WorkflowDatesCellProps) {
  if (!dates) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  const submittedAt = dates.appliedAt ?? null;
  const value = fmtTimestamp(submittedAt);
  if (!value) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-tight text-slate-700 dark:text-slate-300 tabular-nums">
        {value}
      </div>
    </div>
  );
}
