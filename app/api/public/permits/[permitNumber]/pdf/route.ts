import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";

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

function getCanonicalIssueDate(permit: Record<string, unknown>, application: Record<string, unknown> | null): string | undefined {
  const issuedDate = typeof permit.issued_date === "string" ? permit.issued_date.trim() : "";
  if (issuedDate) return issuedDate;
  const acceptedAt = typeof application?.terms_accepted_at === "string" ? application.terms_accepted_at.trim() : "";
  return acceptedAt || undefined;
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

export async function GET(req: NextRequest, context: { params: Promise<{ permitNumber: string }> }) {
  try {
    const { permitNumber } = await context.params;
    const ip = getClientIp(req);
    const throttleKey = `${ip}:${permitNumber.toUpperCase()}`;
    if (!checkRateLimit(throttleKey)) {
      return jsonError("Too many PDF requests. Please retry in a minute.", 429);
    }

    const result = await findPublicPermitByNumber(permitNumber, { includeRegistryFallback: false });
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
      const applicationForPdf = application as unknown as PermitApplication;
      const issueDate = getCanonicalIssueDate(permit, application);
      const pdfBuffer = await generatePermitPdfBuffer({
        application: applicationForPdf,
        permitNumber: permitNumberValue,
        permitValidityYears: 5,
        isModified: Boolean(permit.is_modification),
        issuedDate: parseIsoLikeDate(issueDate),
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

