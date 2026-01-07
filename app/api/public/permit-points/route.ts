import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const QuerySchema = z.object({
  status: z.string().optional().default("active"),
  includeExpired: z.coerce.boolean().optional().default(false),
});

type IntensityBucket = "very_low" | "low" | "medium" | "high" | "very_high";

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
  // Buckets chosen to be informative but not disclose exact volumes.
  if (v < 50) return "very_low";
  if (v < 250) return "low";
  if (v < 1000) return "medium";
  if (v < 5000) return "high";
  return "very_high";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      status: searchParams.get("status") || undefined,
      includeExpired: searchParams.get("includeExpired") || undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid query params" }, { status: 400 });

    const { status, includeExpired } = parsed.data;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("permits")
      .select(
        `
        id,
        permit_number,
        status,
        water_source,
        purpose,
        water_allowance,
        allowance_unit,
        issued_date,
        expiry_date,
        application:applications!application_id(
          province,
          district,
          sector,
          catchment_name_level_1,
          catchment_name_level_2,
          coordinates
        )
      `
      )
      .not("application.coordinates", "is", null);

    if (error) throw error;

    const today = new Date();

    const filtered = (data || []).filter((p: any) => {
      if (!includeExpired) {
        const exp = p.expiry_date ? new Date(p.expiry_date) : null;
        if (exp && exp <= today) return false;
      }
      if (status && status !== "all") {
        if (String(p.status) !== status) return false;
      }
      return true;
    });

    const points = filtered.map((p: any) => {
      const app = p.application || {};
      const coords = app.coordinates;
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
        province: app.province ?? null,
        district: app.district ?? null,
        sector: app.sector ?? null,
        catchment1: app.catchment_name_level_1 ?? null,
        catchment2: app.catchment_name_level_2 ?? null,
        lat,
        lng,
        intensity, // bucket only (no volumes)
        issuedDate: p.issued_date,
        expiryDate: p.expiry_date,
      };
    });

    return NextResponse.json({ items: points });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


