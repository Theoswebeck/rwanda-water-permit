import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { Tx } from "@/components/ui/tx";
import { ConcessionMapPrint } from "@/components/public/concession-map-print";
import { OptionalDashboardLayout } from "@/components/dashboard/optional-dashboard-layout";
import {
  deriveConcessionAreaValue,
  deriveConcessionPolygons,
  derivePermitActivity,
  derivePermitHolderName,
  derivePermitLocation,
  formatPermitDate,
  getCanonicalIssueDate,
  parseInternalNotes,
  permitStatusLabel,
} from "@/lib/permit/permit-display";

// Printable concession boundary map, reached from the "Printable map" link on
// the /permit/view verification page. It follows that page's access pattern
// exactly: public by permit number (permit holder, RWB staff and QR visitors
// all land on the same view), with suspended/revoked permits gated in-page.
// All display derivations (holder, activity, area, location, dates,
// concession classification, polygons) are shared with the view page via
// lib/permit/permit-display.ts so the two pages can never diverge.

export default async function ConcessionMapPrintPage({
  params,
}: {
  params: Promise<{ permitNumber: string[] }>;
}) {
  const { permitNumber: segments } = await params;
  if (!Array.isArray(segments) || segments.length === 0) notFound();

  // Permit numbers contain slashes (e.g. "000022/RWB/2026"); the catch-all
  // route collects the decoded parts so we rejoin them here.
  const permitNumberJoined = segments.join("/");
  let permitNumberParam = permitNumberJoined;
  try {
    permitNumberParam = decodeURIComponent(permitNumberJoined);
  } catch {
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
    console.error(`[ConcessionMapPrintPage] Failed to load permit "${permitNumberParam}"`, error);
  }
  if (!inputPermitNumber) notFound();

  if (!permit) {
    return (
      <OptionalDashboardLayout>
        <div className="container mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle><Tx>Concession boundary map</Tx></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <Tx>We couldn&apos;t load this permit. It may not exist yet, may be inactive, or the permit number format may be invalid.</Tx>
              </p>
              <p className="text-sm">
                <Tx>Permit number:</Tx> <span className="font-mono">{inputPermitNumber}</span>
              </p>
              <Link className="text-sm underline" href="/">
                <Tx>Back to portal</Tx>
              </Link>
            </CardContent>
          </Card>
        </div>
      </OptionalDashboardLayout>
    );
  }

  // Same public-visibility gate as the /permit/view page: suspended/revoked
  // permits never expose their details (or boundary) publicly.
  if (String(permit.status) === "suspended" || String(permit.status) === "revoked") {
    return (
      <OptionalDashboardLayout>
        <div className="container mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle><Tx>Concession boundary map</Tx></CardTitle>
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
              <Link className="text-sm underline" href="/">
                <Tx>Back to portal</Tx>
              </Link>
            </CardContent>
          </Card>
        </div>
      </OptionalDashboardLayout>
    );
  }

  const application = permit.application;
  const internalNotes = parseInternalNotes(application?.internal_notes);
  const assessorAdjustments = (internalNotes?._assessorAdjustments ?? null) as Record<string, unknown> | null;

  const holderName = derivePermitHolderName(permit);
  const location = derivePermitLocation(permit, internalNotes);
  const activity = derivePermitActivity(permit, internalNotes);
  const recordedArea = deriveConcessionAreaValue(permit, internalNotes, assessorAdjustments);
  const polygons = deriveConcessionPolygons(permit, assessorAdjustments);

  const backHref = `/permit/view/${encodeURIComponent(String(permit.permit_number || inputPermitNumber))}`;

  const hasPolygons = polygons.length > 0 && polygons[0].length >= 3;
  if (!hasPolygons) {
    return (
      <OptionalDashboardLayout>
        <div className="container mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle><Tx>Concession boundary map</Tx></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <Tx>No concession boundary is recorded for this permit, so a printable map is not available.</Tx>
              </p>
              <p className="text-sm">
                <Tx>Permit number:</Tx> <span className="font-mono">{String(permit.permit_number || inputPermitNumber)}</span>
              </p>
              <Link className="text-sm underline" href={backHref}>
                <Tx>Back to permit</Tx>
              </Link>
            </CardContent>
          </Card>
        </div>
      </OptionalDashboardLayout>
    );
  }

  const issueDateRaw = getCanonicalIssueDate(permit);

  return (
    <OptionalDashboardLayout>
      <ConcessionMapPrint
        permitNumber={String(permit.permit_number || inputPermitNumber)}
        holderName={holderName}
        activity={activity}
        recordedArea={recordedArea}
        location={location}
        issueDate={issueDateRaw ? formatPermitDate(issueDateRaw) : "N/A"}
        expiryDate={permit.expiry_date ? formatPermitDate(permit.expiry_date) : "N/A"}
        statusLabel={permitStatusLabel(String(permit.status))}
        polygons={polygons}
        backHref={backHref}
      />
    </OptionalDashboardLayout>
  );
}
