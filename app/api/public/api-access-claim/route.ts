import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import { generateApiKey, hashApiKey } from "@/lib/api/api-key-auth";

export const runtime = "nodejs";

/**
 * POST /api/public/api-access-claim — one-time API-key claim.
 *
 * The approval email carries a single-use claim link; opening it and pressing
 * "Reveal" POSTs the token here. The key is generated NOW, its hash stored,
 * and the plaintext returned exactly once — to the requester, never the admin.
 * POST-only by design so mail-scanner GET prefetches cannot burn the token.
 */

const ClaimSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

type ClaimRow = {
  id: string;
  status: string;
  claim_expires_at: Date;
  claimed_at: Date | null;
  scopes: string[];
  valid_until: Date;
  institution_name: string;
  reference_no: string;
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "This claim link is not valid." }, { status: 400 });
  }

  try {
    const rows = await query<ClaimRow>(
      `select g.id, g.status, g.claim_expires_at, g.claimed_at, g.scopes, g.valid_until,
              r.institution_name, r.reference_no
       from api_access_grants g
       join api_access_requests r on r.id = g.request_id
       where g.claim_token_hash = $1
       limit 1`,
      [hashApiKey(parsed.data.token)]
    );
    const grant = rows.rows[0];
    if (!grant) {
      return NextResponse.json({ error: "This claim link is not valid." }, { status: 404 });
    }
    if (grant.claimed_at) {
      return NextResponse.json(
        { error: `This key was already claimed on ${new Date(grant.claimed_at).toISOString().slice(0, 10)}. If that was not you, contact RWB immediately to revoke it.` },
        { status: 409 }
      );
    }
    if (grant.status !== "active") {
      return NextResponse.json(
        { error: "This grant has been revoked. Contact RWB if you believe this is an error." },
        { status: 410 }
      );
    }
    if (new Date() > new Date(grant.claim_expires_at)) {
      return NextResponse.json(
        { error: "This claim link has expired. Contact RWB to have a new one sent." },
        { status: 410 }
      );
    }

    const { key, hash, prefix } = generateApiKey();
    // The `claimed_at is null` guard makes the claim race-safe: a concurrent
    // second claim updates zero rows and gets the already-claimed response.
    const updated = await query(
      `update api_access_grants
       set api_key_hash = $2, key_prefix = $3, claimed_at = now()
       where id = $1 and claimed_at is null`,
      [grant.id, hash, prefix]
    );
    if (updated.rowCount === 0) {
      return NextResponse.json({ error: "This key was already claimed." }, { status: 409 });
    }

    return NextResponse.json({
      key, // shown once, to the requester only; never stored, never logged
      key_prefix: prefix,
      scopes: grant.scopes,
      valid_until: grant.valid_until,
      institution_name: grant.institution_name,
      reference_no: grant.reference_no,
    });
  } catch (e) {
    console.error("[api-access-claim] failed:", e);
    return NextResponse.json(
      { error: "Key claim is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
