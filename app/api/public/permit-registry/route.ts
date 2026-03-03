import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";

const QuerySchema = z.object({
  q: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  water_source: z.string().optional(),
  purpose: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

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

    const { q, province, district, sector, water_source, purpose, limit, offset } = parsed.data;
    const dbRows = await query<{
      id: string;
      permit_number: string;
      status: string;
      water_source: string;
      purpose: string;
      issued_date: string | null;
      expiry_date: string | null;
      province: string | null;
      district: string | null;
      sector: string | null;
      catchment_name_level_1: string | null;
      catchment_name_level_2: string | null;
    }>(
      `
      select
        p.id,
        p.permit_number,
        p.status::text as status,
        p.water_source::text as water_source,
        p.purpose::text as purpose,
        p.issued_date::text as issued_date,
        p.expiry_date::text as expiry_date,
        a.province::text as province,
        a.district,
        a.sector,
        a.catchment_name_level_1,
        a.catchment_name_level_2
      from public.permits p
      left join public.applications a on a.id = p.application_id
      order by p.issued_date desc nulls last, p.created_at desc nulls last
      offset $1 limit $2
      `,
      [offset, limit]
    );

    const rows = dbRows.rows.map((p) => {
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

    // Apply filters in-memory to avoid complex joins with dynamic conditions
    // (limit is capped and intended for public exploration, not heavy analytics).
    const qLower = q?.toLowerCase().trim();
    const filtered = rows.filter((r) => {
      if (province && province !== "all" && String(r.province) !== province) return false;
      if (district && district !== "all" && String(r.district ?? "").toLowerCase() !== district.toLowerCase()) return false;
      if (sector && sector !== "all" && String(r.sector ?? "").toLowerCase() !== sector.toLowerCase()) return false;
      if (water_source && water_source !== "all" && String(r.waterSource) !== water_source) return false;
      if (purpose && purpose !== "all" && String(r.useType) !== purpose) return false;
      if (qLower) {
        const hay = `${r.permitNumber} ${r.district ?? ""} ${r.sector ?? ""} ${r.catchment1 ?? ""} ${r.catchment2 ?? ""}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });

    return NextResponse.json({
      items: filtered,
      pagination: { limit, offset, returned: filtered.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


