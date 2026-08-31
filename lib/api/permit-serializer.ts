import type { PublicPermitRecord } from "@/lib/permit/public-permit-query";
import {
  derivePermitActivity,
  derivePermitHolderName,
  derivePermitLocation,
  getCanonicalIssueDate,
  isConcessionPermitRecord,
  parseInternalNotes,
  permitStatusLabel,
} from "@/lib/permit/permit-display";

/**
 * Whitelisted JSON serialization of a public permit record for the /api/v1
 * agency API (design §4.4).
 *
 * findPublicPermitByNumber() returns the FULL application and applicant rows
 * (contacts, emails, notes...). The API must never forward those raw — every
 * field below is picked explicitly. Display values come from the same
 * lib/permit/permit-display.ts derivations the public QR-verification page
 * uses, so the API and the page can never disagree.
 *
 * Deactivated permits (suspended/revoked — a disabled test permit, say) are
 * public as *statuses* but not as *records*, mirroring the QR page's
 * "inactive" notice: only isPublicStatusVisible() records expose details.
 */

const HIDDEN_STATUSES = new Set(["suspended", "revoked"]);

export function isPublicStatusVisible(status: string): boolean {
  return !HIDDEN_STATUSES.has(status);
}

export function isPermitOperationallyValid(status: string): boolean {
  return status === "active" || status === "expiring_soon";
}

export type ApiPermit = {
  permit_number: string;
  status: string;
  status_label: string;
  valid: boolean;
  permit_type: "abstraction" | "concession";
  holder_name: string | null;
  activity: string | null;
  water_source: string | null;
  purpose: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  water_allowance: string | null;
  allowance_unit: string | null;
  location: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  issuing_authority: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  parent_permit_number: string | null;
  child_permit_number: string | null;
};

export function serializeApiPermit(
  permit: PublicPermitRecord,
  opts?: { includeCoordinates?: boolean }
): ApiPermit {
  const detailsVisible = isPublicStatusVisible(permit.status);
  const internalNotes = parseInternalNotes(
    (permit.application as Record<string, unknown> | null)?.internal_notes
  );
  const app = permit.application as Record<string, unknown> | null;
  const issued = getCanonicalIssueDate(permit);

  const pick = (key: string): string | null => {
    if (!detailsVisible) return null;
    const v = app?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const lat = typeof permit.latitude === "number" ? permit.latitude : null;
  const lng = typeof permit.longitude === "number" ? permit.longitude : null;

  return {
    permit_number: permit.permit_number,
    status: permit.status,
    status_label: permitStatusLabel(permit.status),
    valid: isPermitOperationallyValid(permit.status),
    permit_type: isConcessionPermitRecord(permit) ? "concession" : "abstraction",
    holder_name: detailsVisible ? derivePermitHolderName(permit) : null,
    activity: detailsVisible ? derivePermitActivity(permit, internalNotes) : null,
    water_source: detailsVisible ? toLabel(permit.water_source) : null,
    purpose: detailsVisible ? toLabel(permit.purpose) : null,
    issued_date: detailsVisible ? issued : null,
    expiry_date: detailsVisible ? (permit.expiry_date ?? null) : null,
    water_allowance: detailsVisible ? strOrNull(permit.water_allowance) : null,
    allowance_unit: detailsVisible ? strOrNull(permit.allowance_unit) : null,
    location: detailsVisible ? derivePermitLocation(permit, internalNotes) : null,
    province: pick("province"),
    district: pick("district"),
    sector: pick("sector"),
    issuing_authority: detailsVisible ? strOrNull(permit.issuing_authority) : null,
    latitude: opts?.includeCoordinates ? lat : null,
    longitude: opts?.includeCoordinates ? lng : null,
    source: permit.source,
    parent_permit_number: null,
    child_permit_number: detailsVisible ? (permit.child_permit_number ?? null) : null,
  };
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** DB enums (`water_source`, `purpose`) are snake_case; label them for consumers. */
function toLabel(v: unknown): string | null {
  const s = strOrNull(v);
  return s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}
