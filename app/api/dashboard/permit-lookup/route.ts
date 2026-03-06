import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { buildPermitLookupCandidates } from "@/lib/permit-number-utils";

const QuerySchema = z.object({
  permitNumber: z.string().min(3).max(128),
});

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req);
  if (!token) return null;
  const claims = await verifySessionToken(token);
  return claims?.sub || null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }

    const parsed = QuerySchema.safeParse({
      permitNumber: req.nextUrl.searchParams.get("permitNumber"),
    });
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid permit number." }, { status: 400 });
    }

    const raw = parsed.data.permitNumber.trim();
    const lookup = buildPermitLookupCandidates(raw);
    const result = await findPublicPermitByNumber(raw, { includeRegistryFallback: true });
    const permit = result.permit;

    return NextResponse.json({
      success: true,
      inputPermitNumber: result.inputPermitNumber ?? raw,
      normalizedPermitNumber: lookup.raw,
      candidateKeys: lookup.candidateKeys,
      found: Boolean(permit),
      source: permit?.source ?? null,
      permit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ dashboard permit lookup GET error:", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

