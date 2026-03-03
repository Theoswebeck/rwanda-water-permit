import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

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
    const orderDir = sortDir ? "asc" : "desc";
    const where: string[] = [];
    const values: unknown[] = [];
    const p = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (regime && regime !== "all") where.push(`regime = ${p(regime)}`);
    if (status && status !== "all") where.push(`status = ${p(status.toUpperCase())}`);
    if (q) {
      const term = `%${q}%`;
      const pv = p(term);
      where.push(
        `(lower(permit_holder) like ${pv} or lower(permit_number) like ${pv} or lower(location) like ${pv} or lower(water_source) like ${pv} or lower(authorized_activity) like ${pv})`
      );
    }
    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    const totalRes = await query<{ count: string }>(
      `select count(*)::text as count from public.permit_registry ${whereSql}`,
      values
    );
    const pageRes = await query(
      `
      select *
      from public.permit_registry
      ${whereSql}
      order by ${column} ${orderDir} nulls last
      offset ${p(offset)} limit ${p(limit)}
      `,
      values
    );
    const count = Number(totalRes.rows[0]?.count || "0");
    const data = pageRes.rows;

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
