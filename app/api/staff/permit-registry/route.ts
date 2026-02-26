import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const regime = searchParams.get("regime") || "all";
    const status = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sort_by") || "serial_number";
    const sortDir = searchParams.get("sort_dir") === "desc" ? false : true;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const supabase = createAdminClient();

    let query = supabase
      .from("permit_registry")
      .select("*", { count: "exact" });

    if (regime && regime !== "all") {
      query = query.eq("regime", regime);
    }
    if (status && status !== "all") {
      query = query.eq("status", status.toUpperCase());
    }

    if (q) {
      query = query.or(
        `permit_holder.ilike.%${q}%,permit_number.ilike.%${q}%,location.ilike.%${q}%,water_source.ilike.%${q}%,authorized_activity.ilike.%${q}%`
      );
    }

    const validSortColumns = [
      "serial_number",
      "permit_holder",
      "permit_number",
      "issuance_date",
      "expiration_date",
      "status",
      "regime",
    ];
    const column = validSortColumns.includes(sortBy) ? sortBy : "serial_number";

    query = query
      .order(column, { ascending: sortDir, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      items: data || [],
      total: count ?? 0,
      pagination: { limit, offset, returned: (data || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
