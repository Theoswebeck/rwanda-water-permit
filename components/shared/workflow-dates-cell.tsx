"use client";

import type { WorkflowDates } from "@/lib/workflow-dates";

/**
 * Compact table cell that displays key workflow dates for an application.
 * Shows dates progressively -- only the ones that exist.
 *
 * Usage:
 *   <WorkflowDatesCell dates={workflowDatesMap[app.id]} />
 */

interface WorkflowDatesCellProps {
  dates?: WorkflowDates | null;
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "2-digit",
};

function fmtShort(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", DATE_FMT);
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

  const rows: DateRow[] = [
    { label: "Applied", value: fmtShort(dates.appliedAt) },
    { label: "Assigned", value: fmtShort(dates.assignedAt) },
    { label: "Assessed", value: fmtShort(dates.assessedAt) },
    { label: "Reviewed", value: fmtShort(dates.reviewedAt) },
    { label: "Verified", value: fmtShort(dates.verifiedAt) },
    { label: "Approved", value: fmtShort(dates.approvedAt) },
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
