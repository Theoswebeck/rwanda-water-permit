"use client";

import type { WorkflowDates } from "@/lib/workflow-dates";

/**
 * Compact staff table cell that shows the core timeline points:
 * - Submitted timestamp
 * - Last activity timestamp
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
  const latestActivitySource = [
    dates.approvedAt,
    dates.verifiedAt,
    dates.reviewedAt,
    dates.assessedAt,
    dates.assignedAt,
    dates.appliedAt,
  ]
    .map((iso) => (iso ? new Date(iso) : null))
    .filter((d): d is Date => d !== null && Number.isFinite(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // Avoid rendering duplicate timestamps when submission is also latest activity.
  const rows = Array.from(
    new Set(
      [
        fmtTimestamp(submittedAt),
        fmtTimestamp(latestActivitySource?.toISOString() ?? null),
      ].filter((value): value is string => value !== null)
    )
  );

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="space-y-0.5 min-w-0">
      {rows.map((value, idx) => (
        <div key={`${value}-${idx}`} className="text-[11px] leading-tight text-slate-700 dark:text-slate-300 tabular-nums">
          {value}
        </div>
      ))}
    </div>
  );
}
