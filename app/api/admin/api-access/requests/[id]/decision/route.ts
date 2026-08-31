import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";
import { generateApiKey } from "@/lib/api/api-key-auth";
import { sendSmtpEmail } from "@/lib/notifications/smtp-email";
import { buildPortalLink } from "@/lib/notifications/portal-url";

export const runtime = "nodejs";

type RequestRow = {
  id: string;
  reference_no: string;
  institution_name: string;
  technical_email: string;
  requested_scopes: string[];
  status: string;
};

const DecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    scopes: z.array(z.enum(["permits:verify", "permits:read", "stats:read"])).min(1),
    period_months: z.coerce.number().int().min(1).max(60),
    rate_limit_per_min: z.coerce.number().int().min(1).max(6000).optional().default(60),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    notes: z.string().trim().min(3, "A rejection reason is required.").max(2000),
  }),
]);

/**
 * POST /api/admin/api-access/requests/[id]/decision — approve or reject an
 * agency API access request (design §6.2).
 *
 * Approve: the granted scopes MUST be a subset of what the agency requested
 * (validated server-side; the UI also only renders the requested scopes).
 * The plaintext key is returned exactly once — only its hash is stored — and
 * a best-effort notification goes to the technical contact (the key itself is
 * NEVER emailed; the admin delivers it over a secure channel).
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
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const current = await query<RequestRow>(
      `select id, reference_no, institution_name, technical_email, requested_scopes, status
       from api_access_requests where id = $1 limit 1`,
      [id]
    );
    const request = current.rows[0];
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (request.status !== "pending") {
      return NextResponse.json(
        { error: `This request was already ${request.status}.` },
        { status: 409 }
      );
    }

    if (parsed.data.action === "reject") {
      await query(
        `update api_access_requests
         set status = 'rejected', review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
         where id = $1`,
        [id, parsed.data.notes, auth.email]
      );
      void notifyRejected(request, parsed.data.notes).catch((e) =>
        console.error("[admin/api-access] reject email failed:", e)
      );
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // ── Approve ────────────────────────────────────────────────────────────
    const requested = Array.isArray(request.requested_scopes) ? request.requested_scopes : [];
    const outOfScope = parsed.data.scopes.filter((s) => !requested.includes(s));
    if (outOfScope.length > 0) {
      return NextResponse.json(
        { error: `Scopes not requested by the agency: ${outOfScope.join(", ")}` },
        { status: 400 }
      );
    }

    const { key, hash, prefix } = generateApiKey();
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + parsed.data.period_months);

    await query("begin");
    try {
      await query(
        `insert into api_access_grants
           (request_id, api_key_hash, key_prefix, scopes, rate_limit_per_min, valid_until, granted_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, hash, prefix, parsed.data.scopes, parsed.data.rate_limit_per_min, validUntil, auth.email]
      );
      await query(
        `update api_access_requests
         set status = 'approved', review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
         where id = $1`,
        [id, parsed.data.notes ?? null, auth.email]
      );
      await query("commit");
    } catch (txErr) {
      await query("rollback");
      throw txErr;
    }

    void notifyApproved(request, parsed.data.scopes, validUntil).catch((e) =>
      console.error("[admin/api-access] approval email failed:", e)
    );

    return NextResponse.json({
      ok: true,
      status: "approved",
      key, // shown once in the UI; never stored, never emailed
      grant: { key_prefix: prefix, scopes: parsed.data.scopes, valid_until: validUntil },
    });
  } catch (e) {
    console.error("[admin/api-access] decision failed:", e);
    return NextResponse.json({ error: "Could not record the decision." }, { status: 500 });
  }
}

async function notifyApproved(
  request: RequestRow,
  scopes: string[],
  validUntil: Date
) {
  await sendSmtpEmail({
    to: request.technical_email,
    subject: `API access approved — ${request.reference_no}`,
    title: "API Access Approved",
    text: [
      `Your API access request ${request.reference_no} for ${request.institution_name} has been approved.`,
      ``,
      `Granted endpoint groups: ${scopes.join(", ")}`,
      `Valid until: ${validUntil.toISOString().slice(0, 10)}`,
      ``,
      `Your API key is being delivered to you separately by the Rwanda Water Resources Board — it is never sent by email.`,
      `API documentation: ${buildPortalLink("/api-access/docs")}`,
    ].join("\n"),
  });
}

async function notifyRejected(request: RequestRow, notes: string) {
  await sendSmtpEmail({
    to: request.technical_email,
    subject: `API access request ${request.reference_no} — decision`,
    title: "API Access Request Not Approved",
    text: [
      `Your API access request ${request.reference_no} for ${request.institution_name} was not approved.`,
      ``,
      `Reason: ${notes}`,
      ``,
      `If you believe this is in error, reply to this email or contact the Rwanda Water Resources Board.`,
    ].join("\n"),
  });
}
