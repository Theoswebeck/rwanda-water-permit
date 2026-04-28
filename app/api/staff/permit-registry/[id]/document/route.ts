import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

async function tryReadLocalFile(relativePath: string): Promise<Buffer | null> {
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
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
      // Try next candidate root.
    }
  }

  return null;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }

    const result = await query<{
      uploaded_doc_path: string | null;
      uploaded_doc_name: string | null;
      uploaded_doc_mime_type: string | null;
    }>(
      `
      select uploaded_doc_path, uploaded_doc_name, uploaded_doc_mime_type
      from public.permit_registry
      where id = $1
      limit 1
      `,
      [id]
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }

    const filePath = String(row.uploaded_doc_path || "").trim();
    if (!filePath) {
      return NextResponse.json({ success: false, message: "No uploaded document for this permit" }, { status: 404 });
    }

    let fileBytes: Buffer | null = null;
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      const external = await fetch(filePath);
      if (!external.ok) {
        return NextResponse.json({ success: false, message: "Document not found" }, { status: 404 });
      }
      fileBytes = Buffer.from(await external.arrayBuffer());
    } else {
      fileBytes = await tryReadLocalFile(filePath);
      if (!fileBytes) {
        const sameOriginFileUrl = new URL(filePath.startsWith("/") ? filePath : `/${filePath}`, req.url).toString();
        const proxied = await fetch(sameOriginFileUrl);
        if (proxied.ok) {
          fileBytes = Buffer.from(await proxied.arrayBuffer());
        }
      }
    }

    if (!fileBytes) {
      return NextResponse.json({ success: false, message: "Document file is missing on server" }, { status: 404 });
    }

    const filename = String(row.uploaded_doc_name || path.basename(filePath) || "permit-document").replace(/"/g, "");
    const mimeType = row.uploaded_doc_mime_type || inferMimeType(filePath);
    return new NextResponse(fileBytes, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }

    // Look up permit_number from registry row
    const registryResult = await query<{ permit_number: string }>(
      `select permit_number from public.permit_registry where id = $1 limit 1`,
      [id]
    );
    const registryRow = registryResult.rows[0];
    if (!registryRow) {
      return NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 });
    }
    const { permit_number } = registryRow;

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
    const safePermitNumber = safeSegment(permit_number);
    const relDir = path.join("uploads", "permit-registry", safePermitNumber);
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    const diskName = `${Date.now()}-${safeSegment(file.name || `document${ext}`)}`;
    const absFile = path.join(absDir, diskName);
    await writeFile(absFile, bytes);

    const relPath = `/${path.join(relDir, diskName).replaceAll(path.sep, "/")}`;

    const insertResult = await query<{
      id: string;
      permit_number: string;
      doc_path: string;
      doc_name: string;
      doc_mime_type: string;
      uploaded_at: string;
    }>(
      `
      insert into public.permit_registry_documents
        (permit_number, doc_path, doc_name, doc_mime_type)
      values ($1, $2, $3, $4)
      returning id, permit_number, doc_path, doc_name, doc_mime_type, uploaded_at
      `,
      [permit_number, relPath, file.name || diskName, mime]
    );

    return NextResponse.json({
      success: true,
      document: insertResult.rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
