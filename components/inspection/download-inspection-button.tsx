"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Download inspection (PDF)" — the approved inspection rendered as a
 * printable RWB report by /api/staff/inspections/[id]/report.
 *
 * Renders nothing until the inspection is approved: the route refuses
 * anything else (409), so offering the button earlier would only produce a
 * dead end. Shared by the review / assessment / approver / verification
 * inspection pages, which are otherwise near-identical copies.
 *
 * Plain link rather than a fetch + blob: the route replies with
 * Content-Disposition: attachment, so the browser saves the file without
 * navigating away from the page.
 */
export function DownloadInspectionButton({
  inspectionId,
  workflowStatus,
  className,
}: {
  inspectionId?: string | null;
  workflowStatus?: string | null;
  className?: string;
}) {
  if (!inspectionId || workflowStatus !== "approved") return null;

  return (
    <Button asChild variant="outline" className={className}>
      <a
        href={`/api/staff/inspections/${encodeURIComponent(inspectionId)}/report`}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Download inspection
      </a>
    </Button>
  );
}
