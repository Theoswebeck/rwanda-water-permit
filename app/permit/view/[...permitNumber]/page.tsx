import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PermitStatus } from "@/types/database";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { PermitPublicActions } from "@/components/public/permit-public-actions";
import { PermitLocationMap } from "@/components/public/permit-location-map";
import { OptionalDashboardLayout } from "@/components/dashboard/optional-dashboard-layout";
import { Tx } from "@/components/ui/tx";
import { safeInternalPath } from "@/lib/safe-internal-path";
// All display derivations (holder, activity, area, location, dates,
// concession classification, polygons) are shared with the printable map page
// via lib/permit/permit-display.ts so the two pages can never diverge.
import {
  deriveConcessionAreaValue,
  deriveConcessionPolygons,
  derivePermitActivity,
  derivePermitHolderName,
  derivePermitLocation,
  formatPermitDate,
  getCanonicalIssueDate,
  isConcessionPermitRecord,
  parseInternalNotes,
  parsePositiveNumber,
} from "@/lib/permit/permit-display";

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
  searchParams,
}: {
  params: Promise<{ permitNumber: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { permitNumber: segments } = await params;
  if (!Array.isArray(segments) || segments.length === 0) notFound();

  // Back target for a staff member who arrived from a portal page. Prefer an
  // explicit ?back= (threaded by lists), else fall back to a same-origin Referer
  // so any in-app arrival gets a Back link without threading every link. Public /
  // QR visitors (no same-origin referer, no ?back=) get none and use "Back to
  // portal". Server-rendered → works with SSR / no-JS / i18n, and only rendered
  // when a valid internal target exists (never a dead-end).
  const backParamRaw = (await searchParams)?.back;
  let backHref = safeInternalPath(typeof backParamRaw === "string" ? backParamRaw : null);
  if (!backHref) {
    const hdrs = await headers();
    const referer = hdrs.get("referer");
    const host = hdrs.get("host");
    if (referer && host) {
      try {
        const refUrl = new URL(referer);
        // Same-origin only, and never offer "Back" to another permit-view page.
        if (refUrl.host === host && !refUrl.pathname.startsWith("/permit/view")) {
          backHref = safeInternalPath(refUrl.pathname + refUrl.search);
        }
      } catch {
        // ignore a malformed referer
      }
    }
  }
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

  // Public visibility gate: deactivated permits (suspended/revoked, e.g. a
  // disabled test permit) render an "inactive" notice instead of their details,
  // and their QR scan resolves here. Expired/expiring permits are NOT hidden —
  // verifying an expired permit is legitimate. See
  // docs/superpowers/specs/2026-06-10-disable-test-permit-0925-design.md
  if (String(permit.status) === "suspended" || String(permit.status) === "revoked") {
    return (
      <div className="container mx-auto px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle><Tx>Permit verification</Tx></CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium text-amber-700">
              <Tx>This permit is inactive.</Tx>
            </p>
            <p className="text-sm text-muted-foreground">
              <Tx>This permit is not currently active and its details are not available for public verification.</Tx>
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

  const badge = statusBadgeVariant(permit.status as PermitStatus);
  const application = permit.application as Record<string, unknown> | null;
  const internalNotes = parseInternalNotes(application?.internal_notes);
  const assessorAdjustments = (internalNotes?._assessorAdjustments ?? null) as Record<string, unknown> | null;

  const applicantName = derivePermitHolderName(permit);
  const location = derivePermitLocation(permit, internalNotes);
  const intendedWaterActivity = derivePermitActivity(permit, internalNotes);
  const issueDate = getCanonicalIssueDate(permit);
  const isConcessionPermit = isConcessionPermitRecord(permit);

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

  const concessionAreaValue = deriveConcessionAreaValue(permit, internalNotes, assessorAdjustments);

  const concessionPolygons = deriveConcessionPolygons(permit, assessorAdjustments);

  return (
    <OptionalDashboardLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8">
          {backHref ? (
          <div className="mx-auto mb-4 max-w-4xl">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <Tx>Back</Tx>
            </Link>
          </div>
        ) : null}
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
                  <div className="mt-1 text-sm font-medium text-slate-900">{issueDate ? formatPermitDate(issueDate) : <Tx>N/A</Tx>}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500"><Tx>Expiry date</Tx></div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.expiry_date ? formatPermitDate(permit.expiry_date) : <Tx>N/A</Tx>}</div>
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
                printHref={`/permit/map/${encodeURIComponent(String(permit.permit_number || inputPermitNumber))}`}
              />

              {/* Child permit lookup notice */}
              {permit.child_permit_number && (
                <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <span className="font-medium">Network permit </span>
                  <span className="font-mono">{permit.child_permit_number}</span>
                  <span> is part of bulk permit </span>
                  <span className="font-mono">{permit.permit_number}</span>.
                  The full permit details and annex are shown below.
                </div>
              )}

              {/* Bulk annex: list of authorized distribution networks */}
              {Array.isArray(permit.child_permits) && permit.child_permits.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-base font-semibold text-slate-900 mb-3">
                    Annex — Authorized Distribution Networks
                  </h2>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-3 py-2 text-left font-medium">No.</th>
                          <th className="px-3 py-2 text-left font-medium">Network Name</th>
                          <th className="px-3 py-2 text-left font-medium">Sector</th>
                          <th className="px-3 py-2 text-left font-medium">Cell</th>
                          <th className="px-3 py-2 text-left font-medium">Permit Number</th>
                          <th className="px-3 py-2 text-left font-medium">Capacity (m³/day)</th>
                          <th className="px-3 py-2 text-left font-medium">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(permit.child_permits as Array<Record<string, unknown>>).map((child, idx) => {
                          const cond = (child.conditions ?? {}) as Record<string, unknown>;
                          return (
                            <tr key={String(child.id ?? idx)} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                              <td className="px-3 py-2">{(child.network_sequence_index as number | null | undefined) ?? (idx + 1)}</td>
                              <td className="px-3 py-2 font-medium">{String(cond.network_name ?? "—")}</td>
                              <td className="px-3 py-2">{String(cond.sector ?? "—")}</td>
                              <td className="px-3 py-2">{String(cond.cell ?? "—")}</td>
                              <td className="px-3 py-2 font-mono text-xs">{String(child.permit_number ?? "—")}</td>
                              <td className="px-3 py-2">{child.water_allowance != null ? String(child.water_allowance) : "—"}</td>
                              <td className="px-3 py-2">{String(cond.abstraction_method ?? "—").replace(/_/g, " ")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
    </OptionalDashboardLayout>
  );
}






