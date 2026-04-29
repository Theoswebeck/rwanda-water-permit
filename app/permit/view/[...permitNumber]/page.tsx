import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PermitStatus } from "@/types/database";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { PermitPublicActions } from "@/components/public/permit-public-actions";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { isConcessionApplication } from "@/lib/permit-variant";
import { PermitLocationMap } from "@/components/public/permit-location-map";
import { Tx } from "@/components/ui/tx";
import { geometryToCoordinatePolygons, type CoordinatePoint } from "@/lib/geoUtils";
import { getEffectiveInternalNotes } from "@/lib/document-overrides";

function formatDate(dateString: string): string {
  const raw = dateString.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    // Date-only values should be interpreted in the viewer's local timezone.
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getCanonicalIssueDate(permit: Record<string, unknown>): string | null {
  // Mirrors `lib/permit/resolve-issue-date.ts`: `permits.issued_date` is
  // the locked legal value once the permit has been issued. Before that
  // (registry-only permits, or a permit row that somehow exists without an
  // issued_date) we fall back to `applications.approved_at` — the moment
  // the Director General signed the application, which is the contractual
  // effective date. We do NOT fall back to `terms_accepted_at` because the
  // user can delay clicking accept arbitrarily long after approval.
  const application = permit.application as Record<string, unknown> | null;
  const issuedDate = typeof permit.issued_date === "string" ? permit.issued_date.trim() : "";
  if (issuedDate) return issuedDate;
  const approvedAt = typeof application?.approved_at === "string" ? application.approved_at.trim() : "";
  return approvedAt || null;
}

function parsePositiveNumber(value: unknown): number | null {
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
function parseInternalNotes(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const effective = getEffectiveInternalNotes(value);
  if (!effective || typeof effective !== "object") return null;
  return Object.keys(effective).length > 0 ? effective : null;
}

function statusBadgeVariant(status: PermitStatus): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-green-100 text-green-700 border-green-200" };
    case "expired":
      return { label: "Expired", className: "bg-red-100 text-red-700 border-red-200" };
    case "expiring_soon":
      return { label: "Expiring soon", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "suspended":
      return { label: "Suspended", className: "bg-slate-100 text-slate-700 border-slate-200" };
    case "revoked":
      return { label: "Revoked", className: "bg-slate-100 text-slate-700 border-slate-200" };
    default:
      return { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

export default async function PublicPermitViewPage({
  params,
}: {
  params: Promise<{ permitNumber: string[] }>;
}) {
  const { permitNumber: segments } = await params;
  if (!Array.isArray(segments) || segments.length === 0) notFound();
  // Permit numbers contain slashes (e.g. "000022/RWB/2026"). When %2F is
  // decoded by the server the single segment becomes multiple path parts.
  // The catch-all route collects them so we can rejoin here.
  const permitNumberJoined = segments.join("/");
  let permitNumberParam = permitNumberJoined;
  try {
    permitNumberParam = decodeURIComponent(permitNumberJoined);
  } catch {
    // Keep original value when URL decoding fails.
    permitNumberParam = permitNumberJoined;
  }

  let inputPermitNumber: string | null = permitNumberParam;
  let permit: Awaited<ReturnType<typeof findPublicPermitByNumber>>["permit"] = null;
  try {
    const result = await findPublicPermitByNumber(permitNumberParam, {
      includeRegistryFallback: true,
    });
    inputPermitNumber = result.inputPermitNumber ?? permitNumberParam;
    permit = result.permit;
  } catch (error) {
    console.error(`[PublicPermitViewPage] Failed to load permit "${permitNumberParam}"`, error);
  }
  if (!inputPermitNumber) notFound();

  const error = !permit;

  if (error || !permit) {
    // Likely either not found, or RLS blocks public access. Keep the response generic.
    return (
      <div className="container mx-auto px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle><Tx>Permit verification</Tx></CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <Tx>We couldn&apos;t load this permit. It may not exist yet, may be inactive, or the permit number format may be invalid.</Tx>
            </p>
            <p className="text-sm">
              <Tx>Permit number:</Tx> <span className="font-mono">{inputPermitNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              <Tx>If you believe this is an error, please contact support from the portal.</Tx>
            </p>
            <Link className="text-sm underline" href="/">
              <Tx>Back to portal</Tx>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const applicantName = (() => {
    if (permit.source === "permit_registry") {
      return typeof permit.permit_holder === "string" && permit.permit_holder.trim() ? permit.permit_holder.trim() : "N/A";
    }
    const a = permit.application?.applicant;
    if (!a) return "N/A";
    if (a.account_type === "individual") {
      return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "N/A";
    }
    return a.company_name ?? "N/A";
  })();

  const location = (() => {
    if (permit.source === "permit_registry") {
      return typeof permit.registry_location === "string" && permit.registry_location.trim()
        ? permit.registry_location.trim()
        : "N/A";
    }
    const app = permit.application;
    if (!app) return "N/A";

    // Effective notes flattens any assessor `document_overrides` (waterSourceVillage,
    // waterSourceCell, …) onto the top level so an override always wins over the
    // application-column fallback below.
    const notes = parseInternalNotes(app.internal_notes);

    const parts = [
      notes?.waterSourceVillage ?? app.village,
      notes?.waterSourceCell ?? app.cell,
      notes?.waterSourceSector ?? app.sector,
      notes?.waterSourceDistrict ?? app.district,
      notes?.waterSourceProvince ?? app.province,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "N/A";
  })();

  const badge = statusBadgeVariant(permit.status as PermitStatus);
  const application = permit.application as Record<string, unknown> | null;
  const internalNotes = parseInternalNotes(application?.internal_notes);
  const assessorAdjustments = (internalNotes?._assessorAdjustments ?? null) as Record<string, unknown> | null;

  const intendedWaterActivity = (() => {
    // Override (`document_overrides.values.intendedActivities`) is flattened
    // onto `internalNotes.intendedActivities` by parseInternalNotes, so reading
    // it from `internalNotes` first lets the assessor's edit win.
    const overrideActivities = Array.isArray(internalNotes?.intendedActivities)
      ? (internalNotes.intendedActivities as unknown[])
          .filter((activity): activity is string => typeof activity === "string")
          .map((activity) => activity.trim())
          .filter((activity) => activity.length > 0)
      : [];

    const intendedActivities = overrideActivities.length
      ? overrideActivities
      : Array.isArray(application?.intended_activities)
        ? (application.intended_activities as unknown[])
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

    const appWaterPurpose = typeof application?.water_purpose === "string" ? application.water_purpose.trim() : "";
    const permitPurpose = typeof permit.purpose === "string" ? permit.purpose.trim() : "";
    const primaryActivity = intendedActivities[0] || transferActivity || appWaterPurpose || permitPurpose;

    return primaryActivity ? getActivityLabel(primaryActivity) : "N/A";
  })();
  const issueDate = getCanonicalIssueDate(permit as Record<string, unknown>);
  const normalizedPurpose = typeof permit.purpose === "string" ? permit.purpose.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const concessionPurposeHints = new Set(["fish_farming_lakes", "recreation", "recreation_activities"]);
  const isConcessionPermit = (application ? isConcessionApplication(application) : false) || concessionPurposeHints.has(normalizedPurpose);

  const abstractionValue = (() => {
    // Order matters: the assessor's latest adjustment (saved into
    // `internal_notes._assessorAdjustments.recommendedVolumeM3`) must win over
    // the permit-row snapshot, otherwise post-issuance edits never surface here.
    const assessorAdjustmentVolume = parsePositiveNumber(assessorAdjustments?.recommendedVolumeM3);
    const permitVolume = parsePositiveNumber(permit.water_allowance);
    const assessorColumnVolume = parsePositiveNumber(application?.assessor_recommended_volume_m3);
    const yearlyVolume = parsePositiveNumber(application?.max_yearly_volume_m3);
    const estimatedVolume = parsePositiveNumber(application?.estimated_usage_volume);
    const abstractionFromNotes = parsePositiveNumber(
      Array.isArray(internalNotes?.waterAbstractionDetails)
        ? (internalNotes?.waterAbstractionDetails as Array<Record<string, unknown>>)[0]?.maxAverageYearly
        : null
    );
    const volume =
      assessorAdjustmentVolume ??
      permitVolume ??
      assessorColumnVolume ??
      yearlyVolume ??
      estimatedVolume ??
      abstractionFromNotes;
    if (!volume) return "N/A";

    const unitCandidate = [
      typeof permit.allowance_unit === "string" ? permit.allowance_unit.trim() : "",
      typeof application?.usage_unit === "string" ? application.usage_unit.trim() : "",
    ].find((item) => item.length > 0);

    return `${volume.toLocaleString()} ${unitCandidate || "m³/year"}`.trim();
  })();

  const concessionAreaValue = (() => {
    // Note: the assessor recommendations UI reuses `recommendedVolumeM3` as the
    // payload key even when editing a concession permit's surface area in
    // hectares (see components/inspection/assessor-recommendations.tsx). For a
    // concession permit, treat that number as hectares.
    const assessorArea = parsePositiveNumber(assessorAdjustments?.recommendedVolumeM3);
    if (assessorArea) return `${assessorArea.toLocaleString()} ha`;

    const dbArea = parsePositiveNumber(application?.concession_area);
    if (dbArea) return `${dbArea.toLocaleString()} ha`;

    const notesArea = parsePositiveNumber(internalNotes?.concessionArea);
    if (notesArea) return `${notesArea.toLocaleString()} ha`;

    const fishLakeHa = parsePositiveNumber(internalNotes?.fishLakeAreaHectares);
    if (fishLakeHa) return `${fishLakeHa.toLocaleString()} ha`;

    const recreationM2 = parsePositiveNumber(internalNotes?.recreationConcessionAreaM2);
    if (recreationM2) return `${(recreationM2 / 10000).toLocaleString()} ha`;

    if (permit.source === "permit_registry") {
      const registryRaw = typeof permit.water_allowance === "string" ? permit.water_allowance.trim() : "";
      if (registryRaw && registryRaw !== "0" && registryRaw !== "0.0" && registryRaw !== "0.00") {
        return registryRaw;
      }
    }

    return "N/A";
  })();

  const concessionPolygons: CoordinatePoint[][] = (() => {
    if (!isConcessionPermit || !application) return [];
    const geom = application.coordinates;
    if (!geom) return [];
    try {
      return geometryToCoordinatePolygons(geom);
    } catch {
      return [];
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-4 pt-6 md:px-8 md:pt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-white shadow-sm sm:h-20 sm:w-20">
                    <Image
                      src="/assets/rwanda_water_board_Logo.png"
                      alt="Rwanda Water Resources Board"
                      fill
                      sizes="80px"
                      className="object-contain p-2"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl md:text-3xl">
                      <Tx>Rwanda Water Resources Board</Tx>
                    </div>
                    <div className="mt-1 text-base font-medium text-slate-600 sm:text-lg md:text-2xl"><Tx>Permit verification</Tx></div>
                  </div>
                </div>

                <div className="sm:text-right">
                  <div className="text-sm font-medium text-slate-500"><Tx>Permit number</Tx></div>
                  <div className="mt-2 rounded-lg border bg-slate-50 px-4 py-2 font-mono text-base break-all">
                    {permit.permit_number}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6 md:mt-8 md:pt-8">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl md:text-3xl">
                    <Tx>Water Permit Certificate</Tx>
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 sm:text-base"><Tx>This page is a read-only verification view.</Tx></p>
                </div>
                <Badge variant="outline" className={badge.className}>
                  <Tx>{badge.label}</Tx>
                </Badge>
              </div>
            </div>

            <div className="px-4 pb-6 pt-4 md:px-8 md:pb-10 md:pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Permit holder</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{applicantName}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Issuing authority</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.issuing_authority}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Issue date</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{issueDate ? formatDate(issueDate) : <Tx>N/A</Tx>}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Expiry date</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.expiry_date ? formatDate(permit.expiry_date) : <Tx>N/A</Tx>}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Water source</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {(() => {
                      const sourceTypeLabel =
                        typeof permit.water_source === "string"
                          ? permit.water_source
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c: string) => c.toUpperCase())
                          : null;
                      const overrideName =
                        typeof internalNotes?.nameSourceWater === "string"
                          ? internalNotes.nameSourceWater.trim()
                          : "";
                      if (overrideName && sourceTypeLabel) {
                        return `${overrideName} (${sourceTypeLabel})`;
                      }
                      return overrideName || sourceTypeLabel || <Tx>N/A</Tx>;
                    })()}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Intended water activity</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{intendedWaterActivity}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">
                    {isConcessionPermit ? <Tx>Surface concession area</Tx> : <Tx>Authorized volume</Tx>}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {isConcessionPermit ? concessionAreaValue : abstractionValue}
                  </div>
                </div>
                <div className="rounded-xl border p-4 md:col-span-2">
                  <div className="text-xs text-slate-500"><Tx>Location</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{location}</div>
                </div>
                {permit.application?.project_title ? (
                  <div className="rounded-xl border p-4 md:col-span-2">
                    <div className="text-xs text-slate-500"><Tx>Project title</Tx></div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{permit.application.project_title}</div>
                  </div>
                ) : null}
              </div>

              <PermitLocationMap
                latitude={permit.latitude}
                longitude={permit.longitude}
                polygons={concessionPolygons}
              />

              <div className="mt-8 border-t pt-6 text-xs text-slate-500">
                <Tx>If you received this link from a QR code on a permit, compare the permit number above with the printed certificate.</Tx>
              </div>
              <PermitPublicActions
                permitNumber={String(permit.permit_number || inputPermitNumber)}
                canViewPdf={permit.source === "permits"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






