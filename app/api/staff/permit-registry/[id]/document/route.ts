import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
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

    const bytes = Buffer.from(await file.arrayBuffer());
    const relDir = path.join("uploads", "permit-registry", safeSegment(id));
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    const diskName = `old-permit-${Date.now()}${safeSegment(ext)}`;
    const absFile = path.join(absDir, diskName);
    await writeFile(absFile, bytes);

    const relPath = `/${path.join(relDir, diskName).replaceAll(path.sep, "/")}`;

    const result = await query<{
      uploaded_doc_path: string | null;
      uploaded_doc_name: string | null;
      uploaded_doc_mime_type: string | null;
      uploaded_doc_uploaded_at: string | null;
    }>(
      `
      update public.permit_registry
      set
        uploaded_doc_path = $2,
        uploaded_doc_name = $3,
        uploaded_doc_mime_type = $4,
        uploaded_doc_uploaded_at = now(),
        updated_at = now()
      where id = $1
      returning
        uploaded_doc_path,
        uploaded_doc_name,
        uploaded_doc_mime_type,
        uploaded_doc_uploaded_at
      `,
      [id, relPath, file.name || diskName, mime]
    );

    if (!result.rowCount) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      document: result.rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
