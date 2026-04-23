import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db/postgres";
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

    // Race-safe write strategy:
    //   We previously did the read + mutate + write entirely in SQL via
    //   jsonb_set, which broke because applications.internal_notes is a TEXT
    //   column (not jsonb) and the casts were brittle on rows with malformed
    //   JSON. Instead, we now do the work inside a single transaction:
    //     1. SELECT ... FOR UPDATE to take a row lock.
    //     2. Parse the JSON in JS (parseInternalNotes is tolerant of bad data).
    //     3. Compare-and-swap on the override envelope's `version` field.
    //     4. Mutate only the `document_overrides` key, preserving every other
    //        sibling (including `_assessorAdjustments`, `transferFormData`, …).
    //     5. UPDATE the row with the stringified result.
    //   The row lock guarantees no concurrent writer can slip a partial update
    //   in between (3) and (5), which preserves the atomicity that the prior
    //   jsonb_set design was trying to enforce structurally.
    const result = await withTransaction(async (client) => {
      const lockRes = await client.query<{ internal_notes: string | null }>(
        `
        SELECT internal_notes
        FROM public.applications
        WHERE id = $1
        FOR UPDATE
        `,
        [id],
      );
      const lockRow = lockRes.rows[0];
      if (!lockRow) {
        return { kind: "not_found" as const };
      }

      const existingNotes = parseInternalNotes(lockRow.internal_notes);
      const existingEnvelope = getDocumentOverrideEnvelopeFromNotes(existingNotes);
      if (existingEnvelope.version !== clientVersion) {
        return {
          kind: "conflict" as const,
          currentVersion: existingEnvelope.version,
          values: existingEnvelope.values,
        };
      }

      const nextEnvelope = {
        version: existingEnvelope.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: toSafeUserIdentity(claims),
        values: {
          ...existingEnvelope.values,
          ...sanitized.values,
        },
      };

      const nextNotes = { ...existingNotes, document_overrides: nextEnvelope };
      const nextNotesJson = JSON.stringify(nextNotes);

      await client.query(
        `
        UPDATE public.applications
        SET internal_notes = $2,
            updated_at = now()
        WHERE id = $1
        `,
        [id, nextNotesJson],
      );

      return { kind: "ok" as const, envelope: nextEnvelope };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          success: false,
          message: "Document overrides are out of date. Please refresh and retry.",
          currentVersion: result.currentVersion,
          values: result.values,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      document_overrides: result.envelope,
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
