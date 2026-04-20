import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";

export const runtime = "nodejs";

const ALLOWED_STAFF_ROLES = [
  "admin",
  "reviewer",
  "approver",
  "verifier",
  "inspector",
  "assessor",
] as const;

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

/**
 * Resolve the permit number to show on the draft preview.
 * - Renewals / modifications / transfers: always the original permit number from internal_notes.
 * - New (standard) applications: placeholder since the number isn't assigned until issuance.
 */
function resolvePreviewPermitNumber(
  appType: string,
  isModification: boolean,
  notes: Record<string, any> | null,
): string {
  const isRenewal = appType === "renewal" || notes?.isRenewal === true;
  const isMod = isModification || notes?.isModification === true;
  const isTransfer = appType === "transfer" || notes?.isTransfer === true;

  if (isRenewal || isMod || isTransfer) {
    const stored =
      typeof notes?.originalPermitNumber === "string"
        ? notes.originalPermitNumber.trim()
        : "";
    if (stored) return stored;
  }

  // New permit — number assigned by DB trigger at issuance, not predictable yet.
  const now = new Date();
  // Use Africa/Kigali timezone so the year matches what the DB trigger would use.
  const year = new Date(
    now.toLocaleString("en-US", { timeZone: "Africa/Kigali" }),
  ).getFullYear();
  return `XXXX/RWB/${year}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );
    }
    const resolvedRoles = await resolveEffectiveRoles({
      userId,
      claimsRole: claims?.role,
    });
    if (!hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    // ── Validate param ────────────────────────────────────────────────────────
    const { id } = await ctx.params;
    if (!id || typeof id !== "string" || id.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid application id" },
        { status: 400 },
      );
    }

    // ── Fetch application + applicant ─────────────────────────────────────────
    const result = await query<Record<string, unknown>>(
      `
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
      `,
      [id],
    );

    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }

    const row = result.rows[0];
    const notes = parseNotes(row.internal_notes);

    // ── Map DB row → PermitApplication ────────────────────────────────────────
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
    // company_phone isn't in PermitApplication.applicant but is used in resolveOrgAddress
    // via internal_notes (officePhone) — attach as any for renderers that may need it.
    (application.applicant as any).company_phone =
      row.company_phone != null ? String(row.company_phone) : undefined;

    // water_body_name is accessed as (app as any).water_body_name in resolveWaterSourceName
    (application as any).water_body_name =
      row.water_body_name != null ? String(row.water_body_name) : undefined;

    // ── Resolve permit number ─────────────────────────────────────────────────
    const isModification =
      row.is_modification === true || notes?.isModification === true;
    const permitNumber = resolvePreviewPermitNumber(
      application.application_type,
      Boolean(isModification),
      notes,
    );

    // ── Generate PDF ──────────────────────────────────────────────────────────
    // issuedDate = today; expiryDate computed inside generatePermitPdfBuffer via
    // resolvePermitDuration (assessorAdjustments.permitLengthYears → proposed_duration_years → 5).
    const pdfBuffer = await generatePermitPdfBuffer({
      application,
      permitNumber,
      issuedDate: new Date(),
      skipQr: true,
      isModified: Boolean(isModification),
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="permit-preview.pdf"',
        "Cache-Control": "no-store",
      },
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
    console.error("❌ permit-preview error:", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
