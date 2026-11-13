// Shared derivation logic for the public permit pages:
//   app/permit/view/[...permitNumber]/page.tsx  (verification page)
//   app/permit/map/[...permitNumber]/page.tsx   (printable concession boundary map)
//
// Both pages must present identical values for the same permit (holder,
// location, activity, concession area, dates, concession classification and
// boundary polygons), so every cascade lives here exactly once. If you need
// one of these values on another surface, import it from here — do not copy
// the cascade.

import type { PublicPermitRecord } from "@/lib/permit/public-permit-query";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { getEffectiveInternalNotes } from "@/lib/document-overrides";
import { CONCESSION_PURPOSE_HINTS, isConcessionApplication } from "@/lib/permit-variant";
import {
  geometryToCoordinatePolygons,
  polygonsToGeoJSON,
  getPolygonArea,
  type CoordinatePoint,
} from "@/lib/geoUtils";

/**
 * Formats a permit date for display. Date-only values (YYYY-MM-DD) are
 * interpreted in the viewer's local timezone; anything unparseable → "N/A".
 */
export function formatPermitDate(dateString: string): string {
  const raw = dateString.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Effective internal notes for public rendering: starts from the parsed
 * `internal_notes` JSON, then flattens the assessor's `document_overrides.values`
 * onto the top-level keys (e.g. `waterSourceVillage`, `nameSourceWater`,
 * `intendedActivities`). Returns `null` for empty/unparseable input so callers
 * can keep their existing null-checks.
 *
 * `_assessorAdjustments` (recommendedVolumeM3, permitLengthYears) is preserved
 * intact under that key — read it directly from the returned object.
 */
export function parseInternalNotes(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const effective = getEffectiveInternalNotes(value);
  if (!effective || typeof effective !== "object") return null;
  return Object.keys(effective).length > 0 ? effective : null;
}

/**
 * Mirrors `lib/permit/resolve-issue-date.ts`: `permits.issued_date` is the
 * locked legal value once the permit has been issued. Before that
 * (registry-only permits, or a permit row that somehow exists without an
 * issued_date) we fall back to `applications.approved_at` — the moment the
 * Director General signed the application, which is the contractual effective
 * date. We do NOT fall back to `terms_accepted_at` because the user can delay
 * clicking accept arbitrarily long after approval.
 */
export function getCanonicalIssueDate(permit: PublicPermitRecord): string | null {
  const application = permit.application;
  const issuedDate = typeof permit.issued_date === "string" ? permit.issued_date.trim() : "";
  if (issuedDate) return issuedDate;
  const approvedAt = typeof application?.approved_at === "string" ? application.approved_at.trim() : "";
  return approvedAt || null;
}

/** Publicly visible status label (suspended/revoked are gated before display). */
export function permitStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "expiring_soon":
      return "Expiring soon";
    default:
      return status;
  }
}

/** Permit holder: registry `permit_holder`, else applicant name/company. */
export function derivePermitHolderName(permit: PublicPermitRecord): string {
  if (permit.source === "permit_registry") {
    return typeof permit.permit_holder === "string" && permit.permit_holder.trim()
      ? permit.permit_holder.trim()
      : "N/A";
  }
  const a = (permit.application?.applicant ?? null) as Record<string, unknown> | null;
  if (!a) return "N/A";
  if (a.account_type === "individual") {
    return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "N/A";
  }
  return typeof a.company_name === "string" && a.company_name ? a.company_name : "N/A";
}

/**
 * Location string. Registry permits use their free-text `registry_location`.
 * System permits build "Village, Cell, Sector, District, Province" (bulk
 * permits: "District, Province"), with any assessor `document_overrides`
 * (flattened onto `internalNotes` by parseInternalNotes) winning over the
 * application columns.
 */
export function derivePermitLocation(
  permit: PublicPermitRecord,
  internalNotes: Record<string, unknown> | null
): string {
  if (permit.source === "permit_registry") {
    return typeof permit.registry_location === "string" && permit.registry_location.trim()
      ? permit.registry_location.trim()
      : "N/A";
  }
  const app = permit.application;
  if (!app) return "N/A";

  const isBulk = !!app.is_bulk;
  const parts = isBulk
    ? [
        internalNotes?.waterSourceDistrict ?? app.district,
        internalNotes?.waterSourceProvince ?? app.province,
      ].filter(Boolean)
    : [
        internalNotes?.waterSourceVillage ?? app.village,
        internalNotes?.waterSourceCell ?? app.cell,
        internalNotes?.waterSourceSector ?? app.sector,
        internalNotes?.waterSourceDistrict ?? app.district,
        internalNotes?.waterSourceProvince ?? app.province,
      ].filter(Boolean);
  return parts.length ? parts.join(", ") : "N/A";
}

