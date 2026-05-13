import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await ctx.params;

  const year = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Kigali", year: "numeric" }).format(new Date()),
    10,
  );

  // Try the counter table first (atomic source of truth).
  try {
    const res = await query<{ last_issued: number }>(
      "SELECT last_issued FROM public.permit_number_counters WHERE year = $1",
      [year],
    );
    if (res.rows.length > 0) {
      const next = res.rows[0].last_issued + 1;
      return NextResponse.json({
        success: true,
        nextPermitNumber: `${String(next).padStart(6, "0")}/RWB/${year}`,
      });
    }
  } catch {
    // Table may not exist on this DB — fall through to permits-based estimate.
  }

  // Fallback: derive from the highest-numbered permit issued this year.
  try {
    const res = await query<{ max_seq: number | null }>(
      `SELECT MAX(
         CAST(SPLIT_PART(permit_number, '/', 1) AS INTEGER)
       ) AS max_seq
       FROM public.permits
       WHERE permit_number ~ '^[0-9]+/RWB/${year}$'`,
      [],
    );
    const maxSeq = res.rows[0]?.max_seq ?? 0;
    return NextResponse.json({
      success: true,
      nextPermitNumber: `${String(maxSeq + 1).padStart(6, "0")}/RWB/${year}`,
    });
  } catch {
    // permits table also unavailable — return a safe placeholder number.
    return NextResponse.json({
      success: true,
      nextPermitNumber: `000001/RWB/${year}`,
    });
  }
}
