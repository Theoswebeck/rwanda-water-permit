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
  const application = permit.application as Record<string, unknown> | null;
  const issuedDate = typeof permit.issued_date === "string" ? permit.issued_date.trim() : "";
  if (issuedDate) return issuedDate;
  const acceptedAt = typeof application?.terms_accepted_at === "string" ? application.terms_accepted_at.trim() : "";
  return acceptedAt || null;
}

function computePermitDuration(issueDateStr: string | null, expiryDateStr: string | null): string | null {
  if (!issueDateStr || !expiryDateStr) return null;
  const issue = new Date(issueDateStr);
  const expiry = new Date(expiryDateStr);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(expiry.getTime())) return null;

  let years = expiry.getFullYear() - issue.getFullYear();
  let months = expiry.getMonth() - issue.getMonth();
  if (expiry.getDate() < issue.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return null;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return parts.join(", ");
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseInternalNotes(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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
  params: Promise<{ permitNumber: string }>;
}) {
  const { permitNumber: permitNumberParam } = await params;
  const { inputPermitNumber, permit } = await findPublicPermitByNumber(permitNumberParam, {
    includeRegistryFallback: true,
  });
  if (!inputPermitNumber) notFound();

  const error = !permit;

  if (error || !permit) {
    // Likely either not found, or RLS blocks public access. Keep the response generic.
    return (
      <div className="container mx-auto px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Permit verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              We couldn’t load this permit. It may not exist yet, may be inactive, or the permit number format may be invalid.
            </p>
            <p className="text-sm">
              Permit number: <span className="font-mono">{inputPermitNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact support from the portal.
            </p>
            <Link className="text-sm underline" href="/">
              Back to portal
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

    const notes = (() => {
      const rawNotes = app.internal_notes;
      if (!rawNotes) return null;
      if (typeof rawNotes === "object") return rawNotes as Record<string, unknown>;
      if (typeof rawNotes !== "string") return null;
      try {
        const parsed = JSON.parse(rawNotes);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    })();

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
  const intendedWaterActivity = (() => {
    const app = permit.application as Record<string, unknown> | null;
    const intendedActivities = Array.isArray(app?.intended_activities)
      ? app.intended_activities
          .filter((activity): activity is string => typeof activity === "string")
          .map((activity) => activity.trim())
          .filter((activity) => activity.length > 0)
      : [];

    let transferActivity = "";
    if (!intendedActivities.length && app?.internal_notes) {
      try {
        const notes = typeof app.internal_notes === "string"
          ? JSON.parse(app.internal_notes as string)
          : app.internal_notes;
        if (notes?.transferFormData?.waterPurpose) {
          transferActivity = String(notes.transferFormData.waterPurpose);
        }
      } catch { /* ignore */ }
    }

    const appWaterPurpose = typeof app?.water_purpose === "string" ? app.water_purpose.trim() : "";
    const permitPurpose = typeof permit.purpose === "string" ? permit.purpose.trim() : "";
    const primaryActivity = intendedActivities[0] || transferActivity || appWaterPurpose || permitPurpose;

    return primaryActivity ? getActivityLabel(primaryActivity) : "N/A";
  })();
  const issueDate = getCanonicalIssueDate(permit as Record<string, unknown>);
  const application = permit.application as Record<string, unknown> | null;
  const normalizedPurpose = typeof permit.purpose === "string" ? permit.purpose.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const concessionPurposeHints = new Set(["fish_farming_lakes", "recreation", "recreation_activities"]);
  const isConcessionPermit = (application ? isConcessionApplication(application) : false) || concessionPurposeHints.has(normalizedPurpose);
  const internalNotes = parseInternalNotes(application?.internal_notes);

  const abstractionValue = (() => {
    const permitVolume = parsePositiveNumber(permit.water_allowance);
    const assessorVolume = parsePositiveNumber(application?.assessor_recommended_volume_m3);
    const yearlyVolume = parsePositiveNumber(application?.max_yearly_volume_m3);
    const estimatedVolume = parsePositiveNumber(application?.estimated_usage_volume);
    const abstractionFromNotes = parsePositiveNumber(
      Array.isArray(internalNotes?.waterAbstractionDetails)
        ? (internalNotes?.waterAbstractionDetails as Array<Record<string, unknown>>)[0]?.maxAverageYearly
        : null
    );
    const volume = permitVolume ?? assessorVolume ?? yearlyVolume ?? estimatedVolume ?? abstractionFromNotes;
    if (!volume) return "N/A";

    const unitCandidate = [
      typeof permit.allowance_unit === "string" ? permit.allowance_unit.trim() : "",
      typeof application?.usage_unit === "string" ? application.usage_unit.trim() : "",
    ].find((item) => item.length > 0);

    return `${volume.toLocaleString()} ${unitCandidate || "m³/year"}`.trim();
  })();

  const concessionAreaValue = (() => {
    const assessorArea = parsePositiveNumber(
      (internalNotes?._assessorAdjustments as Record<string, unknown> | undefined)?.recommendedVolumeM3
    );
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

  const permitDuration = (() => {
    const fromDates = computePermitDuration(issueDate, typeof permit.expiry_date === "string" ? permit.expiry_date : null);
    if (fromDates) return fromDates;

    const assessorYears = parsePositiveNumber(
      (internalNotes?._assessorAdjustments as Record<string, unknown> | undefined)?.permitLengthYears
    );
    if (assessorYears) return `${assessorYears} ${assessorYears === 1 ? "year" : "years"}`;

    const proposedYears = parsePositiveNumber(application?.proposed_duration_years);
    if (proposedYears) return `${proposedYears} ${proposedYears === 1 ? "year" : "years"}`;

    return "N/A";
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-8 pt-10">
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 bg-white shadow-sm">
                    <Image
                      src="/assets/rwanda_water_board_Logo.png"
                      alt="Rwanda Water Resources Board"
                      fill
                      sizes="80px"
                      className="object-contain p-2"
                    />
                  </div>
                  <div>
                    <div className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
                      Rwanda Water Resources Board
                    </div>
                    <div className="mt-1 text-lg font-medium text-slate-600 md:text-2xl">Permit verification</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-slate-500">Permit number</div>
                  <div className="mt-2 rounded-lg border bg-slate-50 px-4 py-2 font-mono text-base">
                    {permit.permit_number}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-8">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                    Water Permit Certificate
                  </h1>
                  <p className="mt-2 text-base text-slate-600">This page is a read-only verification view.</p>
                </div>
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </div>
            </div>

            <div className="px-8 pb-10 pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Permit holder</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{applicantName}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Issuing authority</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.issuing_authority}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Issue date</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{issueDate ? formatDate(issueDate) : "N/A"}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Expiry date</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(permit.expiry_date)}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Water source</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {typeof permit.water_source === "string"
                      ? permit.water_source.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : "N/A"}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Intended water activity</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{intendedWaterActivity}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">
                    {isConcessionPermit ? "Surface concession area" : "Authorized volume"}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {isConcessionPermit ? concessionAreaValue : abstractionValue}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Permit duration</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permitDuration}</div>
                </div>
                <div className="rounded-xl border p-4 md:col-span-2">
                  <div className="text-xs text-slate-500">Location</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{location}</div>
                </div>
                {permit.application?.project_title ? (
                  <div className="rounded-xl border p-4 md:col-span-2">
                    <div className="text-xs text-slate-500">Project title</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{permit.application.project_title}</div>
                  </div>
                ) : null}
              </div>

              <PermitLocationMap
                latitude={permit.latitude}
                longitude={permit.longitude}
              />

              <div className="mt-8 border-t pt-6 text-xs text-slate-500">
                If you received this link from a QR code on a permit, compare the permit number above with the printed
                certificate.
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






