import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";
import { generateApiKey } from "@/lib/api/api-key-auth";
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
  // Reissue: revoke the old key and mint a fresh one with the same scope and
  // rate limit (lost key / suspected leak). Returns the new plaintext once.
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
    const { key, hash, prefix } = generateApiKey();
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + parsed.data.period_months);

    await query("begin");
    try {
      await query(`update api_access_grants set status = 'revoked' where id = $1`, [id]);
      await query(
        `insert into api_access_grants
           (request_id, api_key_hash, key_prefix, scopes, rate_limit_per_min, valid_until, granted_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [grant.request_id, hash, prefix, grant.scopes, grant.rate_limit_per_min, validUntil, auth.email]
      );
      await query("commit");
    } catch (txErr) {
      await query("rollback");
      throw txErr;
    }

    void sendSmtpEmail({
      to: grant.technical_email,
      subject: `API key reissued — ${grant.reference_no}`,
      title: "API Key Reissued",
      text: [
        `A new API key was issued for ${grant.institution_name} (${grant.reference_no}).`,
        `The previous key has been revoked.`,
        `Valid until: ${validUntil.toISOString().slice(0, 10)}`,
        ``,
        `The new key itself is delivered separately by the Rwanda Water Resources Board — it is never sent by email.`,
        `API documentation: ${buildPortalLink("/api-access/docs")}`,
      ].join("\n"),
    }).catch((e) => console.error("[admin/api-access] reissue email failed:", e));

    return NextResponse.json({
      ok: true,
      key, // shown once in the UI; never stored, never emailed
      grant: { key_prefix: prefix, valid_until: validUntil },
    });
  } catch (e) {
    console.error("[admin/api-access] grant action failed:", e);
    return NextResponse.json({ error: "Could not perform the action." }, { status: 500 });
  }
}
