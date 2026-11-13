import { readFile, unlink } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireRole } from "@/lib/auth/require-role";
import {
  MISSING_FILE_CODE,
  MISSING_FILE_MESSAGE,
  contentDispositionFileName,
  resolveLocalFile,
} from "@/lib/documents/file-availability";

export const runtime = "nodejs";

/**
 * GET    `/api/staff/inspection-registry/{id}/documents/{docId}` — serve the file (any staff; middleware-gated)
 * DELETE `/api/staff/inspection-registry/{id}/documents/{docId}` — remove it (registry editor roles)
 */
const EDITOR_ROLES = ["assessor", "approver", "reviewer", "verifier", "admin"] as const;

type DocRow = {
  id: string;
  doc_path: string;
  doc_name: string;
  doc_mime_type: string;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function lookupDoc(
  ctx: { params: Promise<{ id: string; docId: string }> }
): Promise<{ ok: true; doc: DocRow } | { ok: false; response: NextResponse }> {
  const { id, docId } = await ctx.params;
  if (!id || !isValidUuid(id) || !docId || !isValidUuid(docId)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Invalid document id" }, { status: 400 }),
    };
  }

  // Scoped to the row so a doc id can't be fetched through another row's URL.
  const result = await query<DocRow>(
    `select id, doc_path, doc_name, doc_mime_type
     from public.inspection_registry_documents
     where id = $1 and inspection_id = $2
     limit 1`,
    [docId, id]
  );
  const doc = result.rows[0];
  if (!doc) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Document not found" }, { status: 404 }),
    };
  }
  return { ok: true, doc };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const lookup = await lookupDoc(ctx);
    if (!lookup.ok) return lookup.response;
    const { doc } = lookup;

    const absPath = await resolveLocalFile(doc.doc_path);
    const bytes = absPath ? await readFile(absPath).catch(() => null) : null;
    if (!bytes) {
      return NextResponse.json(
        { success: false, code: MISSING_FILE_CODE, message: MISSING_FILE_MESSAGE },
        { status: 404 }
      );
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": doc.doc_mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${contentDispositionFileName(doc.doc_name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const auth = await requireRole(req, EDITOR_ROLES);
    if (!auth.ok) return auth.response;

    const lookup = await lookupDoc(ctx);
    if (!lookup.ok) return lookup.response;
    const { doc } = lookup;

    await query(`delete from public.inspection_registry_documents where id = $1`, [doc.id]);

    // Best-effort: a file already gone from disk shouldn't block removing the row.
    const absPath = await resolveLocalFile(doc.doc_path);
    if (absPath) await unlink(absPath).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("inspection-registry document delete failed:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