/**
 * Primary intended water activity, as a display label. Cascade: assessor
 * override (`internalNotes.intendedActivities`, flattened by parseInternalNotes
 * so the assessor's edit wins) → application `intended_activities` → transfer
 * form data → application `water_purpose` → permit `purpose`.
 */
export function derivePermitActivity(
  permit: PublicPermitRecord,
  internalNotes: Record<string, unknown> | null
): string {
  const application = permit.application;

  const notesActivitiesRaw = internalNotes?.intendedActivities;
  const overrideActivities = Array.isArray(notesActivitiesRaw)
    ? (notesActivitiesRaw as unknown[])
        .filter((activity): activity is string => typeof activity === "string")
        .map((activity) => activity.trim())
        .filter((activity) => activity.length > 0)
    : [];

  const appActivitiesRaw = application?.intended_activities;
  const intendedActivities = overrideActivities.length
    ? overrideActivities
    : Array.isArray(appActivitiesRaw)
      ? (appActivitiesRaw as unknown[])
          .filter((activity): activity is string => typeof activity === "string")
          .map((activity) => activity.trim())
          .filter((activity) => activity.length > 0)
      : [];

  const transferFormData = (internalNotes?.transferFormData ?? null) as
    | Record<string, unknown>
    | null;
  const transferActivity =
    !intendedActivities.length && typeof transferFormData?.waterPurpose === "string"
      ? transferFormData.waterPurpose
      : "";

  const appWaterPurpose =
    typeof application?.water_purpose === "string" ? application.water_purpose.trim() : "";
  const permitPurpose = typeof permit.purpose === "string" ? permit.purpose.trim() : "";
  const primaryActivity = intendedActivities[0] || transferActivity || appWaterPurpose || permitPurpose;

  return primaryActivity ? getActivityLabel(primaryActivity) : "N/A";
}

/**
 * Recorded surface concession area (hectares) — the cascade behind both the
 * view page's "Surface concession area" card and the printable map legend.
 *
 * Note: the assessor recommendations UI reuses `recommendedVolumeM3` as the
 * payload key even when editing a concession permit's surface area in hectares
 * (see components/inspection/assessor-recommendations.tsx). For a concession
 * permit, treat that number as hectares.
 */
export function deriveConcessionAreaValue(
  permit: PublicPermitRecord,
  internalNotes: Record<string, unknown> | null,
  assessorAdjustments: Record<string, unknown> | null
): string {
  const application = permit.application;

  const assessorArea = parsePositiveNumber(assessorAdjustments?.recommendedVolumeM3);
  if (assessorArea) return `${assessorArea.toLocaleString()} ha`;

  // The assessor adjusted the boundary but did not type an explicit area: derive
  // it from that boundary, so this value describes the same polygon the map
  // draws rather than the applicant's originally declared hectares.
  const assessorPolygonArea = assessorPolygonAreaHectares(assessorAdjustments);
  if (assessorPolygonArea) return `${assessorPolygonArea.toLocaleString()} ha`;

  const dbArea = parsePositiveNumber(application?.concession_area);
  if (dbArea) return `${dbArea.toLocaleString()} ha`;

  const notesArea = parsePositiveNumber(internalNotes?.concessionArea);
  if (notesArea) return `${notesArea.toLocaleString()} ha`;

  const fishLakeHa = parsePositiveNumber(internalNotes?.fishLakeAreaHectares);
  if (fishLakeHa) return `${fishLakeHa.toLocaleString()} ha`;

  const recreationM2 = parsePositiveNumber(internalNotes?.recreationConcessionAreaM2);
  if (recreationM2) return `${(recreationM2 / 10000).toLocaleString()} ha`;

  const portConstructionM2 = parsePositiveNumber(internalNotes?.portConstructionConcessionAreaM2);
  if (portConstructionM2) return `${(portConstructionM2 / 10000).toLocaleString()} ha`;

  const gazExtractionM2 = parsePositiveNumber(internalNotes?.gazExtractionConcessionAreaM2);
  if (gazExtractionM2) return `${(gazExtractionM2 / 10000).toLocaleString()} ha`;

  if (permit.source === "permit_registry") {
    const registryRaw = typeof permit.water_allowance === "string" ? permit.water_allowance.trim() : "";
    if (registryRaw && registryRaw !== "0" && registryRaw !== "0.0" && registryRaw !== "0.00") {
      return registryRaw;
    }
  }

  return "N/A";
}

