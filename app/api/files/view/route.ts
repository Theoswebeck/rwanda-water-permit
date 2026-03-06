import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

const STAFF_ROLES = new Set(["reviewer", "verifier", "approver", "assessor", "inspector", "admin"]);

function toError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function sanitizeRequestedPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..")) return null;
  return normalized;
}

async function isStaffUser(userId: string): Promise<boolean> {
  const res = await query<{ role: string | null }>(
    `
    select role
    from public.users
    where id = $1
    limit 1
    `,
    [userId]
  );
  const role = String(res.rows[0]?.role || "").toLowerCase();
  return STAFF_ROLES.has(role);
}

async function findAccessibleDocument(
  normalizedPath: string,
  userId: string
): Promise<{ file_path: string; mime_type: string | null; name: string | null } | null> {
  const pathWithoutLeadingSlash = normalizedPath.replace(/^\/+/, "");
  const variants = Array.from(new Set([normalizedPath, pathWithoutLeadingSlash]));
  const staff = await isStaffUser(userId);

  const res = await query<{
    file_path: string;
    mime_type: string | null;
    name: string | null;
    applicant_id: string;
  }>(
    `
    select d.file_path, d.mime_type, d.name, a.applicant_id
    from public.documents d
    join public.applications a on a.id = d.application_id
    where d.file_path = any($1::text[])
    order by d.created_at desc
    limit 1
    `,
    [variants]
  );

  const row = res.rows[0];
  if (!row) return null;
  if (!staff && row.applicant_id !== userId) return null;

  return {
    file_path: row.file_path,
    mime_type: row.mime_type,
    name: row.name,
  };
}

async function tryReadLocalFile(relativePath: string): Promise<Buffer | null> {
  const trimmed = relativePath.trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..")) return null;
  const relNoSlash = normalized.replace(/^\/+/, "");

  const candidateRoots = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "..", "public"),
    path.resolve(process.cwd(), ".."),
  ];

  for (const root of candidateRoots) {
    const resolved = path.resolve(root, relNoSlash);
    if (!resolved.startsWith(root)) continue;
    try {
      return await readFile(resolved);
    } catch {
      // Continue to next candidate root.
    }
  }

  return null;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    if (!claims?.sub) {
      return toError("Unauthorized", 401);
    }

    const pathParam = req.nextUrl.searchParams.get("path");
    const normalizedPath = pathParam ? sanitizeRequestedPath(pathParam) : null;
    if (!normalizedPath) {
      return toError("Missing or invalid path", 400);
    }

    let fileBytes: Buffer | null = null;
    let mimeType: string | null = null;
    let fileName: string | null = null;

    if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
      // Legacy support for rows that stored absolute URLs.
      const response = await fetch(normalizedPath);
      if (!response.ok) {
        return toError("Document not found", 404);
      }
      fileBytes = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type");
      const urlObject = new URL(normalizedPath);
      fileName = decodeURIComponent(urlObject.pathname.split("/").pop() || "document");
    } else {
      const documentRow = await findAccessibleDocument(normalizedPath, claims.sub);
      if (!documentRow) {
        return toError("Document not found or access denied", 404);
      }

      fileBytes = await tryReadLocalFile(documentRow.file_path);
      if (!fileBytes) {
        // Fallback: if static serving works in this environment, proxy via same-origin URL.
        const staticUrl = new URL(
          documentRow.file_path.startsWith("/") ? documentRow.file_path : `/${documentRow.file_path}`,
          req.url
        ).toString();
        const response = await fetch(staticUrl);
        if (!response.ok) {
          return toError("Document file is missing on server", 404);
        }
        fileBytes = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || documentRow.mime_type;
      } else {
        mimeType = documentRow.mime_type;
      }

      fileName = documentRow.name || path.basename(documentRow.file_path);
    }

    if (!fileBytes) {
      return toError("Document not found", 404);
    }

    return new NextResponse(fileBytes, {
      headers: {
        "Content-Type": mimeType || inferMimeType(normalizedPath),
        "Content-Disposition": `inline; filename="${String(fileName || "document").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = toError("Invalid session", 401);
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ files/view error:", error);
    return toError("Server error", 500);
  }
}
