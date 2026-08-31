import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import { requireApiKey, apiError } from "@/lib/api/api-key-auth";

export const runtime = "nodejs";

const ListSchema = z.object({
  q: z.string().max(120).optional(),
  province: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  sector: z.string().max(80).optional(),
  water_source: z.string().max(60).optional(),
  purpose: z.string().max(120).optional(),
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

type ListRow = {
  permit_number: string;
  status: string;
  water_source: string;
  purpose: string;
  issued_date: string | null;
  expiry_date: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  catchment1: string | null;
  catchment2: string | null;
  total_count: string;
};

/**
 * GET /api/v1/permits  (scope `permits:read`)
 *
 * Filtered registry search over the same public-registry query the public
 * permit registry page uses — same rows, same exclusion of deactivated
 * permits (suspended/revoked). No permit-holder or contact fields exist on
 * this endpoint by construction (the public registry does not list them).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, "permits:read");
  if (!auth.ok) return auth.response;

  const parsed = ListSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return apiError("INVALID_PARAMS", "Invalid query parameters.", 400);
  }
  const { q, province, district, sector, water_source, purpose, status, limit, offset } = parsed.data;

  // Dynamic but fully parameterized — every value goes through $n placeholders.
  const where: string[] = [
    // Public registry excludes deactivated permits (suspended/revoked, e.g. a
    // disabled test permit). Expired/expiring permits remain listed. Mirrors
    // the prod public registry; see the disable-test-permit design doc.
    "p.status not in ('suspended', 'revoked')",
  ];
  const params: (string | number)[] = [];
  const add = (cond: string, value: string | number) => {
    params.push(value);
    where.push(cond.replace("?", `$${params.length}`));
  };

  if (q) {
    add(
      `(${["p.permit_number", "a.district", "a.sector", "a.catchment_name_level_1", "a.catchment_name_level_2"]
        .map((col) => `${col} ilike '%'||?||'%'`)
        .join(" or ")})`,
      q.trim()
    );
  }
  if (province && province !== "all") add(`a.province::text = ?`, province);
  if (district && district !== "all") add(`a.district ilike ?`, district);
  if (sector && sector !== "all") add(`a.sector ilike ?`, sector);
  if (water_source && water_source !== "all") add(`p.water_source::text = ?`, water_source);
  if (purpose && purpose !== "all") add(`p.purpose::text = ?`, purpose);
  if (status) add(`p.status::text = ?`, status);

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  try {
    const res = await query<ListRow>(
      `select
        p.permit_number,
        p.status::text as status,
        p.water_source::text as water_source,
        p.purpose::text as purpose,
        p.issued_date::text as issued_date,
        p.expiry_date::text as expiry_date,
        a.province::text as province,
        a.district,
        a.sector,
        a.catchment_name_level_1 as catchment1,
        a.catchment_name_level_2 as catchment2,
        count(*) over() as total_count
      from public.permits p
      left join public.applications a on a.id = p.application_id
      where ${where.join(" and ")}
      order by p.issued_date desc nulls last, p.created_at desc nulls last
      limit $${limitIdx} offset $${offsetIdx}`,
      params
    );

    const total = res.rows[0] ? Number(res.rows[0].total_count) : 0;
    return NextResponse.json({
      data: res.rows.map(({ total_count: _tc, ...item }) => item),
      meta: { total, limit, offset, returned: res.rows.length },
    });
  } catch (e) {
    console.error("[api/v1/permits] list failed:", e);
    return apiError("INTERNAL_ERROR", "Search is temporarily unavailable.", 500);
  }
}
