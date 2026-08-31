import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCachedDashboard } from "@/lib/permit/water-use-dashboard-data";
import { requireApiKey, apiError } from "@/lib/api/api-key-auth";

export const runtime = "nodejs";

const BySchema = z.object({
  by: z.enum(["activity", "district", "catchment"]).optional(),
});

/**
 * GET /api/v1/statistics/summary  (scope `stats:read`)
 *
 * The machine-readable Water Use Dashboard: headline status totals and permit
 * counts by activity / district / catchment. Serves the SAME cached payload
 * the public dashboard page renders (lib/permit/water-use-dashboard-data.ts),
 * so agency numbers always reconcile with the public dashboard, and the
 * 5-minute cache keeps bulk pollers off the connection pool. Aggregate counts
 * only — no holder, permit number, contact, or precise location.
 *
 * `?by=activity|district|catchment` returns just that bucket array.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, "stats:read");
  if (!auth.ok) return auth.response;

  const parsed = BySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return apiError("INVALID_PARAMS", "'by' must be one of: activity, district, catchment.", 400);
  }

  try {
    const payload = await getCachedDashboard();
    if (!parsed.data.by) {
      return NextResponse.json({ data: payload });
    }

    const key = (`by${parsed.data.by[0].toUpperCase()}${parsed.data.by.slice(1)}` as "byActivity" | "byDistrict" | "byCatchment");
    return NextResponse.json({
      data: { generatedAt: payload.generatedAt, by: parsed.data.by, buckets: payload[key] },
    });
  } catch (e) {
    console.error("[api/v1/statistics/summary] failed:", e);
    return apiError("INTERNAL_ERROR", "Statistics are temporarily unavailable.", 500);
  }
}
