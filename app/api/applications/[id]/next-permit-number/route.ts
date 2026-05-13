import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await ctx.params; // consume params (required by Next.js even if unused)

  // Use Africa/Kigali timezone — same as the DB trigger — so the year matches.
  const year = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Kigali", year: "numeric" }).format(new Date()),
    10,
  );

  try {
    const res = await query<{ last_issued: number }>(
      "SELECT last_issued FROM public.permit_number_counters WHERE year = $1",
      [year],
    );

    const lastIssued = res.rows[0]?.last_issued ?? 0;
    const next = lastIssued + 1;
    const nextPermitNumber = `${String(next).padStart(6, "0")}/RWB/${year}`;

    return NextResponse.json({ success: true, nextPermitNumber });
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not fetch permit counter" },
      { status: 500 },
    );
  }
}