/**
 * Concession classification for a public permit record: the application's
 * intended activities (via isConcessionApplication) OR the permit row's
 * `purpose` column matching a concession purpose hint (covers registry rows
 * and legacy permits without a usable application).
 */
export function isConcessionPermitRecord(permit: PublicPermitRecord): boolean {
  const application = permit.application;
  const normalizedPurpose =
    typeof permit.purpose === "string"
      ? permit.purpose.trim().toLowerCase().replace(/[\s-]+/g, "_")
      : "";
  const isConcessionByActivities = application
    ? isConcessionApplication({
        intended_activities: application.intended_activities,
        internal_notes: application.internal_notes,
      })
    : false;
  return isConcessionByActivities || CONCESSION_PURPOSE_HINTS.has(normalizedPurpose);
}

/**
 * Normalizes a raw `_assessorAdjustments.waterSourcePolygonPoints` value into a
 * usable boundary ring. Returns null unless at least 3 points parse as finite
 * numbers, so a half-saved or malformed adjustment can never blank out the map.
 */
function normalizeAssessorPolygon(value: unknown): CoordinatePoint[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points: CoordinatePoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const { latitude, longitude } = raw as { latitude?: unknown; longitude?: unknown };
    const lat = typeof latitude === "number" ? latitude : Number.parseFloat(String(latitude ?? ""));
    const lng = typeof longitude === "number" ? longitude : Number.parseFloat(String(longitude ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    points.push({ latitude: lat, longitude: lng });
  }
  return points.length >= 3 ? points : null;
}

/**
 * Concession boundary polygons (empty for non-concession permits or missing
 * geometry).
 *
 * The assessor's field-verified boundary is what the permit actually grants, so
 * `_assessorAdjustments.waterSourcePolygonPoints` outranks everything else. The
 * applicant's own submission stays untouched in `applications.coordinates` — it
 * is the record of what was *requested*, and is only rendered when no assessor
 * adjustment exists. Pass the adjustments in from
 * `parseInternalNotes(...)._assessorAdjustments`; both public permit pages
 * already have it in hand.
 */
export function deriveConcessionPolygons(
  permit: PublicPermitRecord,
  assessorAdjustments: Record<string, unknown> | null
): CoordinatePoint[][] {
  const application = permit.application;
  if (!isConcessionPermitRecord(permit) || !application) return [];

  const assessorPolygon = normalizeAssessorPolygon(assessorAdjustments?.waterSourcePolygonPoints);
  if (assessorPolygon) return [assessorPolygon];

  // The boundary recorded in the field assessment report outranks the
  // applicant's submitted polygon (RWB feedback, Sep 2026). It is read here
  // only for display — deliberately not folded into `assessorAdjustments`,
  // because `deriveConcessionAreaValue` keys off that object and would then
  // recompute the permit's stated area from this geometry.
  const reportPolygon = normalizeAssessorPolygon(
    (permit as unknown as { report_polygon_points?: unknown }).report_polygon_points
  );
  if (reportPolygon) return [reportPolygon];

  try {
    const geom = application.coordinates;
    if (geom) {
      const polygons = geometryToCoordinatePolygons(geom);
      if (polygons.length > 0 && polygons[0].length > 0) return polygons;
    }
  } catch {
    // fall through to the internal_notes copy below
  }

  // Legacy/back-compat: some applications only ever recorded the boundary in
  // the stored form data, never in the geometry column.
  const notes = parseInternalNotes(application.internal_notes);
  const notesPolygons = notes?.waterSourcePolygons;
  if (Array.isArray(notesPolygons)) {
    const normalized = notesPolygons
      .map((ring) => normalizeAssessorPolygon(ring))
      .filter((ring): ring is CoordinatePoint[] => ring !== null);
    if (normalized.length > 0) return normalized;
  }

  return [];
}

/**
 * Surface area (hectares) of the assessor's adjusted boundary, or null when
 * there is no usable adjustment. Used by `deriveConcessionAreaValue` so the
 * area shown next to the map is always the area *of that map*.
 */
export function assessorPolygonAreaHectares(
  assessorAdjustments: Record<string, unknown> | null
): number | null {
  const polygon = normalizeAssessorPolygon(assessorAdjustments?.waterSourcePolygonPoints);
  if (!polygon) return null;
  const feature = polygonsToGeoJSON([polygon]);
  if (!feature) return null;
  const areaSqMeters = getPolygonArea(feature);
  if (!Number.isFinite(areaSqMeters) || areaSqMeters <= 0) return null;
  return Number((areaSqMeters / 10000).toFixed(4));
}
