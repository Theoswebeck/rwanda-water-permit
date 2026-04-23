import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withTransaction } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import {
  getDocumentOverrideEnvelopeFromNotes,
  parseInternalNotesStrict,
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
    //     1. SET LOCAL lock_timeout / statement_timeout so a stuck row can't
    //        wedge the connection pool.
    //     2. SELECT ... FOR UPDATE to take a row lock.
    //     3. Parse the JSON in JS via parseInternalNotesStrict so a row whose
    //        internal_notes contains *non-empty unparseable text* surfaces as
    //        a 409 instead of being silently overwritten with `{}`.
    //     4. Compare-and-swap on the override envelope's `version` field.
    //     5. Mutate only the `document_overrides` key, preserving every other
    //        sibling (including `_assessorAdjustments`, `transferFormData`, …).
    //     6. UPDATE the row with the stringified result.
    //   The row lock guarantees no concurrent writer can slip a partial update
    //   in between (4) and (6), which preserves the atomicity that the prior
    //   jsonb_set design was trying to enforce structurally.
    const result = await withTransaction(async (client) => {
      // Bound how long we wait for the row lock and how long the transaction
      // can hold a connection. Without these, a hung writer on the same row
      // could exhaust the pg.Pool (max=10) for every assessor.
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      await client.query(`SET LOCAL statement_timeout = '15s'`);

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

      const parsed = parseInternalNotesStrict(lockRow.internal_notes);
      if (!parsed.ok) {
        // Refusing to write is the right call here: the row already contains
        // *something* (legacy plain-text staff note, scalar, malformed JSON).
        // Spreading `{}` and stringifying back would silently destroy it.
        // Surface a 409 with a diagnostic preview so ops can repair the row
        // by hand instead of a 500 that hides the problem.
        return {
          kind: "corrupt_notes" as const,
          reason: parsed.reason,
          preview: parsed.rawPreview,
        };
      }
      const existingNotes = parsed.value;
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
    if (result.kind === "corrupt_notes") {
      console.error("document-overrides refusing to write over non-object internal_notes", {
        applicationId: id,
        reason: result.reason,
        preview: result.preview,
      });
      return NextResponse.json(
        {
          success: false,
          message:
            "Saved notes for this application are in an unexpected format and need to be repaired by an administrator before further edits can be saved.",
          reason: result.reason,
          preview: result.preview,
        },
        { status: 409 },
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
    // Lock-timeout surfaces as a recognizable error string from pg. Translate
    // it to a 503 with retry-after so the editor can prompt the assessor to
    // try again instead of returning a generic 500.
    if (message.includes("lock timeout") || message.includes("canceling statement due to lock timeout")) {
      return NextResponse.json(
        { success: false, message: "The application is currently being edited. Please retry in a few seconds." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    // Tag every 500 with a correlationId and (since this is a staff-only
    // endpoint with no PII risk) include the underlying error message so the
    // assessor can quote it to ops without us needing log access.
    const correlationId = randomUUID();
    console.error("document-overrides error", { correlationId, err });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save document overrides",
        correlationId,
        detail: message,
      },
      { status: 500 },
    );
  }
}
