import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import {
  consolidatePermitRecords,
  createConsolidatedPermitFromPermit,
  createConsolidatedPermitFromRegistry,
  type ConsolidatedPermitRecord,
  type PermitDashboardPermitRow,
  type PermitDashboardRegistryRow,
} from "@/lib/permit/consolidated-permit-records";

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
    fish_farming_lakes: "Fish farming (lakes)",
    fish_farming_ponds: "Fish farming (ponds)",
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
    stream: "Stream/River",
    lake: "Lake",
    groundwater: "Groundwater",
    borehole: "Groundwater (Borehole)",
    surface_water: "Dam/Reservoir",
    dam: "Dam/Reservoir",
    reservoir: "Dam/Reservoir",
    spring: "Spring",
    wetland: "Wetland",
    other: "Other",
  };
  return map[source] || source;
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
    } = parsed.data;

    const from = parseDate(fromRaw);
    const to = parseDate(toRaw);
    const today = new Date();

    const [permitsRes, registryRes] = await Promise.all([
      query<PermitDashboardPermitRow>(
        `
        select
          p.id,
          p.application_id,
          p.permit_number,
          p.status::text as status,
          p.water_source::text as water_source,
          p.purpose::text as purpose,
          p.water_allowance,
          p.allowance_unit,
          p.issued_date::text as issued_date,
          p.expiry_date::text as expiry_date,
          p.created_at::text as created_at,
          p.updated_at::text as updated_at,
          a.province::text as province,
          a.district,
          a.sector,
          a.catchment_name_level_1,
          a.catchment_name_level_2,
          coalesce(a.project_title, '') as permit_holder,
          concat_ws(', ', a.district, a.sector, a.province::text) as location,
          case
            when coalesce(p.coordinates, a.coordinates) is null then null
            else st_y(st_centroid(coalesce(p.coordinates, a.coordinates)))
          end as lat,
          case
            when coalesce(p.coordinates, a.coordinates) is null then null
            else st_x(st_centroid(coalesce(p.coordinates, a.coordinates)))
          end as lng
        from public.permits p
        left join public.applications a on a.id = p.application_id
        `
      ),
      query<PermitDashboardRegistryRow>(
        `
        select
          id::text as id,
          permit_number,
          status::text as status,
          water_source,
          authorized_activity,
          volume_or_area,
          issuance_date::text as issuance_date,
          expiration_date::text as expiration_date,
          created_at::text as created_at,
          updated_at::text as updated_at,
          latitude,
          longitude,
          permit_holder,
          location
        from public.permit_registry
        `
      ).catch(() => ({ rows: [] as PermitDashboardRegistryRow[] })),
    ]);

    const systemPermits = permitsRes.rows
      .map(createConsolidatedPermitFromPermit)
      .filter((record): record is ConsolidatedPermitRecord => Boolean(record));

    const registryPermits = registryRes.rows
      .map(createConsolidatedPermitFromRegistry)
      .filter((record): record is ConsolidatedPermitRecord => Boolean(record));

    const consolidated = consolidatePermitRecords([...systemPermits, ...registryPermits]);

    const qLower = q?.toLowerCase().trim();

    const filtered = consolidated.filter((p) => {
      if (!includeExpired) {
        const exp = p.expiryDate ? new Date(p.expiryDate) : null;
        if (exp && exp <= today) return false;
      }
      if (status && status !== "all" && String(p.status) !== status) return false;
      if (water_source && water_source !== "all" && String(p.waterSource) !== water_source) return false;
      if (purpose && purpose !== "all" && String(p.purpose) !== purpose) return false;

      if (province && province !== "all" && String(p.province) !== province) return false;
      if (district && district !== "all" && String(p.district ?? "").toLowerCase() !== district.toLowerCase()) return false;
      if (sector && sector !== "all" && String(p.sector ?? "").toLowerCase() !== sector.toLowerCase()) return false;

      const issued = p.issuedDate ? new Date(p.issuedDate) : p.createdAt ? new Date(p.createdAt) : undefined;
      if (issued) {
        if (from && issued < from) return false;
        if (to && issued > to) return false;
      }

      if (qLower) {
        const hay = [
          p.permitNumber,
          p.district ?? "",
          p.sector ?? "",
          p.catchment1 ?? "",
          p.catchment2 ?? "",
          p.permitHolder ?? "",
          p.locationSummary ?? "",
        ]
          .join(" ")
          .toLowerCase();
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
      const k = String(p.waterSource);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const trendMap: Record<string, number> = {};
    for (const p of filtered) {
      const issued = p.issuedDate ? new Date(p.issuedDate) : p.createdAt ? new Date(p.createdAt) : undefined;
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

    // Year-over-year: same month last year
    const sameMonthLastYearDate = new Date();
    sameMonthLastYearDate.setFullYear(sameMonthLastYearDate.getFullYear() - 1);
    const sameMonthLastYear = monthKey(sameMonthLastYearDate);
    const permitsIssuedSameMonthLastYear = trendMap[sameMonthLastYear] || 0;
    const permitsIssuedYoYPercent =
      permitsIssuedSameMonthLastYear > 0 ? ((permitsIssuedThisMonth - permitsIssuedSameMonthLastYear) / permitsIssuedSameMonthLastYear) * 100 : null;

    // Permits by province
    const provinceCounts = filtered.reduce((acc: Record<string, number>, p) => {
      const k = String(p.province ?? "Unknown").trim() || "Unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const provinceTotal = Object.values(provinceCounts).reduce((s, n) => s + n, 0) || 1;
    const permitsByProvince = Object.entries(provinceCounts)
      .map(([key, count]) => ({ key, label: key, count, percentage: (count / provinceTotal) * 100 }))
      .sort((a, b) => b.count - a.count);

    // Permits by catchment basin (level 1), top 8 + "Other"
    const catchmentCounts = filtered.reduce((acc: Record<string, number>, p) => {
      const k = String(p.catchment1 ?? "").trim() || "Unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const catchmentTotal = Object.values(catchmentCounts).reduce((s, n) => s + n, 0) || 1;
    const catchmentSorted = Object.entries(catchmentCounts).sort((a, b) => b[1] - a[1]);
    const topCatchments = catchmentSorted.slice(0, 8).map(([key, count]) => ({
      key,
      label: key,
      count,
      percentage: (count / catchmentTotal) * 100,
    }));
    const otherCatchmentCount = catchmentSorted.slice(8).reduce((s, [, n]) => s + n, 0);
    if (otherCatchmentCount > 0) {
      topCatchments.push({ key: "other", label: "Other", count: otherCatchmentCount, percentage: (otherCatchmentCount / catchmentTotal) * 100 });
    }
    const permitsByCatchment = topCatchments;

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
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => {
        const m3Day = convertAllowanceToM3PerDay(Number(p.waterAllowance || 0), p.allowanceUnit);
        const intensity = bucketFromM3PerDay(m3Day);

        return {
          permitId: p.permitId,
          permitNumber: p.permitNumber,
          status: p.status,
          waterSource: p.waterSource,
          useType: p.purpose,
          province: p.province ?? null,
          district: p.district ?? null,
          sector: p.sector ?? null,
          catchment1: p.catchment1 ?? null,
          catchment2: p.catchment2 ?? null,
          lat: p.lat,
          lng: p.lng,
          intensity,
          issuedDate: p.issuedDate,
          expiryDate: p.expiryDate,
        };
      });

    return NextResponse.json({
      snapshot: {
        totalPermitsIssued,
        statusCounts,
        waterUseBySector,
        permitsByWaterSource,
        permitsByProvince,
        permitsByCatchment,
        trend,
        permitsIssuedThisMonth,
        permitsIssuedLastMonth,
        permitsIssuedMoMPercent,
        permitsIssuedYoYPercent,
      },
      map: {
        points,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


