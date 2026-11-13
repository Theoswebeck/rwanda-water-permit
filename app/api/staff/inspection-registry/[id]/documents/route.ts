import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";

export const runtime = "nodejs";

/**
 * POST `/api/staff/inspection-registry/{id}/documents`
 *
 * Attaches supporting documents (inspection reports, photos, letters) to an
 * Inspection Registry row — an imported row or an approved system inspection.
 * Same file rules as the permit-registry document upload; same editor roles
 * as the registry row PATCH.
 */
const EDITOR_ROLES = ["assessor", "approver", "reviewer", "verifier", "admin"] as const;

// middleware.ts runs on /api/*, and Next truncates middleware request bodies at
// 10 MB (experimental.middlewareClientMaxBodySize) — keep the file plus
// multipart overhead under that.
const MAX_FILE_BYTES = 9 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(req, EDITOR_ROLES);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid inspection registry id" }, { status: 400 });
    }

    // No FK covers both sources (see 2026-10-12 migration), so check here.
    const exists = await query(
      `select 1 from public.inspection_registry where id = $1
       union all
       select 1 from public.inspections where id = $1 and workflow_status = 'approved'`,
      [id]
    );
    if (!exists.rowCount) {
      return NextResponse.json({ success: false, message: "Inspection registry row not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "File is required" }, { status: 400 });
    }

    const ext = (path.extname(file.name || "") || "").toLowerCase();
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime) || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { success: false, message: "Unsupported file type. Use PDF, PNG, JPG, or WEBP." },
        { status: 400 }
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, message: "File must be between 1 byte and 9 MB." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const relDir = path.join("uploads", "inspection-registry", id.toLowerCase());
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    // Random disk name: the original name is kept in doc_name only, so odd
    // names (dot runs, very long, non-ASCII) can't break storage or lookup.
    const diskName = `${Date.now()}-${randomUUID()}${ext}`;
    const absFile = path.join(absDir, diskName);
    await writeFile(absFile, bytes);

    // On the on-prem server public/uploads must be the symlink into the
    // persistent store (/var/data/waterpermit/uploads). Fail loudly at upload
    // time rather than letting the file 404 later as FILE_MISSING.
    const written = await stat(absFile).catch(() => null);
    if (!written || written.size !== bytes.length) {
      await unlink(absFile).catch(() => {});
      return NextResponse.json(
        { success: false, message: "Upload could not be persisted on the server — contact RWB IT before retrying." },
        { status: 500 }
      );
    }

    const relPath = `/${path.join(relDir, diskName).replaceAll(path.sep, "/")}`;

    const insertResult = await query(
      `insert into public.inspection_registry_documents
         (inspection_id, doc_path, doc_name, doc_mime_type, uploaded_by)
       values ($1, $2, $3, $4, $5)
       returning id, inspection_id, doc_name, doc_mime_type, uploaded_by, uploaded_at`,
      [id, relPath, file.name || diskName, mime, auth.email || null]
    ).catch(async (err) => {
      await unlink(absFile).catch(() => {});
      throw err;
    });

    return NextResponse.json({ success: true, document: insertResult.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("inspection-registry document upload failed:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
