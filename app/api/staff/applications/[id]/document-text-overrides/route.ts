/**
 * Free-text slot overrides API for the assessor document editor.
 *
 * GET  → returns the current envelope plus the resolved slot list (default
 *        text, override text, edited-by/at) for both Permit and Contract
 *        documents. The editor UI consumes this to prefill its rows.
 *
 * POST → applies a batch of patches inside a single transaction with the
 *        same row-lock + JS-mutation pattern hardened in
 *        `app/api/staff/applications/[id]/document-overrides/route.ts`.
 *        Optimistic-lock via `ifVersion`. Atomic per request: either every
 *        patch lands or none do.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §5
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { query, withTransaction } from "@/lib/db/postgres";
import {
  applyPatches,
  findSlot,
  getDocumentTextOverridesEnvelope,
  getSlotsForDocument,
  HARD_MAX_SLOT_LENGTH,
  isDateBearingSlot,
  readEnvelopeForWrite,
  resolveSlotsForEditor,
  type DocumentTextPatch,
  type DocumentTextOverridesEnvelope,
  type ResolvedSlotForEditor,
  type SlotEditor,
  writeEnvelopeIntoNotes,
} from "@/lib/document-slots";
import {
  buildContractSlotContext,
  buildPermitSlotContext,
} from "@/lib/document-slots/build-context";
import { repairBoldMarkers } from "@/lib/document-slots/bold-markers";
import type { PermitApplication } from "@/lib/permit/permit-text-data";
import { selectPermitVariant } from "@/lib/permit-variant";
import { resolvePermitRenderDatesFromNotes } from "@/lib/permit/resolve-render-dates-from-notes";

export const runtime = "nodejs";

// Write access stays gated to the people who own the document content
// (assessors + admins). Read access is opened up to approvers as well so the
// approver review pane can show changed slots before issuance (Phase 4 spec
// §6 "approver_must_review_changed_slots").
const WRITE_ROLES = ["assessor", "admin"] as const;
const READ_ROLES = ["assessor", "admin", "approver"] as const;
// Free-text edits are only permitted while the application is still in an
// assessment stage. Mirrors the `isEditableAssessment` check in
// `app/assessment/application/[id]/page.tsx` so the API can't be coerced
// into mutating overrides after the file has moved past assessment.
const ASSESSMENT_WRITABLE_STATUSES: ReadonlySet<string> = new Set([
  "pending_assessment",
  "under_review",
  "returned_to_assessment",
]);
const SUPERUSER_EMAILS = new Set([
  "nizzogentl1@gmail.com",
  "nshutidavy@gmail.com",
]);

const APPLICATION_QUERY = `
  SELECT
    a.id,
    a.application_number,
    a.project_title,
    a.status,
    a.application_type,
    a.water_source,
    a.water_purpose,
    a.water_body_name,
    a.estimated_usage_volume,
    a.usage_unit,
    a.intended_activities,
    a.province,
    a.district,
    a.sector,
    a.cell,
    a.village,
    a.concession_area,
    a.proposed_duration_years,
    a.assessor_recommended_volume_m3,
    a.max_daily_volume_m3,
    a.max_yearly_volume_m3,
    a.internal_notes::text AS internal_notes,
    a.water_taking_method,
    ST_AsGeoJSON(a.coordinates)::json AS coordinates,
    a.is_modification,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.account_type,
    u.id_number,
    u.company_name,
    u.company_tin,
    u.company_address,
    u.company_phone
  FROM public.applications a
  JOIN public.users u ON u.id = a.applicant_id
  WHERE a.id = $1
  LIMIT 1
`;

function rowToPermitApplication(row: Record<string, unknown>): PermitApplication {
  const application: PermitApplication = {
    id: String(row.id ?? ""),
    application_number: String(row.application_number ?? ""),
    project_title: String(row.project_title ?? ""),
    status: String(row.status ?? ""),
    application_type: String(row.application_type ?? ""),
    water_source: String(row.water_source ?? ""),
    water_purpose: String(row.water_purpose ?? ""),
    estimated_usage_volume: Number(row.estimated_usage_volume) || 0,
    usage_unit: String(row.usage_unit ?? ""),
    intended_activities: row.intended_activities ?? undefined,
    province: String(row.province ?? ""),
    district: String(row.district ?? ""),
    sector: String(row.sector ?? ""),
    cell: String(row.cell ?? ""),
    village: row.village != null ? String(row.village) : undefined,
    concession_area:
      row.concession_area != null ? Number(row.concession_area) : undefined,
    proposed_duration_years:
      row.proposed_duration_years != null
        ? Number(row.proposed_duration_years)
        : undefined,
    assessor_recommended_volume_m3:
      row.assessor_recommended_volume_m3 != null
        ? Number(row.assessor_recommended_volume_m3)
        : undefined,
    max_daily_volume_m3:
      row.max_daily_volume_m3 != null ? Number(row.max_daily_volume_m3) : undefined,
    max_yearly_volume_m3:
      row.max_yearly_volume_m3 != null ? Number(row.max_yearly_volume_m3) : undefined,
    internal_notes:
      row.internal_notes != null ? (row.internal_notes as string) : undefined,
    water_taking_method:
      row.water_taking_method != null ? String(row.water_taking_method) : undefined,
    // GeoJSON geometry — feeds resolveLatLng's Point fallback so editor
    // previews show the same coordinates as the contract and assessment report.
    coordinates: row.coordinates ?? undefined,
    applicant: {
      first_name: row.first_name != null ? String(row.first_name) : undefined,
      last_name: row.last_name != null ? String(row.last_name) : undefined,
      company_name: row.company_name != null ? String(row.company_name) : undefined,
      email: String(row.email ?? ""),
      phone: row.phone != null ? String(row.phone) : undefined,
      account_type: String(row.account_type ?? "individual"),
      id_number: row.id_number != null ? String(row.id_number) : undefined,
      company_tin: row.company_tin != null ? String(row.company_tin) : undefined,
      company_address:
        row.company_address != null ? String(row.company_address) : undefined,
    },
  };
  (application.applicant as Record<string, unknown>).company_phone =
    row.company_phone != null ? String(row.company_phone) : undefined;
  (application as unknown as Record<string, unknown>).water_body_name =
    row.water_body_name != null ? String(row.water_body_name) : undefined;
  // Carry `is_modification` so the editor payload can preserve the original
  // validity window when the application is amending an existing permit.
  (application as unknown as Record<string, unknown>).is_modification =
    row.is_modification === true;
  return application;
}

type EditorPayload = {
  envelope: DocumentTextOverridesEnvelope;
  variant: ReturnType<typeof selectPermitVariant>;
  permitSlots: ResolvedSlotForEditor[];
  contractSlots: ResolvedSlotForEditor[];
};

function parseNotes(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
}

function buildEditorPayload(application: PermitApplication): EditorPayload {
  const variant = selectPermitVariant(
    application as Parameters<typeof selectPermitVariant>[0],
  );

  // Resolve the four render fields (permit number + validity + signing) so
  // the editor's snapshot matches what the PDF renderer will emit — no more
  // XXXX / today / today+duration defaults for modification/renewal/transfer.
  // See docs/superpowers/specs/2026-07-07-modification-permit-identity-and-signing-date-design.md.
  const notes = parseNotes(application.internal_notes);
  const isModification =
    (application as { is_modification?: unknown }).is_modification === true ||
    notes?.isModification === true;
  const isRenewal =
    application.application_type === "renewal" || notes?.isRenewal === true;
  const isTransfer =
    application.application_type === "transfer" || notes?.isTransfer === true;
  const rendered = resolvePermitRenderDatesFromNotes({
    notes,
    // Editor is only accessible in assessment statuses (approved_at is null
    // by definition), so signingDate always resolves to today for the editor
    // snapshot — same as the preview PDF before approval.
    approvedAt: null,
    isModification,
    isRenewal,
    isTransfer,
  });

  const permitCtx = buildPermitSlotContext({
    application,
    permitNumber: rendered.permitNumber,
    ...(rendered.issueDate  && { issueDate: rendered.issueDate }),
    ...(rendered.expiryDate && { expiryDate: rendered.expiryDate }),
    signingDate: rendered.signingDate,
    isModified: isModification,
  });
  const contractCtx = buildContractSlotContext(application);
  return {
    // Same best-effort reader the resolver chain uses, so a corrupt
    // internal_notes column degrades to "no overrides" instead of 500ing the
    // editor (the POST handler still refuses to overwrite it).
    envelope: getDocumentTextOverridesEnvelope(application.internal_notes),
    variant,
    permitSlots: resolveSlotsForEditor(
      "permit",
      variant,
      permitCtx,
      getSlotsForDocument("permit", variant),
    ),
    contractSlots: resolveSlotsForEditor(
      "contract",
      variant,
      contractCtx,
      getSlotsForDocument("contract", variant),
    ),
  };
}

function toEditor(
  claims: Awaited<ReturnType<typeof verifySessionToken>>,
  effectiveRoles: readonly string[],
): SlotEditor {
  const sub = typeof claims?.sub === "string" ? claims.sub.trim() : "";
  const email = typeof claims?.email === "string" ? claims.email.trim() : "";
  const name = typeof claims?.name === "string" ? claims.name.trim() : email || sub;
  const role = effectiveRoles[0] ?? "staff";
  return {
    id: sub || email || "staff",
    name: name || email || sub || "Staff",
    email: email || "unknown@rwb.rw",
    role,
  };
}

async function authenticate(
  req: NextRequest,
  allowedRoles: readonly string[],
) {
  const token = readSessionTokenFromRequest(req);
  const claims = token ? await verifySessionToken(token) : null;
  const userId = claims?.sub;
  if (!userId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      ),
    };
  }
  const actorEmail = String(claims?.email ?? "").trim().toLowerCase();
  const isSuperuser = SUPERUSER_EMAILS.has(actorEmail);
  const resolvedRoles = await resolveEffectiveRoles({
    userId,
    claimsRole: claims?.role,
  });
  if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, allowedRoles)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, claims, effectiveRoles: resolvedRoles.effectiveRoles };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticate(req, READ_ROLES);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!id || typeof id !== "string" || id.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid application id" },
        { status: 400 },
      );
    }

    const result = await query<Record<string, unknown>>(APPLICATION_QUERY, [id]);
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }
    const application = rowToPermitApplication(result.rows[0]);
    const payload = buildEditorPayload(application);

    // Strip the resolver function reference from each slot before
    // serialising — Next will throw "function cannot be serialised" otherwise.
    const stripFn = (rs: ResolvedSlotForEditor) => ({
      slot: {
        id: rs.slot.id,
        documentKind: rs.slot.documentKind,
        variant: rs.slot.variant,
        language: rs.slot.language,
        group: rs.slot.group,
        label: rs.slot.label,
        structuredField: rs.slot.structuredField,
        softMaxLength: rs.slot.softMaxLength,
        inline: rs.slot.inline ?? false,
      },
      defaultText: rs.defaultText,
      overrideText: rs.overrideText,
      editedAt: rs.editedAt,
      editedBy: rs.editedBy,
    });

    return NextResponse.json({
      success: true,
      envelope: payload.envelope,
      variant: payload.variant,
      hardMaxLength: HARD_MAX_SLOT_LENGTH,
      permitSlots: payload.permitSlots.map(stripFn),
      contractSlots: payload.contractSlots.map(stripFn),
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
    const correlationId = randomUUID();
    console.error("document-text-overrides GET error", { correlationId, err });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load document text editor",
        correlationId,
        detail: message,
      },
      { status: 500 },
    );
  }
}

type PostBody = {
  ifVersion?: unknown;
  patches?: unknown;
};

type BoldMarkerRepairNote = { slotId: string; kind: string };

function sanitizePatches(
  raw: unknown,
):
  | { ok: true; patches: DocumentTextPatch[]; repairedSlots: BoldMarkerRepairNote[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "patches must be a non-empty array" };
  }
  if (raw.length > 200) {
    return { ok: false, message: "Too many patches in one request" };
  }
  const out: DocumentTextPatch[] = [];
  const repairedSlots: BoldMarkerRepairNote[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, message: "Each patch must be an object" };
    }
    const o = item as Record<string, unknown>;
    if (typeof o.slotId !== "string" || !o.slotId) {
      return { ok: false, message: "Each patch must have a slotId" };
    }
    if (seen.has(o.slotId)) {
      return { ok: false, message: `Duplicate slotId in batch: ${o.slotId}` };
    }
    seen.add(o.slotId);
    const slot = findSlot(o.slotId);
    if (!slot) {
      return { ok: false, message: `Unknown slotId: ${o.slotId}` };
    }
    // Date-bearing slots (closing date line, validity-period paragraphs)
    // are system-managed: their text is rebuilt from the live issuance /
    // expiry date on every render. Allowing the assessor to save an
    // override would freeze a stale date that drifts from the legal
    // issuance date once the relevant party signs the terms — exactly the
    // bug this guard prevents. Resets (`text: null`) ARE allowed so the
    // editor can scrub legacy entries that predate this rule.
    if (isDateBearingSlot(slot) && o.text !== null) {
      return {
        ok: false,
        message: `Patch ${o.slotId}: this slot is system-managed (its text is built from the permit's issuance/expiry date) and cannot be edited manually.`,
      };
    }
    if (o.text === null) {
      out.push({ slotId: o.slotId, text: null });
      continue;
    }
    if (typeof o.text !== "string") {
      return { ok: false, message: `Patch ${o.slotId}: text must be a string or null` };
    }
    if (o.text === "") {
      return {
        ok: false,
        message: `Patch ${o.slotId}: empty text is not allowed (use null to reset)`,
      };
    }
    if (o.text.length > HARD_MAX_SLOT_LENGTH) {
      return {
        ok: false,
        message: `Patch ${o.slotId}: text exceeds ${HARD_MAX_SLOT_LENGTH}-char hard limit`,
      };
    }
    // Bold markers (RWB feedback 2026-08): assessors are never instructed
    // about `**…**` emphasis — the markers arrive baked into the slot
    // DEFAULTS — so we neither reject unbalanced markers (that would ask them
    // to reason about a syntax they were never taught) nor let them through
    // (an unmatched marker renders as a literal `**` inside the SIGNED,
    // ISSUED permit PDF, because `parseBoldRuns` folds it back as literal
    // text). Instead we AUTO-REPAIR and store the repaired string, so the
    // stored override, the preview and the PDF all agree and the assessor has
    // to do nothing. Escaped `\*\*` literals are preserved untouched.
    const repair = repairBoldMarkers(o.text);
    if (repair.changed) {
      repairedSlots.push({ slotId: o.slotId, kind: repair.kind });
    }
    if (repair.text.length > HARD_MAX_SLOT_LENGTH) {
      return {
        ok: false,
        message: `Patch ${o.slotId}: text exceeds ${HARD_MAX_SLOT_LENGTH}-char hard limit`,
      };
    }
    if (repair.text === "") {
      // Only reachable when the submitted text was nothing but formatting
      // marks (e.g. "**"): there is no real content to store, and an empty
      // override is not a valid envelope entry.
      return {
        ok: false,
        message: `Patch ${o.slotId}: the text contains no content (use "Reset to default" to clear this field)`,
      };
    }
    out.push({ slotId: o.slotId, text: repair.text });
  }
  return { ok: true, patches: out, repairedSlots };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticate(req, WRITE_ROLES);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing application id" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as PostBody | null;
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Missing request body" },
        { status: 400 },
      );
    }
    const ifVersion =
      typeof body.ifVersion === "number" && Number.isFinite(body.ifVersion)
        ? Math.max(0, Math.trunc(body.ifVersion))
        : null;
    if (ifVersion === null) {
      return NextResponse.json(
        { success: false, message: "Missing ifVersion (optimistic-lock token)" },
        { status: 400 },
      );
    }
    const sanitized = sanitizePatches(body.patches);
    if (!sanitized.ok) {
      return NextResponse.json(
        { success: false, message: sanitized.message },
        { status: 400 },
      );
    }

    const editor = toEditor(auth.claims, auth.effectiveRoles);

    const result = await withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      await client.query(`SET LOCAL statement_timeout = '15s'`);

      // Status guard: free-text edits are only permitted while the
      // application is still in an assessment stage. Once the file moves
      // forward (pending_review → final_approval → approved → issued) the
      // approver review pane has either run already or is about to, and the
      // gate in `app/api/approver/final-decision/route.ts` keys off the
      // envelope version. Allowing late writes here would silently bypass
      // that gate (review C1).
      const lockRes = await client.query<{
        internal_notes: string | null;
        status: string | null;
      }>(
        `
        SELECT internal_notes, status
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
      const status = String(lockRow.status ?? "").toLowerCase();
      if (!ASSESSMENT_WRITABLE_STATUSES.has(status)) {
        return { kind: "wrong_status" as const, status };
      }

      const parsed = readEnvelopeForWrite(lockRow.internal_notes);
      if (!parsed.ok) {
        return {
          kind: "corrupt_notes" as const,
          reason: parsed.reason,
          preview: parsed.rawPreview,
        };
      }

      if (parsed.envelope.version !== ifVersion) {
        return {
          kind: "conflict" as const,
          currentEnvelope: parsed.envelope,
        };
      }

      const apply = applyPatches(parsed.envelope, sanitized.patches, editor);
      if (!apply.ok) {
        return { kind: "patch_rejected" as const, reason: apply.reason, slotId: apply.slotId };
      }

      const nextNotes = writeEnvelopeIntoNotes(parsed.notes, apply.envelope);
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

      return { kind: "ok" as const, envelope: apply.envelope, appliedCount: apply.appliedCount };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }
    if (result.kind === "wrong_status") {
      return NextResponse.json(
        {
          success: false,
          code: "STATUS_NOT_EDITABLE",
          message: `Document text edits are only allowed while the application is in an assessment stage (current status: ${result.status || "unknown"}).`,
          status: result.status,
        },
        { status: 409 },
      );
    }
    if (result.kind === "corrupt_notes") {
      console.error("document-text-overrides refusing to write over non-object internal_notes", {
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
          message:
            "Document text overrides are out of date — somebody else saved while you were editing. Refresh to see the latest version.",
          currentEnvelope: result.currentEnvelope,
        },
        { status: 409 },
      );
    }
    if (result.kind === "patch_rejected") {
      return NextResponse.json(
        {
          success: false,
          message: `Patch for slot ${result.slotId} rejected: ${result.reason}`,
          slotId: result.slotId,
          reason: result.reason,
        },
        { status: 422 },
      );
    }

    if (sanitized.repairedSlots.length > 0) {
      console.warn("document-text-overrides auto-repaired bold markers", {
        applicationId: id,
        repaired: sanitized.repairedSlots,
      });
    }

    return NextResponse.json({
      success: true,
      envelope: result.envelope,
      appliedCount: result.appliedCount,
      // Informational: the saved text differs slightly from what was typed
      // because stray `**` marks were tidied up before storing.
      ...(sanitized.repairedSlots.length > 0
        ? { repairedSlots: sanitized.repairedSlots }
        : {}),
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
        {
          success: false,
          message: "The application is currently being edited. Please retry in a few seconds.",
        },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    const correlationId = randomUUID();
    console.error("document-text-overrides POST error", { correlationId, err });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save document text overrides",
        correlationId,
        detail: message,
      },
      { status: 500 },
    );
  }
}
