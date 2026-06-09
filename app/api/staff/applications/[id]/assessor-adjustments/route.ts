import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withTransaction } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { parseInternalNotesStrict } from "@/lib/document-overrides";
import type { BulkNetworkRow } from "@/types/database";

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
  recommendedPumpingRateM3Day?: number;
  waterSourceLatitude?: number;
  waterSourceLongitude?: number;
  waterSourcePolygonPoints?: Array<{ latitude: number; longitude: number }>;
  bulkNetworks?: BulkNetworkRow[];
};

type CoordinatePointPatch = {
  latitude?: number | string;
  longitude?: number | string;
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
 *   editor. With the new auto-refreshing preview this race became materially more
 *   reachable, so we moved the write server-side.
 *
 * Guarantees:
 *   - The read + mutate + write happens inside a single transaction with
 *     `SELECT ... FOR UPDATE`, so the row lock prevents any concurrent writer
 *     from clobbering sibling JSON paths (most importantly `document_overrides`)
 *     between our read and our write.
 *   - Only `_assessorAdjustments` and (on first save) `_originalRequestedValues`
 *     are mutated; every other key in `internal_notes` is round-tripped
 *     unchanged via parseInternalNotesStrict + JSON.stringify.
 *   - Updates the dedicated `proposed_duration_years` column atomically in the
 *     same UPDATE statement as the JSON write, so PDF rendering and the JSON
 *     ledger never drift apart.
 *   - Does not implement optimistic concurrency on `_assessorAdjustments` itself —
 *     overlapping writes from a single assessor session are rare and last-write-wins
 *     is acceptable for these scalar fields. The hard rule we are protecting is
 *     "do not clobber sibling JSON paths", which the row lock enforces.
 *   - `lock_timeout` and `statement_timeout` are set per-transaction so a stuck
 *     row can't wedge the connection pool.
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

    if (body.recommendedPumpingRateM3Day !== undefined) {
      const n = Number(body.recommendedPumpingRateM3Day);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { success: false, message: "recommendedPumpingRateM3Day must be a positive number" },
          { status: 400 },
        );
      }
      patch.recommendedPumpingRateM3Day = n;
    }

    const hasLat = body.waterSourceLatitude !== undefined;
    const hasLng = body.waterSourceLongitude !== undefined;
    if (hasLat || hasLng) {
      if (!hasLat || !hasLng) {
        return NextResponse.json(
          { success: false, message: "waterSourceLatitude and waterSourceLongitude must be saved together" },
          { status: 400 },
        );
      }
      const pair = parseLatLngPair(body.waterSourceLatitude, body.waterSourceLongitude);
      if ("error" in pair) {
        return NextResponse.json({ success: false, message: pair.error }, { status: 400 });
      }
      patch.waterSourceLatitude = pair.lat;
      patch.waterSourceLongitude = pair.lng;
    }

    if (body.waterSourcePolygonPoints !== undefined) {
      if (!Array.isArray(body.waterSourcePolygonPoints) || body.waterSourcePolygonPoints.length === 0) {
        return NextResponse.json(
          { success: false, message: "waterSourcePolygonPoints must contain at least one point" },
          { status: 400 },
        );
      }

      const points: Array<{ latitude: number; longitude: number }> = [];
      for (const rawPoint of body.waterSourcePolygonPoints as CoordinatePointPatch[]) {
        if (!rawPoint || typeof rawPoint !== "object") {
          return NextResponse.json(
            { success: false, message: "Each polygon point must be an object" },
            { status: 400 },
          );
        }
        const pair = parseLatLngPair(rawPoint.latitude, rawPoint.longitude);
        if ("error" in pair) {
          return NextResponse.json({ success: false, message: pair.error }, { status: 400 });
        }
        points.push({ latitude: pair.lat, longitude: pair.lng });
      }
      patch.waterSourcePolygonPoints = points;
    }

    if (body.bulkNetworks !== undefined) {
      if (!Array.isArray(body.bulkNetworks)) {
        return NextResponse.json(
          { success: false, message: "bulkNetworks must be an array" },
          { status: 400 },
        );
      }
      if (body.bulkNetworks.length > 500) {
        return NextResponse.json(
          { success: false, message: "bulkNetworks may not exceed 500 items" },
          { status: 400 },
        );
      }
      const truncStr = (v: unknown, max = 255): string =>
        typeof v === "string" ? v.slice(0, max) : "";
      let validatedNetworks: BulkNetworkRow[];
      try {
        validatedNetworks = (body.bulkNetworks as unknown[]).map((item: unknown, idx: number) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error(`bulkNetworks[${idx}] must be an object`);
          }
          const raw = item as Record<string, unknown>;
          const cap = raw.capacity_m3_day;
          const capNum = cap != null ? Number(cap) : undefined;
          if (cap != null && (typeof capNum !== "number" || !Number.isFinite(capNum) || capNum < 0)) {
            throw new Error(`bulkNetworks[${idx}].capacity_m3_day must be a non-negative number`);
          }
          return {
            number: raw.number != null ? Number(raw.number) : idx + 1,
            network_name: truncStr(raw.network_name),
            sector: truncStr(raw.sector),
            cell: truncStr(raw.cell),
            village: truncStr(raw.village),
            coordinates: truncStr(raw.coordinates),
            capacity_m3_day: cap != null ? capNum : undefined,
            abstraction_method: truncStr(raw.abstraction_method),
          };
        });
      } catch (valErr) {
        return NextResponse.json(
          { success: false, message: valErr instanceof Error ? valErr.message : "Invalid bulkNetworks item" },
          { status: 400 },
        );
      }
      patch.bulkNetworks = validatedNetworks;
    }

    if (
      patch.permitLengthYears === undefined &&
      patch.recommendedVolumeM3 === undefined &&
      patch.recommendedPumpingRateM3Day === undefined &&
      patch.waterSourceLatitude === undefined &&
      patch.waterSourceLongitude === undefined &&
      patch.waterSourcePolygonPoints === undefined &&
      patch.bulkNetworks === undefined
    ) {
      return NextResponse.json(
        { success: false, message: "At least one assessor adjustment field is required" },
        { status: 400 },
      );
    }

    const requestedPayload = (body.requestedValues ?? null) as RequestedValuesPayload | null;

    const result = await withTransaction(async (client) => {
      // Bound how long we wait for the row lock and how long the transaction
      // can hold a connection. Without these, a hung writer on the same row
      // could exhaust the pg.Pool (max=10) for every assessor.
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      await client.query(`SET LOCAL statement_timeout = '15s'`);

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

      const parsed = parseInternalNotesStrict(lockRow.internal_notes);
      if (!parsed.ok) {
        // Refusing to write is the right call here: the row already contains
        // *something* (legacy plain-text staff note, scalar, malformed JSON).
        // Spreading `{}` and stringifying back would silently destroy it.
        return {
          kind: "corrupt_notes" as const,
          reason: parsed.reason,
          preview: parsed.rawPreview,
        };
      }
      const existingNotes = parsed.value;
      const existingAdjustments = isPlainObject(existingNotes._assessorAdjustments)
        ? (existingNotes._assessorAdjustments as Record<string, unknown>)
        : {};
      const existingOriginal = existingNotes._originalRequestedValues;

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
      if (patch.recommendedPumpingRateM3Day !== undefined) {
        nextAdjustments.recommendedPumpingRateM3Day = patch.recommendedPumpingRateM3Day;
        nextAdjustments.pumpingRateAdjustedAt = nowIso;
      }
      if (patch.waterSourceLatitude !== undefined && patch.waterSourceLongitude !== undefined) {
        nextAdjustments.waterSourceLatitude = patch.waterSourceLatitude;
        nextAdjustments.waterSourceLongitude = patch.waterSourceLongitude;
        nextAdjustments.coordinatesAdjustedAt = nowIso;
      }
      if (patch.waterSourcePolygonPoints !== undefined) {
        nextAdjustments.waterSourcePolygonPoints = patch.waterSourcePolygonPoints;
        nextAdjustments.coordinatesAdjustedAt = nowIso;
      }
      if (patch.bulkNetworks !== undefined) {
        nextAdjustments.bulkNetworks = patch.bulkNetworks;
        nextAdjustments.bulkNetworksAdjustedAt = nowIso;
      }

      // Backfill `_originalRequestedValues` only when the database hasn't
      // already recorded them. The client sends its current view of the
      // requested values so we have something to seed from on the very first
      // assessor adjustment.
      // `== null` is intentional: parseInternalNotesStrict returns `undefined`
      // for missing keys, but legacy rows may have stored an explicit JSON
      // null — both cases should trigger a backfill, neither should skip it.
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
      // (We let TS infer the QueryResult type — importing the explicit
      //  generic from `pg` triggers a `@types/pg` resolution issue in this
      //  project's tsconfig.)
      let updateRes: { rows: { proposed_duration_years: number | null }[] };
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
    if (result.kind === "corrupt_notes") {
      console.error("assessor-adjustments refusing to write over non-object internal_notes", {
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
    if (message.includes("lock timeout") || message.includes("canceling statement due to lock timeout")) {
      return NextResponse.json(
        { success: false, message: "The application is currently being edited. Please retry in a few seconds." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    const correlationId = randomUUID();
    console.error("assessor-adjustments error", { correlationId, err });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save assessor adjustment",
        correlationId,
        detail: message,
      },
      { status: 500 },
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoordinateNumber(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.trim())
        : NaN;
  return Number.isFinite(n) ? n : null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(8));
}

function parseLatLngPair(
  rawLat: unknown,
  rawLng: unknown,
): { lat: number; lng: number } | { error: string } {
  const lat = parseCoordinateNumber(rawLat);
  const lng = parseCoordinateNumber(rawLng);
  if (lat == null || lng == null) {
    return { error: "Latitude and longitude must both be valid numbers" };
  }
  if (lat < -90 || lat > 90) {
    return { error: "Latitude must be between -90 and 90" };
  }
  if (lng < -180 || lng > 180) {
    return { error: "Longitude must be between -180 and 180" };
  }
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
}
