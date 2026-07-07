/**
 * Resolve the ORIGINAL permit number for a renewal / modification / transfer
 * application. The number can live under several keys depending on whether the
 * original was a linked digital permit or a manually-captured / registry
 * permit, so we check them in priority order. This is the single source of
 * truth used by the permit preview PDF, the document editor, and the contract
 * (preview + editor) so every surface shows the same number.
 *
 * Pure (reads only `notes`) — safe to run server-side or client-side.
 */
export function resolveOriginalPermitNumber(
  notes: Record<string, any> | null | undefined,
): string | null {
  const candidates: unknown[] = [
    notes?.originalPermitNumber,
    notes?.permitReference?.normalizedPermitNumber,
    notes?.permitReference?.inputPermitNumber,
    notes?.permitReference?.registrySnapshot?.permit_number,
    notes?.transferFormData?.permitNumber,
    notes?.transferFormData?.originalPermitNumber,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Permit-preview flavour: falls back to a year-stamped placeholder when the
 * original number can't be resolved (a genuinely new permit whose number is
 * only assigned by the DB trigger at issuance).
 */
export function resolvePreviewPermitNumber(
  notes: Record<string, any> | null | undefined,
): string {
  const original = resolveOriginalPermitNumber(notes);
  if (original) return original;

  const now = new Date();
  // Africa/Kigali so the year matches what the DB trigger would use.
  const year = new Date(
    now.toLocaleString("en-US", { timeZone: "Africa/Kigali" }),
  ).getFullYear();
  return `XXXX/RWB/${year}`;
}
