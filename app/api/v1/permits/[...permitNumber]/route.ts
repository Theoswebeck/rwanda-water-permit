import { NextRequest, NextResponse } from "next/server";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { requireApiKey, apiError } from "@/lib/api/api-key-auth";
import { serializeApiPermit, isPublicStatusVisible } from "@/lib/api/permit-serializer";

export const runtime = "nodejs";

/**
 * GET /api/v1/permits/{permit_number}  (scope `permits:read`)
 *
 * Full public record for one permit — the same whitelisted fields the QR
 * verification page renders, plus coordinates (public via the permit map
 * page). Catch-all segment because real permit numbers can contain slashes.
 * Deactivated permits (suspended/revoked) answer with status only, mirroring
 * the QR page's "inactive" notice.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ permitNumber: string[] }> }) {
  const auth = await requireApiKey(req, "permits:read");
  if (!auth.ok) return auth.response;

  const { permitNumber: segments } = await context.params;
  const permitNumber = segments.join("/").trim();
  if (!permitNumber) {
    return apiError("INVALID_PARAMS", "A permit number path segment is required.", 400);
  }

  try {
    const { permit } = await findPublicPermitByNumber(permitNumber, {
      includeRegistryFallback: true,
    });
    if (!permit) {
      return apiError("NOT_FOUND", `No permit found for "${permitNumber}".`, 404);
    }

    if (!isPublicStatusVisible(permit.status)) {
      return NextResponse.json({
        data: {
          permit_number: permit.permit_number,
          status: permit.status,
          status_label: permit.status,
          valid: false,
          detail: "This permit is deactivated; details are not public.",
        },
      });
    }

    return NextResponse.json({ data: serializeApiPermit(permit, { includeCoordinates: true }) });
  } catch (e) {
    console.error("[api/v1/permits/detail] lookup failed:", e);
    return apiError("INTERNAL_ERROR", "Lookup is temporarily unavailable.", 500);
  }
}
