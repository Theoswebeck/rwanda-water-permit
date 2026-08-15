/**
 * Inspection report PDF download.
 *
 * GET /api/staff/inspections/<inspection-id>/report
 *   → application/pdf, the approved inspection rendered as a printable report.
 *
 * Only APPROVED inspections download: a downloaded file leaves the system and
 * is read as a final RWB record, so a half-filled draft must never be able to
 * masquerade as one. Anything else returns 409 with a message the UI shows.
 *
 * Same staff gate as the sibling dossier route — applicants never reach this.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { loadInspectionReportContext } from "@/lib/inspections/report-context-server";
import { generateInspectionReportPdfBuffer } from "@/lib/pdf-inspection-report-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STAFF_ROLES = [
  "admin",
  "reviewer",
  "approver",
  "verifier",
  "inspector",
  "assessor",
] as const;

/** Permit numbers contain slashes — keep the filename safe on every OS. */
function safeFileName(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\/\\:*?"<>|\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || fallback;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }
    const resolvedRoles = await resolveEffectiveRoles({ userId, claimsRole: claims?.role });
    if (!hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id || typeof id !== "string" || id.length < 10) {
      return NextResponse.json({ success: false, message: "Invalid inspection id" }, { status: 400 });
    }

    const context = await loadInspectionReportContext(id);
    if (!context) {
      return NextResponse.json({ success: false, message: "Inspection not found" }, { status: 404 });
    }
    if (context.workflowStatus !== "approved") {
      return NextResponse.json(
        {
          success: false,
          message: "Only approved inspections can be downloaded.",
        },
        { status: 409 },
      );
    }

    const pdf = await generateInspectionReportPdfBuffer({
      template: context.template,
      manualInspection: context.manualInspection,
      form: context.form,
      locked: context.locked,
      inspectionNumber: context.inspectionNumber,
      inspectorName: context.inspectorName,
      inspectionDate: context.inspectionDate,
      workflowStatus: context.workflowStatus,
      approvedAt: context.approvedAt,
    });

    const namePart = safeFileName(
      context.permitNumber || context.inspectionNumber || context.inspectionId.slice(0, 8),
      "inspection",
    );
    const datePart = context.inspectionDate || new Date().toISOString().slice(0, 10);
    const fileName = `inspection-${namePart}-${datePart}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("❌ inspection report PDF failed:", msg);
    return NextResponse.json(
      { success: false, message: msg || "Failed to generate the inspection report." },
      { status: 500 },
    );
  }
}
