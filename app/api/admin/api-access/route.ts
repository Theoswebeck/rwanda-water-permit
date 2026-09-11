import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";

export const runtime = "nodejs";

/**
 * GET /api/admin/api-access — everything the admin "API Access" tab renders:
 * agency requests (the queue) and issued grants (keys, usage, expiry).
 * Middleware + requireRole both gate this to admins.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const [requests, grants] = await Promise.all([
      query(
        `select id, reference_no, institution_name, institution_type, tin, contact_name,
                contact_email, contact_phone, technical_email, purpose, requested_scopes,
                requested_period_months, static_ip, status, review_notes, reviewed_by,
                reviewed_at, created_at
         from api_access_requests
         order by created_at desc
         limit 500`
      ),
      query(
        `select g.id, g.request_id, g.key_prefix, g.scopes, g.rate_limit_per_min,
                g.valid_from, g.valid_until, g.status, g.granted_by, g.created_at,
                g.last_used_at, g.total_requests, g.claimed_at, g.claim_expires_at,
                r.institution_name, r.reference_no
         from api_access_grants g
         join api_access_requests r on r.id = g.request_id
         order by g.created_at desc
         limit 500`
      ),
    ]);

    return NextResponse.json({ requests: requests.rows, grants: grants.rows });
  } catch (e) {
    console.error("[admin/api-access] list failed:", e);
    return NextResponse.json({ error: "Could not load API access data." }, { status: 500 });
  }
}
