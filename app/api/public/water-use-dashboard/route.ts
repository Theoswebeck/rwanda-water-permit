import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";

const QuerySchema = z.object({
  // shared filters
  q: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  water_source: z.string().optional(),
  purpose: z.string().optional(),
  status: z.string().optional().default("all"),
  includeExpired: z.coerce.boolean().optional().default(false),
  from: z.string().optional(),
  to: z.string().optional(),
  // registry pagination
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

type IntensityBucket = "very_low" | "low" | "medium" | "high" | "very_high";

function parseDate(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizeUnit(unitRaw: string | null | undefined) {
  return (unitRaw || "").toLowerCase().replace(/\s+/g, "");
}

function convertAllowanceToM3PerDay(value: number, unitRaw: string | null | undefined): number | null {
  const unit = normalizeUnit(unitRaw);
  if (!Number.isFinite(value)) return null;

  if (unit.includes("m3/day") || unit.includes("m³/day") || unit.includes("m3perday") || unit.includes("m³perday")) return value;
  if (unit.includes("m3/year") || unit.includes("m³/year") || unit.includes("m3peryear") || unit.includes("m³peryear")) return value / 365;
  if (unit.includes("m3/month") || unit.includes("m³/month") || unit.includes("m3permonth") || unit.includes("m³permonth")) return value / 30;
  if (unit.includes("l/s") || unit.includes("lps") || unit.includes("litre/second") || unit.includes("liter/second")) return value * 0.001 * 86400;
  if (unit.includes("m3/s") || unit.includes("m³/s") || unit.includes("m3persecond") || unit.includes("m³persecond")) return value * 86400;
  return null;
}

function bucketFromM3PerDay(v: number | null): IntensityBucket {
  if (v === null) return "low";
  // Buckets chosen to be informative while not disclosing exact volumes.
  if (v < 50) return "very_low";
  if (v < 250) return "low";
  if (v < 1000) return "medium";
  if (v < 5000) return "high";
  return "very_high";
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

function durationLabel(issued: string | null | undefined, expiry: string | null | undefined): string {
  if (!issued || !expiry) return "N/A";
  const a = new Date(issued);
  const b = new Date(expiry);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "N/A";
  const days = Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
  const years = days / 365;
  if (years >= 1) return `${years.toFixed(1)} years`;
  const months = days / 30;
  if (months >= 1) return `${months.toFixed(0)} months`;
  return `${days} days`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
    }

    const {
      q,
      province,
      district,
      sector,
      water_source,
      purpose,
      status,
      includeExpired,
      from: fromRaw,
      to: toRaw,
      limit,
      offset,
    } = parsed.data;

    const from = parseDate(fromRaw);
    const to = parseDate(toRaw);
    const today = new Date();

    // Single query for all required public dashboard data.
    // NOTE: We intentionally DO NOT expose raw volumes in the response.
    const permitsRes = await query<{
      id: string;
      permit_number: string;
      status: string;
      water_source: string;
      purpose: string;
      water_allowance: string | number | null;
      allowance_unit: string | null;
      issued_date: string | null;
      expiry_date: string | null;
      created_at: string | null;
      province: string | null;
      district: string | null;
      sector: string | null;
      catchment_name_level_1: string | null;
      catchment_name_level_2: string | null;
      coordinates: { type?: string; coordinates?: [number, number] } | null;
    }>(
      `
      select
        p.id,
        p.permit_number,
        p.status::text as status,
        p.water_source::text as water_source,
        p.purpose::text as purpose,
        p.water_allowance,
        p.allowance_unit,
        p.issued_date::text as issued_date,
        p.expiry_date::text as expiry_date,
        p.created_at::text as created_at,
        a.province::text as province,
        a.district,
        a.sector,
        a.catchment_name_level_1,
        a.catchment_name_level_2,
        st_asgeojson(a.coordinates)::jsonb as coordinates
      from public.permits p
      left join public.applications a on a.id = p.application_id
      `
    );

    const qLower = q?.toLowerCase().trim();

    const filtered = permitsRes.rows.filter((p) => {
      if (!includeExpired) {
        const exp = p.expiry_date ? new Date(p.expiry_date) : null;
        if (exp && exp <= today) return false;
      }
      if (status && status !== "all" && String(p.status) !== status) return false;
      if (water_source && water_source !== "all" && String(p.water_source) !== water_source) return false;
      if (purpose && purpose !== "all" && String(p.purpose) !== purpose) return false;

      if (province && province !== "all" && String(p.province) !== province) return false;
      if (district && district !== "all" && String(p.district ?? "").toLowerCase() !== district.toLowerCase()) return false;
      if (sector && sector !== "all" && String(p.sector ?? "").toLowerCase() !== sector.toLowerCase()) return false;

      const issued = p.issued_date ? new Date(p.issued_date) : p.created_at ? new Date(p.created_at) : undefined;
      if (issued) {
        if (from && issued < from) return false;
        if (to && issued > to) return false;
      }

      if (qLower) {
        const hay = `${p.permit_number} ${p.district ?? ""} ${p.sector ?? ""} ${p.catchment_name_level_1 ?? ""} ${p.catchment_name_level_2 ?? ""}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }

      return true;
    });

    // Snapshot aggregations
    const totalPermitsIssued = filtered.length;
    const statusCounts = filtered.reduce((acc: Record<string, number>, p) => {
      const s = String(p.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const purposeCounts = filtered.reduce((acc: Record<string, number>, p) => {
      const k = String(p.purpose);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const waterSourceCounts = filtered.reduce((acc: Record<string, number>, p) => {
      const k = String(p.water_source);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const trendMap: Record<string, number> = {};
    for (const p of filtered) {
      const issued = p.issued_date ? new Date(p.issued_date) : p.created_at ? new Date(p.created_at) : undefined;
      if (!issued) continue;
      const k = monthKey(issued);
      trendMap[k] = (trendMap[k] || 0) + 1;
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, count]) => ({ month, permitsIssued: count }));

    // Month-over-month issuance delta (for "increased from last month" UI chips)
    const currentMonth = monthKey(new Date());
    const prevMonthDate = new Date();
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const previousMonth = monthKey(prevMonthDate);
    const permitsIssuedThisMonth = trendMap[currentMonth] || 0;
    const permitsIssuedLastMonth = trendMap[previousMonth] || 0;
    const permitsIssuedMoMPercent =
      permitsIssuedLastMonth > 0 ? ((permitsIssuedThisMonth - permitsIssuedLastMonth) / permitsIssuedLastMonth) * 100 : null;

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

    // Map points (public-safe, no volumes)
    const points = filtered
      .filter((p) => Boolean(p.coordinates))
      .map((p) => {
        const coords = p.coordinates;
        const lng = coords?.coordinates?.[0] ?? null;
        const lat = coords?.coordinates?.[1] ?? null;
        const m3Day = convertAllowanceToM3PerDay(Number(p.water_allowance || 0), p.allowance_unit);
        const intensity = bucketFromM3PerDay(m3Day);

        return {
          permitId: p.id,
          permitNumber: p.permit_number,
          status: p.status,
          waterSource: p.water_source,
          useType: p.purpose,
          province: p.province ?? null,
          district: p.district ?? null,
          sector: p.sector ?? null,
          catchment1: p.catchment_name_level_1 ?? null,
          catchment2: p.catchment_name_level_2 ?? null,
          lat,
          lng,
          intensity,
          issuedDate: p.issued_date,
          expiryDate: p.expiry_date,
        };
      });

    // Registry (non-confidential fields only) – paginated view
    const registryItems = filtered.slice(offset, offset + limit).map((p) => {
      return {
        permitId: p.id,
        permitNumber: p.permit_number,
        status: p.status,
        waterSource: p.water_source,
        useType: p.purpose,
        province: p.province ?? null,
        district: p.district ?? null,
        sector: p.sector ?? null,
        catchment1: p.catchment_name_level_1 ?? null,
        catchment2: p.catchment_name_level_2 ?? null,
        issuedDate: p.issued_date,
        expiryDate: p.expiry_date,
        duration: durationLabel(p.issued_date, p.expiry_date),
      };
    });

    return NextResponse.json({
      snapshot: {
        totalPermitsIssued,
        statusCounts,
        waterUseBySector,
        permitsByWaterSource,
        trend,
        permitsIssuedThisMonth,
        permitsIssuedLastMonth,
        permitsIssuedMoMPercent,
      },
      map: {
        points,
      },
      registry: {
        items: registryItems,
        pagination: {
          total: filtered.length,
          limit,
          offset,
          returned: registryItems.length,
        },
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


