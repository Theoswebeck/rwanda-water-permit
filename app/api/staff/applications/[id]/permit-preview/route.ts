import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";
import { addPermitExpiry } from "@/lib/date-math";
import { resolvePermitIssueDate } from "@/lib/permit/resolve-issue-date";
import {
  resolveModificationValidity,
  type ValiditySource,
} from "@/lib/permit/resolve-modification-validity";
import { resolvePreviewPermitNumber } from "@/lib/permit/resolve-preview-permit-number";
import { assessorPermitLengthYears } from "@/lib/permit/resolve-render-dates-from-notes";

export const runtime = "nodejs";

const ALLOWED_STAFF_ROLES = [
  "admin",
  "reviewer",
  "approver",
  "verifier",
  "inspector",
  "assessor",
] as const;

/**
 * Parse a date string that may be ISO (YYYY-MM-DD) or US MM/DD/YYYY format.
 * Returns null when unparseable so callers can fall through gracefully.
 */
function parseFlexDate(s: unknown): Date | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim();
  // ISO: YYYY-MM-DD (± optional time component)
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // US date-picker output: MM/DD/YYYY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(
      `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00Z`,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

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

function resolvePreviewErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to generate permit preview";
  const message = err.message?.trim() ?? "";
  const lower = message.toLowerCase();

  if (!message) return "Failed to generate permit preview";
  if (lower.includes("invalid session") || lower.includes("jwt")) return "Invalid session";
  if (lower.includes("forbidden") || lower.includes("not authenticated")) return "Forbidden";
  if (lower.includes("not found")) return "Application not found";
  if (
    lower.includes("database") ||
    lower.includes("postgres") ||
    lower.includes("connection") ||
    lower.includes("timeout")
  ) {
    return "Could not load application data for preview";
  }
  if (
    lower.includes("pdf") ||
    lower.includes("render") ||
    lower.includes("watermark") ||
    lower.includes("font")
  ) {
    return "Could not render permit preview PDF";
  }
  return "Failed to generate permit preview";
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
        ST_AsGeoJSON(a.coordinates)::json AS coordinates,
        a.is_modification,
        a.approved_at,
        a.is_bulk,
        a.bulk_networks,
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
      // GeoJSON geometry — feeds resolveLatLng's Point fallback so the preview
      // shows the same coordinates as the contract and assessment report.
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
    // company_phone isn't in PermitApplication.applicant but is used in resolveOrgAddress
    // via internal_notes (officePhone) — attach as any for renderers that may need it.
    (application.applicant as any).company_phone =
      row.company_phone != null ? String(row.company_phone) : undefined;

    // water_body_name is accessed as (app as any).water_body_name in resolveWaterSourceName
    (application as any).water_body_name =
      row.water_body_name != null ? String(row.water_body_name) : undefined;

    // Bulk water supply — required by selectPermitVariant() and resolveBulkNetworks()
    (application as any).is_bulk = row.is_bulk === true;
    (application as any).bulk_networks = Array.isArray(row.bulk_networks)
      ? row.bulk_networks
      : [];

    // ── Resolve permit number ─────────────────────────────────────────────────
    const isModification =
      row.is_modification === true || notes?.isModification === true;
    const isRenewal =
      application.application_type === "renewal" || notes?.isRenewal === true;
    const isTransfer =
      application.application_type === "transfer" || notes?.isTransfer === true;

    const permitNumber = resolvePreviewPermitNumber(notes);

    // ── Resolve exact expiry date and validity years ──────────────────────────
    // For transfers and modifications the permit must show the EXACT original
    // expiry date — not today + N years, which drifts from the real date.
    // For renewals the new permit starts today but runs for the same total
    // duration as the original.
    // We pass expiryDate directly so the renderers use it verbatim instead of
    // computing issueDate + resolvePermitDuration().
    let exactExpiryDate: Date | undefined;
    // Modifications additionally preserve the ORIGINAL issue date — a
    // modification never resets the validity window, so the rendered issue
    // date must be the original permit's, not the modification's approval day.
    let exactIssuedDate: Date | undefined;
    let permitValidityYears: number | undefined;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const originalPermitId =
      typeof notes?.originalPermitId === "string" ? notes.originalPermitId.trim() : null;
    const originalPermitNumber =
      typeof notes?.originalPermitNumber === "string"
        ? notes.originalPermitNumber.trim()
        : "";

    if (isModification) {
      // ── Modification: keep the ORIGINAL validity window (issue + expiry).
      // Gather every source that might hold the original permit's dates, in
      // priority order, and let the resolver pick the first with a real
      // expiry. Never fall back to a duration — that is the "treated like a
      // new permit" bug. If nothing resolves, the renderer default applies.
      const sources: ValiditySource[] = [];

      // 1. Linked digital permit (public.permits) by UUID.
      if (originalPermitId && UUID_RE.test(originalPermitId)) {
        try {
          const pRes = await query<{ issued_date: string | null; expiry_date: string | null }>(
            `SELECT issued_date, expiry_date FROM public.permits WHERE id = $1 LIMIT 1`,
            [originalPermitId],
          );
          if (pRes.rows.length) {
            sources.push({
              issued: pRes.rows[0].issued_date,
              expiry: pRes.rows[0].expiry_date,
            });
          }
        } catch {
          // Non-fatal — try the next source.
        }
      }

      // 2. Authoritative permit_registry row, matched by permit number.
      if (originalPermitNumber) {
        try {
          const rRes = await query<{ issuance_date: string | null; expiration_date: string | null }>(
            `SELECT issuance_date, expiration_date FROM public.permit_registry WHERE permit_number = $1 LIMIT 1`,
            [originalPermitNumber],
          );
          if (rRes.rows.length) {
            sources.push({
              issued: rRes.rows[0].issuance_date,
              expiry: rRes.rows[0].expiration_date,
            });
          }
        } catch {
          // Non-fatal — try the next source.
        }
      }

      // 3. Registry snapshot captured on the application at creation time.
      const snap = notes?.permitReference?.registrySnapshot as
        | { issued_date?: string | null; expiry_date?: string | null }
        | undefined;
      if (snap) {
        sources.push({ issued: snap.issued_date, expiry: snap.expiry_date });
      }

      // 4. Legacy transferFormData dates (older manual entries).
      sources.push({
        issued: notes?.transferFormData?.effectiveDate,
        expiry: notes?.transferFormData?.expirationDate,
      });

      const resolved = resolveModificationValidity(sources);
      if (resolved.expiryDate) exactExpiryDate = resolved.expiryDate;
      if (resolved.issuedDate) exactIssuedDate = resolved.issuedDate;
    } else if (isRenewal && assessorPermitLengthYears(notes)) {
      // Assessor-set duration wins over the inherited original term; the
      // renderer computes issuedDate + resolvePermitDuration() (assessor first),
      // exactly as the terms page does when the permit is actually issued.
    } else if (isRenewal || isTransfer) {
      // Step 1: try transferFormData (registry/manual permits + any transfer where
      // the applicant entered the original permit's dates in the form).
      const expiryFromNotes = parseFlexDate(notes?.transferFormData?.expirationDate);
      const issueFromNotes  = parseFlexDate(notes?.transferFormData?.effectiveDate);

      if (expiryFromNotes) {
        if (isTransfer || isModification) {
          // Transfer / modification: preserve the exact expiry of the original permit.
          exactExpiryDate = expiryFromNotes;
        } else if (isRenewal && issueFromNotes) {
          // Renewal from registry permit: inherit total duration, starting today.
          const totalYears = Math.round(
            (expiryFromNotes.getTime() - issueFromNotes.getTime()) / (365.25 * 24 * 3600 * 1000),
          );
          if (totalYears >= 1 && totalYears <= 15) {
            permitValidityYears = totalYears;
            exactExpiryDate = addPermitExpiry(new Date(), totalYears);
          }
        }
      }

      // Step 1b: for renewals, also check permitDetails.issuedDate/expiryDate
      // (set by PermitRenewalForm — manual registry permits store dates here, not in transferFormData).
      if (isRenewal && !exactExpiryDate) {
        const expiryFromDetails = parseFlexDate(notes?.permitDetails?.expiryDate);
        const issueFromDetails  = parseFlexDate(notes?.permitDetails?.issuedDate);
        if (expiryFromDetails && issueFromDetails) {
          const totalYears = Math.round(
            (expiryFromDetails.getTime() - issueFromDetails.getTime()) / (365.25 * 24 * 3600 * 1000),
          );
          if (totalYears >= 1 && totalYears <= 15) {
            permitValidityYears = totalYears;
            exactExpiryDate = addPermitExpiry(new Date(), totalYears);
          }
        }
      }

      // Step 2: if still no exact date, fetch original permit from DB.
      if (!exactExpiryDate && originalPermitId && UUID_RE.test(originalPermitId)) {
        try {
          const pRes = await query<{ issued_date: string | null; expiry_date: string | null }>(
            `SELECT issued_date, expiry_date FROM public.permits WHERE id = $1 LIMIT 1`,
            [originalPermitId],
          );
          if (pRes.rows.length) {
            const origExpiry = parseFlexDate(pRes.rows[0].expiry_date);
            const origIssue  = parseFlexDate(pRes.rows[0].issued_date);
            if (origExpiry) {
              if (isRenewal && origIssue) {
                // Renewal: same total duration as original, starting today.
                const totalYears = Math.round(
                  (origExpiry.getTime() - origIssue.getTime()) / (365.25 * 24 * 3600 * 1000),
                );
                if (totalYears >= 1 && totalYears <= 15) {
                  permitValidityYears = totalYears;
                  exactExpiryDate = addPermitExpiry(new Date(), totalYears);
                }
              } else {
                // Transfer / modification: preserve exact original expiry.
                exactExpiryDate = origExpiry;
              }
            }
          }
        } catch {
          // Non-fatal — renderer falls back to resolvePermitDuration() / 5 years.
        }
      }
    }

    // ── Resolve issuance date ─────────────────────────────────────────────────
    // Same rule as every other render path: the date locks to
    // `applications.approved_at` the moment the Director General approves
    // the application; before that the preview shows today (so a stale
    // assessor edit from a previous day cannot leak into the legal
    // validity paragraphs). See `lib/permit/resolve-issue-date.ts`.
    const approvedAtRaw =
      typeof row.approved_at === "string"
        ? row.approved_at
        : row.approved_at instanceof Date
          ? row.approved_at.toISOString()
          : null;
    const issuedDate = resolvePermitIssueDate({
      // Modifications keep the original permit's issue date; every other type
      // locks to approved_at (or today before approval).
      permitIssuedDate: exactIssuedDate,
      approvedAt: approvedAtRaw,
    });

    // ── Resolve signing date (the "Done at … On" line) ────────────────────────
    // This is the date the Director General signs — the approval date, or
    // today while still in preview. It is NOT the validity start: a
    // modification keeps the original validity window but is executed on the
    // day its modification is approved.
    const signingDate = resolvePermitIssueDate({ approvedAt: approvedAtRaw });

    // ── Generate PDF ──────────────────────────────────────────────────────────
    const pdfBuffer = await generatePermitPdfBuffer({
      application,
      permitNumber,
      issuedDate,
      signingDate,
      skipQr: true,
      isModified: Boolean(isModification),
      ...(exactExpiryDate   !== undefined && { expiryDate: exactExpiryDate }),
      ...(permitValidityYears !== undefined && { permitValidityYears }),
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="permit-preview.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = resolvePreviewErrorMessage(err);
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
      { success: false, message },
      { status: 500 },
    );
  }
}
