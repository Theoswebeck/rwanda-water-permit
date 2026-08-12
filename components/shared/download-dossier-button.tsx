"use client";

import { useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fetches the staff dossier ZIP for an application and saves it locally.
 * Shared by the button below and the approved-application actions menu.
 * Missing files never fail the download — the server skips them and lists
 * them in the archive's MANIFEST.txt.
 */
export async function downloadDossierZip(
  applicationId: string,
  applicationNumber?: string | null,
): Promise<void> {
  const res = await fetch(
    `/api/staff/applications/${encodeURIComponent(applicationId)}/dossier`,
    { credentials: "include" },
  );
  if (!res.ok) {
    let message = "Failed to download the dossier ZIP.";
    try {
      const json = (await res.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dossier-${(applicationNumber || applicationId).replace(/[\/\s]+/g, "_")}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type DownloadDossierButtonProps = {
  applicationId: string;
  applicationNumber?: string | null;
  className?: string;
};

/**
 * "Download dossier (ZIP)" — full application archive for off-system
 * archiving (RWB points 4 & 8): submitted documents, assessment report,
 * permit + contract PDFs and approved inspection reports, with a
 * MANIFEST.txt of included/missing items.
 */
export function DownloadDossierButton({
  applicationId,
  applicationNumber,
  className,
}: DownloadDossierButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadDossierZip(applicationId, applicationNumber);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to download the dossier ZIP.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={busy}
      className={className ? `gap-2 ${className}` : "gap-2"}
      title="Download every submitted document plus the assessment report, permit, contract and approved inspection reports as one ZIP"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
      Download dossier (ZIP)
    </Button>
  );
}
