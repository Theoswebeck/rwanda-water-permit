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

interface DateRow {
  label: string;
  value: string | null;
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

  const rows: DateRow[] = [
    { label: "Submitted", value: fmtTimestamp(submittedAt) },
    { label: "Last activity", value: fmtTimestamp(latestActivitySource?.toISOString() ?? null) },
  ].filter((r) => r.value !== null);

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="space-y-0.5 min-w-[110px]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline gap-1.5 text-[11px] leading-tight">
          <span className="text-muted-foreground/70 font-medium w-[52px] shrink-0 text-right">
            {r.label}
          </span>
          <span className="text-slate-700 dark:text-slate-300 tabular-nums">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
