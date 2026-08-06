import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";
import { isEffectiveStaffUser, resolveEffectiveRoles } from "@/lib/auth/effective-roles";

export const runtime = "nodejs";

/**
 * Cap on the same-origin static fallback. The on-prem server cannot resolve
 * its own public hostname, so an unbounded fetch here stalled requests for
 * 5-14s before failing.
 */
const STATIC_PROXY_TIMEOUT_MS = 3000;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Document links open this route directly in a browser tab, so a bare JSON
 * body is what the user actually sees — which reads as a broken or corrupt
 * file. Render a readable page for real navigations and keep JSON for
 * programmatic callers.
 */
function toError(message: string, status: number, req?: NextRequest) {
  const wantsHtml = (req?.headers.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return NextResponse.json({ success: false, message }, { status });
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Document unavailable</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f8fafc; color:#0f172a;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .card { max-width:32rem; margin:1.5rem; padding:2rem; background:#fff; border:1px solid #e2e8f0;
          border-radius:0.75rem; box-shadow:0 1px 3px rgba(15,23,42,.08); }
  h1 { margin:0 0 .75rem; font-size:1.125rem; }
  p { margin:0; color:#475569; line-height:1.6; font-size:.95rem; }
  @media (prefers-color-scheme: dark) {
    body { background:#0f172a; color:#f1f5f9; }
    .card { background:#1e293b; border-color:#334155; }
    p { color:#cbd5e1; }
  }
</style></head>
<body><div class="card">
  <h1>Document unavailable</h1>
  <p>${escapeHtml(message)}</p>
</div></body></html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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
  const resolved = await resolveEffectiveRoles({ userId });
  return isEffectiveStaffUser(resolved.effectiveRoles);
}

async function findAccessibleDocument(
  normalizedPath: string,
  userId: string
): Promise<{ file_path: string; mime_type: string | null; name: string | null } | null> {
  const pathWithoutLeadingSlash = normalizedPath.replace(/^\/+/, "");
  const variants = Array.from(new Set([normalizedPath, pathWithoutLeadingSlash]));
  const staff = await isStaffUser(userId);

  // LEFT JOIN to applications so registry-owned documents (which have
  // application_id IS NULL and owner_kind='permit_registry') still
  // resolve. Inspection documents uploaded against a permit_registry
  // owner fall into this bucket; an INNER JOIN would silently drop
  // them and surface as a misleading "Document not found or access
  // denied" 404 in the UI.
  const res = await query<{
    file_path: string;
    mime_type: string | null;
    name: string | null;
    applicant_id: string | null;
    owner_kind: string | null;
    uploaded_by: string | null;
  }>(
    `
    select d.file_path,
           d.mime_type,
           d.name,
           a.applicant_id,
           d.owner_kind,
           d.uploaded_by
    from public.documents d
    left join public.applications a on a.id = d.application_id
    where d.file_path = any($1::text[])
    order by d.created_at desc
    limit 1
    `,
    [variants]
  );

  const row = res.rows[0];
  if (!row) return null;

  // Access policy:
  //   * Staff can view any document.
  //   * The original uploader can view their own document (covers staff
  //     who uploaded a registry-owned doc, and applicants for their own
  //     application docs).
  //   * The applicant can view documents on their application.
  if (!staff) {
    const isUploader = row.uploaded_by && row.uploaded_by === userId;
    const isApplicant = row.applicant_id && row.applicant_id === userId;
    if (!isUploader && !isApplicant) return null;
  }

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

/**
 * Best-effort proxy of a file through same-origin static serving.
 *
 * Bounded and fully swallowed: a slow or unreachable self-origin must
 * degrade to "file missing" (404), never to a 500 and never to a request
 * that ties up the handler for many seconds.
 */
async function tryProxyStaticFile(filePath: string, requestUrl: string): Promise<Buffer | null> {
  try {
    const staticUrl = new URL(
      filePath.startsWith("/") ? filePath : `/${filePath}`,
      requestUrl
    ).toString();

    const response = await fetch(staticUrl, {
      signal: AbortSignal.timeout(STATIC_PROXY_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    // nginx/Next.js answer unknown paths with an HTML error page rather than
    // a 404 in some configurations; serving that as the document is what
    // makes a download look corrupt. Reject non-file content types.
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return null;

    return Buffer.from(await response.arrayBuffer());
  } catch {
    // Timeout, DNS failure, TLS failure, connection refused — all mean the
    // file could not be produced.
    return null;
  }
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

function contentDispositionFileName(fileName: string | null | undefined): string {
  const fallback = "document";
  const cleaned = String(fileName || fallback)
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();

  return cleaned || fallback;
}

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    if (!claims?.sub) {
      return toError("Unauthorized", 401, req);
    }

    const pathParam = req.nextUrl.searchParams.get("path");
    const normalizedPath = pathParam ? sanitizeRequestedPath(pathParam) : null;
    if (!normalizedPath) {
      return toError("Missing or invalid path", 400, req);
    }

    let fileBytes: Buffer | null = null;
    let mimeType: string | null = null;
    let fileName: string | null = null;

    if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
      // Legacy support for rows that stored absolute URLs.
      const response = await fetch(normalizedPath);
      if (!response.ok) {
        return toError("Document not found", 404, req);
      }
      fileBytes = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type");
      const urlObject = new URL(normalizedPath);
      fileName = decodeURIComponent(urlObject.pathname.split("/").pop() || "document");
    } else {
      const documentRow = await findAccessibleDocument(normalizedPath, claims.sub);
      if (!documentRow) {
        return toError("Document not found or access denied", 404, req);
      }

      fileBytes = await tryReadLocalFile(documentRow.file_path);
      if (!fileBytes) {
        // Fallback: if static serving works in this environment, proxy via
        // same-origin URL.
        //
        // This must never be allowed to hang or throw its way into the
        // catch-all below: on the on-prem deployment the app cannot reach
        // its own public hostname, so this fetch stalls for seconds and
        // then rejects. That surfaced to assessors as a 500 "Server error"
        // — which browsers render as a truncated/corrupt download — instead
        // of an honest "the file is missing" message.
        fileBytes = await tryProxyStaticFile(documentRow.file_path, req.url);
        if (!fileBytes) {
          return toError(
            "This document's file is no longer available on the server. Please ask the applicant to re-upload it.",
            404,
            req
          );
        }
        mimeType = documentRow.mime_type;
      } else {
        mimeType = documentRow.mime_type;
      }

      fileName = documentRow.name || path.basename(documentRow.file_path);
    }

    if (!fileBytes) {
      return toError("Document not found", 404, req);
    }

    return new NextResponse(new Uint8Array(fileBytes), {
      headers: {
        "Content-Type": mimeType || inferMimeType(normalizedPath),
        "Content-Disposition": `inline; filename="${contentDispositionFileName(fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = toError("Invalid session", 401, req);
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ files/view error:", error);
    return toError("Server error", 500, req);
  }
}
