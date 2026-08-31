import { NextResponse } from "next/server";
import { getCachedDashboard } from "@/lib/permit/water-use-dashboard-data";

/**
 * Public Water Use Dashboard endpoint. The payload builder and its 5-minute
 * cache live in lib/permit/water-use-dashboard-data.ts so the agency API
 * statistics endpoint (/api/v1/statistics/summary) serves the identical
 * cached numbers.
 */
export async function GET() {
  try {
    return NextResponse.json(await getCachedDashboard());
  } catch (e) {
    // Never hand database error text to anonymous callers — it can carry user
    // names, connection details and schema information.
    console.error("[public/water-use-dashboard] failed to build dashboard:", e);
    return NextResponse.json(
      { error: "The water use dashboard is temporarily unavailable." },
      { status: 503 }
    );
  }
}
