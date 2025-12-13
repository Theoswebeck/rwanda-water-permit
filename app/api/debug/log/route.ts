import { NextRequest, NextResponse } from 'next/server'
import { appendFile } from 'node:fs/promises'

// Debug endpoint to write NDJSON logs to the local debug log file.
// NOTE: Keep payloads free of secrets/PII.
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const line = JSON.stringify(payload) + '\n'
    await appendFile(process.cwd() + '/.cursor/debug.log', line)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}


