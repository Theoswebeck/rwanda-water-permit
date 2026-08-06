import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { query } from "@/lib/db/postgres";
import { detectRegistrySchema } from "@/lib/permit/registry-counts";
import { buildUnifiedCte, REGISTRY_STATUS_COUNT_SQL } from "@/lib/permit/registry-unified";
import {
  ACTIVITY_CATEGORY_CODES,
  classifyActivity,
  getActivityCategoryLabel,
} from "@/lib/permit/activity-classification";
import {
  allCatchmentCodes,
  catchmentLabelForCode,
  getAllDistricts,
  resolveCatchment,
} from "@/lib/permit/catchment-resolution";

/**
 * Public Water Use Dashboard data.
 *
 * Aggregates only — this endpoint is unauthenticated, so it must never expose a
 * permit holder, permit number, contact, or precise location. It returns counts
 * per district, per catchment and per activity, plus the registry's headline
 * status counts.
 *
 * The numbers come from the same unified registry dataset the staff Permit
 * Registry reads, using the same status-bucket SQL, so the public totals equal
 * the internal ones by construction.
 */

const NOT_SPECIFIED_KEY = "not_specified";

type Bucket = { key: string; label: string; count: number; percentage: number };

type DashboardPayload = {
  generatedAt: string;
  totals: {
    total: number;
    operational: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  byDistrict: Bucket[];
  byCatchment: Bucket[];
  byActivity: Bucket[];
  catchmentAttribution: {
    fromCoordinates: number;
    estimatedFromLocation: number;
    unattributed: number;
  };
};

function toSortedBuckets(
  counts: Map<string, number>,
  labelFor: (key: string) => string,
  total: number,
  /** Optional tie-break order by key; keys not listed sort last among ties. */
  tieBreakOrder?: Map<string, number>
): Bucket[] {
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      label: labelFor(key),
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => {
      // "Not specified" always sinks to the bottom, everything else by count.
      if (a.key === NOT_SPECIFIED_KEY) return 1;
      if (b.key === NOT_SPECIFIED_KEY) return -1;
      if (b.count !== a.count) return b.count - a.count;
      if (tieBreakOrder) {
        const diff =
          (tieBreakOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
          (tieBreakOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER);
        if (diff !== 0) return diff;
      }
      return a.label.localeCompare(b.label);
    });
}

async function buildDashboard(): Promise<DashboardPayload> {
  const schema = await detectRegistrySchema();

  if (!schema.hasRegistry) {
    return {
      generatedAt: new Date().toISOString(),
      totals: { total: 0, operational: 0, expired: 0, cancelled: 0, expiringSoon: 0 },
      byDistrict: [],
      byCatchment: [],
      byActivity: [],
      catchmentAttribution: { fromCoordinates: 0, estimatedFromLocation: 0, unattributed: 0 },
    };
  }

  const cte = buildUnifiedCte(schema);

  const [summaryRes, rowsRes] = await Promise.all([
    query<{
      total: string;
      operational: string;
      expired: string;
      cancelled: string;
      expiring_soon: string;
    }>(`${cte} SELECT ${REGISTRY_STATUS_COUNT_SQL} FROM combined_permits pr`),
    query<{
      authorized_activity: string | null;
      location: string | null;
      latitude: number | string | null;
      longitude: number | string | null;
    }>(
      `${cte}
       SELECT pr.authorized_activity, pr.location, pr.latitude, pr.longitude
       FROM combined_permits pr`
    ),
  ]);

  const summary = summaryRes.rows[0];
  const rows = rowsRes.rows || [];
  const total = Number(summary?.total || rows.length);

  const districtCounts = new Map<string, number>();
  const catchmentCounts = new Map<string, number>();
  const activityCounts = new Map<string, number>();
  const attribution = { fromCoordinates: 0, estimatedFromLocation: 0, unattributed: 0 };

  // Seed every known bucket at zero so the dashboard shows the full list of
  // districts/catchments rather than only the ones that happen to have permits.
  for (const district of getAllDistricts()) districtCounts.set(district, 0);
  for (const code of allCatchmentCodes()) catchmentCounts.set(code, 0);

  const increment = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const row of rows) {
    const resolution = resolveCatchment({
      latitude: row.latitude as number | null,
      longitude: row.longitude as number | null,
      location: row.location,
    });

    increment(districtCounts, resolution.district ?? NOT_SPECIFIED_KEY);
    increment(catchmentCounts, resolution.code ?? NOT_SPECIFIED_KEY);
    increment(activityCounts, classifyActivity(row.authorized_activity));

    if (resolution.source === "coordinates") attribution.fromCoordinates += 1;
    else if (resolution.source === "unresolved") attribution.unattributed += 1;
    else attribution.estimatedFromLocation += 1;
  }

  const districtLabel = (key: string) =>
    key === NOT_SPECIFIED_KEY ? "Location not specified" : key;
  const catchmentLabel = (key: string) =>
    key === NOT_SPECIFIED_KEY
      ? "Not attributable to a catchment"
      : catchmentLabelForCode(key) ?? key;

  // Order activities by the canonical taxonomy when counts tie, so the tab is
  // stable between requests. Passed as a tie-break rather than re-sorting the
  // result, which would undo the "Not specified sinks to the bottom" rule.
  const activityOrder = new Map(ACTIVITY_CATEGORY_CODES.map((code, i) => [code as string, i]));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      total,
      operational: Number(summary?.operational || 0),
      expired: Number(summary?.expired || 0),
      cancelled: Number(summary?.cancelled || 0),
      expiringSoon: Number(summary?.expiring_soon || 0),
    },
    byDistrict: toSortedBuckets(districtCounts, districtLabel, total),
    byCatchment: toSortedBuckets(catchmentCounts, catchmentLabel, total),
    byActivity: toSortedBuckets(activityCounts, getActivityCategoryLabel, total, activityOrder),
    catchmentAttribution: attribution,
  };
}

/**
 * 5-minute cache. The registry changes rarely, and this endpoint is public and
 * unauthenticated — an uncached full scan of the registry on every page view
 * would be a free way to exhaust the shared connection pool. A route handler
 * stays dynamic in Next 15 regardless of a `revalidate` segment option, so the
 * caching has to live here.
 */
const getCachedDashboard = unstable_cache(buildDashboard, ["public-water-use-dashboard"], {
  revalidate: 300,
});

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
