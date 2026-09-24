import { NextRequest, NextResponse } from "next/server"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { query } from "@/lib/db/postgres"
import { requireRole } from "@/lib/auth/require-role"
import { SITE_CONTENT_KEYS, mergeSiteContent, type SiteContent } from "@/lib/site-content"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UPLOADABLE = new Set<keyof SiteContent>(["guidelines_url", "user_manual_url"])

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

async function upsert(key: string, value: unknown, actor: string) {
  await query(
    `insert into site_content (key, value, updated_at, updated_by)
     values ($1, $2::jsonb, now(), $3)
     on conflict (key) do update
       set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), actor]
  )
}

/** GET /api/admin/site-content — current values for the admin Content tab. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if (!auth.ok) return auth.response

  const { rows } = await query(`select key, value from site_content`)
  return NextResponse.json(mergeSiteContent(rows as any))
}

/**
 * POST /api/admin/site-content — save content.
 *
 * multipart/form-data with `key` + `file` replaces a PDF (guidelines or user
 * manual) and points the key at the uploaded copy; a JSON body saves the other
 * values. One route because both are the same operation to the caller: write a
 * key of site content.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if (!auth.ok) return auth.response
  const actor = auth.email || auth.userId

  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData()
      const key = String(form.get("key") || "")
      const file = form.get("file")
      if (!UPLOADABLE.has(key as keyof SiteContent)) {
        return NextResponse.json({ error: "Unknown document." }, { status: 400 })
      }
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400 })
      }
      if (file.type && file.type !== "application/pdf") {
        return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 })
      }

      const relDir = path.join("uploads", "site")
      const absDir = path.join(process.cwd(), "public", relDir)
      await mkdir(absDir, { recursive: true })
      // Timestamped so a replacement never serves a cached copy of the old file.
      const safeName = `${safeSegment(key)}-${Date.now()}.pdf`
      await writeFile(path.join(absDir, safeName), Buffer.from(await file.arrayBuffer()))
      const relPath = `/${path.join(relDir, safeName).replaceAll(path.sep, "/")}`

      await upsert(key, relPath, actor)
      return NextResponse.json({ ok: true, key, value: relPath })
    }

    const body = await req.json()
    const updates = body && typeof body === "object" ? body : {}
    const keys = Object.keys(updates).filter((k) => SITE_CONTENT_KEYS.includes(k as keyof SiteContent))
    if (keys.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 })
    }
    for (const key of keys) await upsert(key, updates[key], actor)

    const { rows } = await query(`select key, value from site_content`)
    return NextResponse.json(mergeSiteContent(rows as any))
  } catch (e) {
    console.error("[admin/site-content] save failed:", e)
    return NextResponse.json({ error: "Could not save content." }, { status: 500 })
  }
}
