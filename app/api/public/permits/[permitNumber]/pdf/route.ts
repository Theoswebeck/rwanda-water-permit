import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { generateDigitalWaterPermitBlob } from "@/lib/pdf-generator";
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

function resolveConditions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v)).filter(Boolean);
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { conditions?: unknown[] }).conditions)) {
    return (raw as { conditions: unknown[] }).conditions.map((v) => String(v)).filter(Boolean);
  }
  return [];
}

function getCanonicalIssueDate(permit: Record<string, unknown>, application: Record<string, unknown> | null): string | undefined {
  const acceptedAt = typeof application?.terms_accepted_at === "string" ? application.terms_accepted_at.trim() : "";
  if (acceptedAt) return acceptedAt;
  const issuedDate = typeof permit.issued_date === "string" ? permit.issued_date.trim() : "";
  return issuedDate || undefined;
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
      // Always prefer the shared on-demand generator so public verification
      // returns the same canonical PDF layout/content as other permit views.
      const conditions = resolveConditions(permit.conditions);
      const applicationForPdf = application as Parameters<typeof generateDigitalWaterPermitBlob>[0];
      const issueDate = getCanonicalIssueDate(permit, application);
      const pdfBlob = await generateDigitalWaterPermitBlob(
        applicationForPdf,
        permitNumberValue,
        conditions,
        5,
        Boolean(permit.is_modification),
        {
          issuedDate: issueDate,
          expiryDate: (permit.expiry_date as string | undefined) || undefined,
        }
      );

      const bytes = Buffer.from(await pdfBlob.arrayBuffer());
      return new NextResponse(bytes, {
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

