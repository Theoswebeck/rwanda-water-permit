import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers (file-local copies — same logic as parent route)
// ---------------------------------------------------------------------------

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
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

// ---------------------------------------------------------------------------
// Shared lookup helper
// ---------------------------------------------------------------------------

type DocRow = {
  id: string;
  permit_number: string;
  doc_path: string;
  doc_name: string;
  doc_mime_type: string;
  uploaded_at: string;
};

type RegistryRow = {
  permit_number: string;
};

async function lookupDocAndRegistry(
  docId: string,
  registryId: string
): Promise<
  | { ok: true; doc: DocRow; registry: RegistryRow }
  | { ok: false; response: NextResponse }
> {
  const docResult = await query<DocRow>(
    `select id, permit_number, doc_path, doc_name, doc_mime_type, uploaded_at
     from public.permit_registry_documents
     where id = $1
     limit 1`,
    [docId]
  );
  const doc = docResult.rows[0];
  if (!doc) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Document not found" }, { status: 404 }),
    };
  }

  const regResult = await query<RegistryRow>(
    `select permit_number from public.permit_registry where id = $1 limit 1`,
    [registryId]
  );
  const registry = regResult.rows[0];
  if (!registry) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Permit registry row not found" }, { status: 404 }),
    };
  }

  if (doc.permit_number !== registry.permit_number) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Document does not belong to this permit" }, { status: 403 }),
    };
  }

  return { ok: true, doc, registry };
}

// ---------------------------------------------------------------------------
// GET — serve a specific document file
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await ctx.params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }
    if (!docId || !isValidUuid(docId)) {
      return NextResponse.json({ success: false, message: "Invalid document id" }, { status: 400 });
    }

    const lookup = await lookupDocAndRegistry(docId, id);
    if (!lookup.ok) return lookup.response;

    const { doc } = lookup;
    const filePath = doc.doc_path.trim();

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
        const sameOriginFileUrl = new URL(
          filePath.startsWith("/") ? filePath : `/${filePath}`,
          req.url
        ).toString();
        const proxied = await fetch(sameOriginFileUrl);
        if (proxied.ok) {
          fileBytes = Buffer.from(await proxied.arrayBuffer());
        }
      }
    }

    if (!fileBytes) {
      return NextResponse.json({ success: false, message: "Document file is missing on server" }, { status: 404 });
    }

    const filename = String(doc.doc_name || path.basename(filePath) || "permit-document").replace(/"/g, "");
    const mimeType = doc.doc_mime_type || inferMimeType(filePath);

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

// ---------------------------------------------------------------------------
// DELETE — remove a specific document
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await ctx.params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, message: "Invalid permit registry id" }, { status: 400 });
    }
    if (!docId || !isValidUuid(docId)) {
      return NextResponse.json({ success: false, message: "Invalid document id" }, { status: 400 });
    }

    const lookup = await lookupDocAndRegistry(docId, id);
    if (!lookup.ok) return lookup.response;

    const { doc } = lookup;

    // Try to delete the physical file; ignore ENOENT (already gone)
    const filePath = doc.doc_path.trim();
    if (filePath && !filePath.startsWith("http://") && !filePath.startsWith("https://")) {
      const candidateRoots = [
        path.resolve(process.cwd(), "public"),
        path.resolve(process.cwd()),
        path.resolve(process.cwd(), "..", "public"),
        path.resolve(process.cwd(), ".."),
      ];
      const relNoSlash = filePath.replace(/^\/+/, "");
      for (const root of candidateRoots) {
        const resolved = path.resolve(root, relNoSlash);
        if (!resolved.startsWith(root)) continue;
        try {
          await unlink(resolved);
          break; // deleted from the first matching root — stop
        } catch (err) {
          const code = typeof err === "object" && err !== null && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
          if (code === "ENOENT") continue; // not in this root, try next
          // For any other error, ignore and continue (best-effort delete)
        }
      }
    }

    // Remove the database row
    await query(
      `delete from public.permit_registry_documents where id = $1`,
      [docId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
