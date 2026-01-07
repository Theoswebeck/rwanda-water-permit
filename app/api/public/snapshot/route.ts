import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function parseDate(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function labelPurpose(purpose: string) {
  const map: Record<string, string> = {
    domestic: "Domestic supply",
    irrigation: "Irrigation",
    industrial: "Industry",
    electricity_generation: "Hydropower",
    mining: "Mining",
    aquaculture: "Fish farming",
    recreation: "Recreation",
    municipal_supply: "Municipal supply",
    livestock: "Livestock",
    other: "Other",
  };
  return map[purpose] || purpose;
}

function labelWaterSource(source: string) {
  const map: Record<string, string> = {
    river: "Stream/River",
    lake: "Lake",
    groundwater: "Groundwater",
    borehole: "Groundwater (Borehole)",
    surface_water: "Dam/Reservoir",
    spring: "Spring",
    other: "Other",
  };
  return map[source] || source;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
    }

    const from = parseDate(parsed.data.from);
    const to = parseDate(parsed.data.to);

    const supabase = createAdminClient();

    // Permits (non-confidential summary)
    const { data: permits, error: permitsError } = await supabase
      .from("permits")
      .select("id,status,water_source,purpose,issued_date,expiry_date,created_at");

    if (permitsError) throw permitsError;

    const now = new Date();
    const filteredPermits = (permits || []).filter((p: any) => {
      const issued = p.issued_date ? new Date(p.issued_date) : p.created_at ? new Date(p.created_at) : undefined;
      if (!issued) return true;
      if (from && issued < from) return false;
      if (to && issued > to) return false;
      return true;
    });

    const totalPermitsIssued = filteredPermits.length;
    const statusCounts = filteredPermits.reduce((acc: Record<string, number>, p: any) => {
      const s = String(p.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const purposeCounts = filteredPermits.reduce((acc: Record<string, number>, p: any) => {
      const k = String(p.purpose);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const waterSourceCounts = filteredPermits.reduce((acc: Record<string, number>, p: any) => {
      const k = String(p.water_source);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    // Trend over time (permits issued per month)
    const trendMap: Record<string, number> = {};
    for (const p of filteredPermits) {
      const issued = p.issued_date ? new Date(p.issued_date) : p.created_at ? new Date(p.created_at) : undefined;
      if (!issued) continue;
      const k = monthKey(issued);
      trendMap[k] = (trendMap[k] || 0) + 1;
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, count]) => ({ month, permitsIssued: count }));

    const purposeTotal = Object.values(purposeCounts).reduce((s, n) => s + n, 0) || 1;
    const waterSourceTotal = Object.values(waterSourceCounts).reduce((s, n) => s + n, 0) || 1;

    const waterUseBySector = Object.entries(purposeCounts)
      .map(([key, count]) => ({
        key,
        label: labelPurpose(key),
        percentage: (count / purposeTotal) * 100,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const permitsByWaterSource = Object.entries(waterSourceCounts)
      .map(([key, count]) => ({
        key,
        label: labelWaterSource(key),
        percentage: (count / waterSourceTotal) * 100,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalPermitsIssued,
      statusCounts,
      waterUseBySector,
      permitsByWaterSource,
      trend,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


