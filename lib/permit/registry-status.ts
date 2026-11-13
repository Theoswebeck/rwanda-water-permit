/**
 * Status values a registry row can be edited to. OPERATIONAL/EXPIRED are never
 * picked by hand — they are derived from the expiration date — while
 * SUSPENDED/REVOKED/CANCELLED are deliberate overrides that win over the date.
 */
export const REGISTRY_STATUSES = ["OPERATIONAL", "EXPIRED", "SUSPENDED", "REVOKED", "CANCELLED"] as const;
export type RegistryStatus = (typeof REGISTRY_STATUSES)[number];

export const REGISTRY_OVERRIDE_STATUSES: readonly RegistryStatus[] = ["SUSPENDED", "REVOKED", "CANCELLED"];

/** Today as YYYY-MM-DD in local time, so a permit stays valid through its expiry day. */
function todayIso(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Maps any stored status (including legacy spreadsheet text like "RENEWED") to
 * the enum. Overrides are kept; everything else follows the expiration date.
 */
export function deriveRegistryStatus(
  status: string | null | undefined,
  expirationDate: string | null | undefined,
  now: Date = new Date()
): RegistryStatus {
  const s = (status ?? "").toUpperCase();
  if (s.includes("SUSPEND")) return "SUSPENDED";
  if (s.includes("REVOK")) return "REVOKED";
  if (s.includes("CANCEL")) return "CANCELLED";
  const expiry = (expirationDate ?? "").slice(0, 10);
  return expiry && expiry < todayIso(now) ? "EXPIRED" : "OPERATIONAL";
}
