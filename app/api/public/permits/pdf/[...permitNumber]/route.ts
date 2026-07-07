import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { isConcessionApplication } from "@/lib/permit-variant";
import { resolvePermitIssueDate } from "@/lib/permit/resolve-issue-date";
import { parseChildPermitNumber } from "@/lib/permit-number-utils";

export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindow = new Map<string, number[]>();

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = requestWindow.get(key) || [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindow.set(key, recent);
    return false;
  }
  recent.push(now);
  requestWindow.set(key, recent);
  return true;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function tryReadStoredPdf(permitPdfUrl: string, req: NextRequest): Promise<Buffer | null> {
  const trimmed = permitPdfUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  const relativePath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (relativePath.includes("..")) return null;

  const publicDir = path.resolve(process.cwd(), "public");
  const resolvedPath = path.resolve(publicDir, `.${relativePath}`);
  if (!resolvedPath.startsWith(publicDir)) return null;

  try {
    return await readFile(resolvedPath);
  } catch {
    // Fallback for environments where files are served remotely.
    const url = new URL(relativePath, req.url).toString();
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
}

function parseIsoLikeDate(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function applyPermitAllowanceToApplication(
  application: PermitApplication,
  permit: Record<string, unknown>
): PermitApplication {
  const allowance = parsePositiveNumber(permit.water_allowance);
  if (!allowance) return application;

  const next: PermitApplication = { ...application };
  const isConcession = isConcessionApplication(next as any);
  if (isConcession) {
    next.concession_area = allowance;
  } else {
    next.assessor_recommended_volume_m3 = allowance;
    next.max_yearly_volume_m3 = allowance;
    if (typeof next.max_daily_volume_m3 !== "number" || !Number.isFinite(next.max_daily_volume_m3) || next.max_daily_volume_m3 <= 0) {
      next.max_daily_volume_m3 = allowance / 365;
    }
  }

  if (typeof permit.allowance_unit === "string" && permit.allowance_unit.trim()) {
    next.usage_unit = permit.allowance_unit.trim();
  }

  return next;
}

export async function GET(req: NextRequest, context: { params: Promise<{ permitNumber: string[] }> }) {
  try {
    const { permitNumber: segments } = await context.params;
    const permitNumber = decodeURIComponent(segments.join("/"));
    const ip = getClientIp(req);
    const throttleKey = `${ip}:${permitNumber.toUpperCase()}`;
    if (!checkRateLimit(throttleKey)) {
      return jsonError("Too many PDF requests. Please retry in a minute.", 429);
    }

    // If this is a child bulk permit (e.g. "000918_1/RWB/2026"), serve the parent PDF.
    const childInfo = parseChildPermitNumber(permitNumber);
    const lookupNumber = childInfo
      ? `${childInfo.parentSeq}/RWB/${childInfo.year}`
      : permitNumber;

    const result = await findPublicPermitByNumber(lookupNumber, { includeRegistryFallback: false });
    if (!result.inputPermitNumber) {
      return jsonError("Invalid permit number.", 400);
    }
    if (!result.permit || result.permit.source !== "permits") {
      return jsonError("Permit not found.", 404);
    }

    const permit = result.permit as Record<string, unknown>;
    const permitNumberValue = String(permit.permit_number || result.inputPermitNumber);

    const existingPdfPath = typeof permit.permit_pdf_url === "string" ? permit.permit_pdf_url : "";
    const application = (permit.application || null) as Record<string, unknown> | null;
    if (application) {
      // Canonical permit renderer shared with /api/test/permit-pdf.
      const applicationForPdf = applyPermitAllowanceToApplication(
        application as unknown as PermitApplication,
        permit
      );
      // Same rule as every other render path — see lib/permit/resolve-issue-date.ts.
      // Once the permit row exists, `permits.issued_date` wins (priority 1).
      // For the rare case where a permit row exists without `issued_date`
      // (defensive — shouldn't happen via the normal flow), fall back to
      // `applications.approved_at` so the rendered date still reflects the
      // legal effective day, not whatever day the public link is opened.
      const issuedDate = resolvePermitIssueDate({
        permitIssuedDate:
          typeof permit.issued_date === "string" ? permit.issued_date : null,
        approvedAt:
          typeof application?.approved_at === "string"
            ? application.approved_at
            : null,
      });

      // Signing/execution date for "Done at … On" — the day the DG signed.
      // A modification keeps the original validity window (issuedDate above)
      // but is signed when the modification is approved, recorded as the
      // latest conditions.modification_history[].modified_at. For a
      // non-modification permit there is no history, so this resolves to
      // approved_at (== issuedDate).
      const conditions = permit.conditions as Record<string, unknown> | null | undefined;
      const modHistory = Array.isArray(conditions?.modification_history)
        ? (conditions!.modification_history as Array<Record<string, unknown>>)
        : [];
      const lastModifiedAt = modHistory.length
        ? modHistory[modHistory.length - 1]?.modified_at
        : null;
      const signingDate = resolvePermitIssueDate({
        permitIssuedDate: typeof lastModifiedAt === "string" ? lastModifiedAt : null,
        approvedAt:
          typeof application?.approved_at === "string"
            ? application.approved_at
            : null,
      });

      const pdfBuffer = await generatePermitPdfBuffer({
        application: applicationForPdf,
        permitNumber: permitNumberValue,
        permitValidityYears: 5,
        isModified: Boolean(permit.is_modification),
        issuedDate,
        signingDate,
        expiryDate: parseIsoLikeDate((permit.expiry_date as string | undefined) || undefined),
      });

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="permit-${permitNumberValue}.pdf"`,
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      });
    }

    if (existingPdfPath) {
      const stored = await tryReadStoredPdf(existingPdfPath, req);
      if (stored) {
        return new NextResponse(stored, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="permit-${permitNumberValue}.pdf"`,
            "Cache-Control": "public, max-age=900, s-maxage=900",
          },
        });
      }
    }

    return jsonError("Permit exists but cannot be rendered without application context.", 422);
  } catch (error) {
    console.error("public permit pdf error:", error);
    return jsonError("Failed to generate permit PDF.", 500);
  }
}

