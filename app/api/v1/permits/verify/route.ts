import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { requireApiKey, apiError } from "@/lib/api/api-key-auth";
import { serializeApiPermit } from "@/lib/api/permit-serializer";

export const runtime = "nodejs";

const VerifySchema = z.object({
  permit_number: z.string().min(4).max(80),
});

/**
 * GET /api/v1/permits/verify?permit_number=…
 *
 * The agency verification API (scope `permits:verify`). Answers "is this
 * permit real and currently valid?" with the same public fields the QR
 * verification page shows. An unknown permit number is a valid answer
 * (valid: false, status: "not_found"), not an error.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, "permits:verify");
  if (!auth.ok) return auth.response;

  const parsed = VerifySchema.safeParse({
    permit_number: req.nextUrl.searchParams.get("permit_number") ?? "",
  });
  if (!parsed.success) {
    return apiError(
      "INVALID_PARAMS",
      "Query parameter 'permit_number' is required (4–80 characters).",
      400
    );
  }

  try {
    const { permit } = await findPublicPermitByNumber(parsed.data.permit_number, {
      includeRegistryFallback: true,
    });

    if (!permit) {
      return NextResponse.json({
        data: {
          permit_number: parsed.data.permit_number,
          valid: false,
          status: "not_found",
          status_label: "Not found",
          verified_at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      data: { ...serializeApiPermit(permit), verified_at: new Date().toISOString() },
    });
  } catch (e) {
    console.error("[api/v1/permits/verify] lookup failed:", e);
    return apiError("INTERNAL_ERROR", "Verification is temporarily unavailable.", 500);
  }
}
