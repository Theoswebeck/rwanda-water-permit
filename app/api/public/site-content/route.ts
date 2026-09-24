import { NextResponse } from "next/server"
import { query } from "@/lib/db/postgres"
import { SITE_CONTENT_DEFAULTS, mergeSiteContent } from "@/lib/site-content"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/public/site-content — guideline/manual links and contact details for
 * the header, footer and /contact page. World-readable by design: it is the
 * same information those pages already print to anonymous visitors.
 */
export async function GET() {
  try {
    const { rows } = await query(`select key, value from site_content`)
    return NextResponse.json(mergeSiteContent(rows as any))
  } catch (e) {
    // Never break the chrome over a content lookup — fall back to the defaults.
    console.error("[public/site-content] load failed:", e)
    return NextResponse.json(SITE_CONTENT_DEFAULTS)
  }
}
