import { NextRequest, NextResponse } from 'next/server'

// Debug endpoint.
// IMPORTANT: In Next.js dev mode, writing to files inside the repo can trigger the watcher
// and cause infinite rebuild loops. So this endpoint is a NO-OP unless explicitly enabled.
export async function POST(req: NextRequest) {
  try {
    // Drain body (best effort) to avoid client-side parse errors
    try { await req.json() } catch {}

    const enabled = process.env.DEBUG_LOGGING_ENABLED === 'true'
    if (!enabled) {
      return NextResponse.json({ ok: true, enabled: false })
    }

    // If you enable this, prefer writing outside the repo / watcher scope.
    return NextResponse.json({ ok: true, enabled: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}


