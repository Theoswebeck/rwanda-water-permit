import path from "node:path";
import { access } from "node:fs/promises";

/**
 * Machine-readable marker for "the database row exists but the underlying
 * file is gone from disk". Lets API consumers distinguish a lost upload
 * (2026-07-08 uploads incident — recovery in progress) from a generic
 * lookup failure or server error.
 */
export const MISSING_FILE_CODE = "FILE_MISSING";

/**
 * Honest, friendly message for documents whose file was lost from the
 * server. Shown to both staff and applicants.
 */
export const MISSING_FILE_MESSAGE =
  "This document is missing from the server and is being recovered — contact RWB if urgent.";

/**
 * Same candidate roots the file-serving routes read from
 * (see app/api/files/view/route.ts tryReadLocalFile).
 */
function candidateRoots(): string[] {
  return [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "..", "public"),
    path.resolve(process.cwd(), ".."),
  ];
}

/**
 * Cheap existence check for a stored relative file path (e.g.
 * "/uploads/application-documents/<id>/<file>"). Returns false only when the
 * file is absent from every candidate root — an `access` miss everywhere is
 * exactly the "row exists, file lost" state.
 *
 * External http(s) paths cannot be cheaply verified here; callers should
 * skip them rather than report them missing.
 */
export async function localFileExists(relativePath: string): Promise<boolean> {
  return (await resolveLocalFile(relativePath)) !== null;
}

/**
 * Filename safe for a `Content-Disposition` header: non-ASCII characters make
 * `new NextResponse(...)` throw a ByteString TypeError.
 */
export function contentDispositionFileName(fileName: string | null | undefined): string {
  const cleaned = String(fileName || "")
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
  return cleaned || "document";
}

/**
 * Absolute on-disk path of a stored relative file path, or null when the file
 * is absent from every candidate root (or the path tries to escape them).
 */
export async function resolveLocalFile(relativePath: string): Promise<string | null> {
  const trimmed = (relativePath || "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..")) return null;
  const relNoSlash = normalized.replace(/^\/+/, "");

  for (const root of candidateRoots()) {
    const resolved = path.resolve(root, relNoSlash);
    if (!resolved.startsWith(root)) continue;
    try {
      await access(resolved);
      return resolved;
    } catch {
      // Not in this root — try the next one.
    }
  }

  return null;
}
