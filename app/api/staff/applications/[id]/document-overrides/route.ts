import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import {
  getDocumentOverrideEnvelopeFromNotes,
  parseInternalNotes,
  sanitizeDocumentOverridePatch,
} from "@/lib/document-overrides";

export const runtime = "nodejs";

// Mirror the role surface that can access /assessment in middleware.ts
// (assessor + admin), plus the superuser email bypass used elsewhere in the
// codebase. Without `admin` here, admins navigating into an assessment page
// would hit a 403 when trying to save dynamic-value edits.
const ALLOWED_STAFF_ROLES = ["assessor", "admin"] as const;
const SUPERUSER_EMAILS = new Set([
  "nizzogentl1@gmail.com",
  "nshutidavy@gmail.com",
]);

function toSafeUserIdentity(claims: Awaited<ReturnType<typeof verifySessionToken>>): string {
  const sub = typeof claims?.sub === "string" ? claims.sub.trim() : "";
  const email = typeof claims?.email === "string" ? claims.email.trim() : "";
  return email || sub || "staff";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );
    }

    const actorEmail = String(claims?.email ?? "").trim().toLowerCase();
    const isSuperuser = SUPERUSER_EMAILS.has(actorEmail);
    const resolvedRoles = await resolveEffectiveRoles({
      userId,
      claimsRole: claims?.role,
    });
    if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing application id" },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    const clientVersion =
      typeof body?.version === "number" && Number.isFinite(body.version)
        ? Math.max(0, Math.trunc(body.version))
        : null;
    const patch = body?.patch as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json(
        { success: false, message: "Missing patch object" },
        { status: 400 },
      );
    }
    if (clientVersion === null) {
      return NextResponse.json(
        { success: false, message: "Missing version number" },
        { status: 400 },
      );
    }

    const sanitized = sanitizeDocumentOverridePatch(patch);
    if (sanitized.errors.length > 0) {
      return NextResponse.json(
        { success: false, message: sanitized.errors.join("; ") },
        { status: 400 },
      );
    }

    const appRes = await query<{ id: string; internal_notes: string | null }>(
      `
      SELECT id, internal_notes::text AS internal_notes
      FROM public.applications
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );
    const appRow = appRes.rows[0];
    if (!appRow) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }

    const existingNotes = parseInternalNotes(appRow.internal_notes);
    const existingEnvelope = getDocumentOverrideEnvelopeFromNotes(existingNotes);
    if (existingEnvelope.version !== clientVersion) {
      return NextResponse.json(
        {
          success: false,
          message: "Document overrides are out of date. Please refresh and retry.",
          currentVersion: existingEnvelope.version,
          values: existingEnvelope.values,
        },
        { status: 409 },
      );
    }

    const nextValues = {
      ...existingEnvelope.values,
      ...sanitized.values,
    };
    const nextEnvelope = {
      version: existingEnvelope.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: toSafeUserIdentity(claims),
      values: nextValues,
    };

    const updateRes = await query<{ id: string }>(
      `
      UPDATE public.applications
      SET
        internal_notes = jsonb_set(
          COALESCE(internal_notes, '{}'::jsonb),
          '{document_overrides}',
          $2::jsonb,
          true
        ),
        updated_at = now()
      WHERE id = $1
        AND COALESCE((internal_notes->'document_overrides'->>'version')::int, 0) = $3
      RETURNING id
      `,
      [id, JSON.stringify(nextEnvelope), clientVersion],
    );
    if (!updateRes.rows.length) {
      const latestRes = await query<{ internal_notes: string | null }>(
        `
        SELECT internal_notes::text AS internal_notes
        FROM public.applications
        WHERE id = $1
        LIMIT 1
        `,
        [id],
      );
      const latest = latestRes.rows[0]
        ? getDocumentOverrideEnvelopeFromNotes(latestRes.rows[0].internal_notes)
        : { version: existingEnvelope.version, values: existingEnvelope.values };
      return NextResponse.json(
        {
          success: false,
          message: "Document overrides are out of date. Please refresh and retry.",
          currentVersion: latest.version,
          values: latest.values,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      document_overrides: nextEnvelope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = NextResponse.json(
        { success: false, message: "Invalid session" },
        { status: 401 },
      );
      clearSessionCookie(res);
      return res;
    }
    console.error("document-overrides error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save document overrides" },
      { status: 500 },
    );
  }
}
