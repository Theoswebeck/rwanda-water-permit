import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { parseInternalNotes } from "@/lib/document-overrides";

export const runtime = "nodejs";

// Mirror the role surface that can access /assessment in middleware.ts
// (assessor + admin), plus the superuser email bypass used elsewhere in the
// codebase. Without `admin` here, admins navigating into an assessment page
// would hit a 403 when trying to save the recommended duration / volume.
const ALLOWED_STAFF_ROLES = ["assessor", "admin"] as const;
const SUPERUSER_EMAILS = new Set([
  "nizzogentl1@gmail.com",
  "nshutidavy@gmail.com",
]);

type AssessorAdjustmentsPatch = {
  permitLengthYears?: number;
  recommendedVolumeM3?: number;
};

type RequestedValuesPayload = {
  permitLengthYears?: number;
  volumeM3?: number;
};

/**
 * POST `/api/staff/applications/{id}/assessor-adjustments`
 *
 * Race-safe write of the assessor's recommended permit length / output volume.
 *
 * Why this exists:
 *   The previous client-side flow read `applications.internal_notes`, mutated it
 *   in JavaScript, then wrote the *whole* JSON column back via the Supabase client.
 *   That full-replace would silently clobber any concurrent partial write — most
 *   importantly the `document_overrides` envelope produced by the document-values
 *   editor, which auto-saves on a debounce. With the new auto-refreshing preview
 *   this race became materially more reachable, so we moved the write server-side.
 *
 * Guarantees:
 *   - Writes only the `_assessorAdjustments` and (on first save) `_originalRequestedValues`
 *     paths via `jsonb_set`. Every other key in `internal_notes` — including
 *     `document_overrides` — is preserved exactly as the database currently stores it.
 *   - Updates the dedicated `proposed_duration_years` column atomically in the same
 *     statement as the JSON path write, so PDF rendering and the JSON ledger never
 *     drift apart.
 *   - Does not implement optimistic concurrency on `_assessorAdjustments` itself —
 *     overlapping writes from a single assessor session are rare and last-write-wins
 *     is acceptable for these scalar fields. The hard rule we are protecting is
 *     "do not clobber sibling JSON paths", which `jsonb_set` enforces structurally.
 */
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Missing patch body" },
        { status: 400 },
      );
    }

    const patch: AssessorAdjustmentsPatch = {};

    if (body.permitLengthYears !== undefined) {
      const n = Number(body.permitLengthYears);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        return NextResponse.json(
          { success: false, message: "permitLengthYears must be a positive integer (1-100)" },
          { status: 400 },
        );
      }
      patch.permitLengthYears = Math.trunc(n);
    }

    if (body.recommendedVolumeM3 !== undefined) {
      const n = Number(body.recommendedVolumeM3);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { success: false, message: "recommendedVolumeM3 must be a positive number" },
          { status: 400 },
        );
      }
      patch.recommendedVolumeM3 = n;
    }

    if (patch.permitLengthYears === undefined && patch.recommendedVolumeM3 === undefined) {
      return NextResponse.json(
        { success: false, message: "At least one of permitLengthYears or recommendedVolumeM3 is required" },
        { status: 400 },
      );
    }

    const requestedPayload = (body.requestedValues ?? null) as RequestedValuesPayload | null;

    // Race-safe write strategy:
    //   applications.internal_notes is a TEXT column that holds a JSON
    //   document. The previous SQL-only jsonb_set design was brittle on rows
    //   with malformed or scalar JSON, so we instead lock the row, parse +
    //   mutate in JS (which `parseInternalNotes` does tolerantly), then write
    //   the whole column back. The row lock preserves the original intent —
    //   no concurrent writer can clobber sibling JSON paths (most importantly
    //   the `document_overrides` envelope) between our read and write.
    const result = await withTransaction(async (client) => {
      const lockRes = await client.query<{
        is_renewal: boolean | null;
        internal_notes: string | null;
      }>(
        `
        SELECT COALESCE(is_renewal, false) AS is_renewal, internal_notes
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
      if (lockRow.is_renewal) {
        return { kind: "renewal_locked" as const };
      }

      const existingNotes = parseInternalNotes(lockRow.internal_notes);
      const existingAdjustments = isPlainObject(existingNotes._assessorAdjustments)
        ? (existingNotes._assessorAdjustments as Record<string, unknown>)
        : {};
      const existingOriginal = existingNotes._originalRequestedValues ?? null;

      const nowIso = new Date().toISOString();
      const nextAdjustments: Record<string, unknown> = { ...existingAdjustments };
      if (patch.permitLengthYears !== undefined) {
        nextAdjustments.permitLengthYears = patch.permitLengthYears;
        nextAdjustments.adjustedAt = nowIso;
      }
      if (patch.recommendedVolumeM3 !== undefined) {
        nextAdjustments.recommendedVolumeM3 = patch.recommendedVolumeM3;
        nextAdjustments.volumeAdjustedAt = nowIso;
      }

      // Backfill `_originalRequestedValues` only when the database hasn't
      // already recorded them. The client sends its current view of the
      // requested values so we have something to seed from on the very first
      // assessor adjustment.
      let nextOriginal: unknown = existingOriginal;
      if (existingOriginal == null && requestedPayload && typeof requestedPayload === "object") {
        const seed: Record<string, unknown> = { storedAt: nowIso };
        const seedLength = Number(requestedPayload.permitLengthYears);
        if (Number.isFinite(seedLength) && seedLength > 0) {
          seed.permitLengthYears = Math.trunc(seedLength);
        }
        const seedVolume = Number(requestedPayload.volumeM3);
        if (Number.isFinite(seedVolume) && seedVolume > 0) {
          seed.volumeM3 = seedVolume;
        }
        // Only persist a seed if at least one numeric requested value was
        // supplied — an empty `{ storedAt: ... }` would falsely advertise
        // "we have the original values" and prevent future backfills.
        if (seed.permitLengthYears !== undefined || seed.volumeM3 !== undefined) {
          nextOriginal = seed;
        }
      }

      const nextNotes: Record<string, unknown> = { ...existingNotes };
      nextNotes._assessorAdjustments = nextAdjustments;
      if (nextOriginal != null) nextNotes._originalRequestedValues = nextOriginal;

      const nextNotesJson = JSON.stringify(nextNotes);

      // Update internal_notes always; conditionally also write the dedicated
      // `proposed_duration_years` column so PDF rendering and the JSON ledger
      // never drift apart.
      let updateRes;
      if (patch.permitLengthYears !== undefined) {
        updateRes = await client.query<{ proposed_duration_years: number | null }>(
          `
          UPDATE public.applications
          SET internal_notes = $2,
              proposed_duration_years = $3,
              updated_at = now()
          WHERE id = $1
          RETURNING proposed_duration_years
          `,
          [id, nextNotesJson, patch.permitLengthYears],
        );
      } else {
        updateRes = await client.query<{ proposed_duration_years: number | null }>(
          `
          UPDATE public.applications
          SET internal_notes = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING proposed_duration_years
          `,
          [id, nextNotesJson],
        );
      }
      const updatedRow = updateRes.rows[0];

      return {
        kind: "ok" as const,
        assessor_adjustments: nextAdjustments,
        original_requested_values: nextOriginal,
        proposed_duration_years: updatedRow?.proposed_duration_years ?? null,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }
    if (result.kind === "renewal_locked") {
      return NextResponse.json(
        { success: false, message: "Renewal applications inherit assessor recommendations and cannot be edited." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      assessor_adjustments: result.assessor_adjustments,
      original_requested_values: result.original_requested_values,
      proposed_duration_years: result.proposed_duration_years,
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
    console.error("assessor-adjustments error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save assessor adjustment" },
      { status: 500 },
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
