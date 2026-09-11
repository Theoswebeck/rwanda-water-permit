import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";
import { generateClaimToken } from "@/lib/api/api-key-auth";
import { sendSmtpEmail } from "@/lib/notifications/smtp-email";
import { buildPortalLink } from "@/lib/notifications/portal-url";

export const runtime = "nodejs";

type GrantRow = {
  id: string;
  request_id: string;
  scopes: string[];
  rate_limit_per_min: number;
  valid_until: Date;
  status: string;
  technical_email: string;
  institution_name: string;
  reference_no: string;
};

const ActionSchema = z.discriminatedUnion("action", [
  // Extend: bump valid_until; must be a future date.
  z.object({
    action: z.literal("extend"),
    valid_until: z.coerce.date().refine((d) => d > new Date(), "Must be a future date."),
    notes: z.string().max(2000).optional(),
  }),
  // Revoke: immediate.
  z.object({ action: z.literal("revoke"), notes: z.string().max(2000).optional() }),
  // Reissue: revoke the old key and authorise a fresh one with the same scope
  // and rate limit (lost key / leak / expired claim link). A new one-time
  // claim link is emailed to the technical contact; no key is returned here.
  z.object({
    action: z.literal("reissue"),
    period_months: z.coerce.number().int().min(1).max(60),
  }),
]);

/**
 * POST /api/admin/api-access/grants/[id] — lifecycle actions on an issued
 * grant: extend, revoke, reissue (design §5.2, §7.2).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const current = await query<GrantRow>(
      `select g.id, g.request_id, g.scopes, g.rate_limit_per_min, g.valid_until, g.status,
              r.technical_email, r.institution_name, r.reference_no
       from api_access_grants g
       join api_access_requests r on r.id = g.request_id
       where g.id = $1 limit 1`,
      [id]
    );
    const grant = current.rows[0];
    if (!grant) return NextResponse.json({ error: "Grant not found." }, { status: 404 });

    if (parsed.data.action === "revoke") {
      if (grant.status === "revoked") {
        return NextResponse.json({ error: "This key is already revoked." }, { status: 409 });
      }
      await query(
        `update api_access_grants set status = 'revoked' where id = $1`,
        [id]
      );
      return NextResponse.json({ ok: true, status: "revoked" });
    }

    if (parsed.data.action === "extend") {
      if (grant.status === "revoked") {
        return NextResponse.json(
          { error: "A revoked key cannot be extended; reissue instead." },
          { status: 409 }
        );
      }
      await query(`update api_access_grants set valid_until = $2 where id = $1`, [
        id,
        parsed.data.valid_until,
      ]);
      return NextResponse.json({ ok: true, valid_until: parsed.data.valid_until });
    }

    // ── Reissue ─────────────────────────────────────────────────────────────
    // Revoke the old grant and create a fresh unclaimed one: the technical
    // contact gets a new one-time claim link and generates the key themselves.
    // This doubles as "resend the claim link" for unclaimed/expired links.
    const { token, hash: tokenHash } = generateClaimToken();
    const claimExpires = new Date(Date.now() + 14 * 86_400_000);
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + parsed.data.period_months);

    await query("begin");
    try {
      await query(`update api_access_grants set status = 'revoked' where id = $1`, [id]);
      await query(
        `insert into api_access_grants
           (request_id, claim_token_hash, claim_expires_at, scopes, rate_limit_per_min, valid_until, granted_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [grant.request_id, tokenHash, claimExpires, grant.scopes, grant.rate_limit_per_min, validUntil, auth.email]
      );
      await query("commit");
    } catch (txErr) {
      await query("rollback");
      throw txErr;
    }

    let claimEmailSent = true;
    try {
      await sendSmtpEmail({
        to: grant.technical_email,
        subject: `API key reissued — ${grant.reference_no}`,
        title: "API Key Reissued",
        text: [
          `A new API key was authorised for ${grant.institution_name} (${grant.reference_no}).`,
          `The previous key has been revoked.`,
          `Valid until: ${validUntil.toISOString().slice(0, 10)}`,
          ``,
          `Retrieve the new key with this one-time secure link (valid 14 days, single use):`,
          buildPortalLink(`/api-access/claim?token=${token}`),
          ``,
          `The key is generated and shown only when you open the link — nobody at RWB can see it.`,
          `API documentation: ${buildPortalLink("/api-access/docs")}`,
        ].join("\n"),
      });
    } catch (e) {
      claimEmailSent = false;
      console.error("[admin/api-access] reissue email failed:", e);
    }

    return NextResponse.json({
      ok: true,
      claim_sent_to: claimEmailSent ? grant.technical_email : null,
      grant: { valid_until: validUntil },
    });
  } catch (e) {
    console.error("[admin/api-access] grant action failed:", e);
    return NextResponse.json({ error: "Could not perform the action." }, { status: 500 });
  }
}
