import { NextResponse } from 'next/server'

export async function GET() {
  const flagEnabled = process.env.RRA_VERIFICATION_ENABLED === 'true'
  const hasCredentials =
    !!process.env.RRA_BASE_URL?.trim() &&
    !!process.env.RRA_USERNAME?.trim() &&
    !!process.env.RRA_PASSWORD?.trim()

  const enabled = flagEnabled && hasCredentials

  if (flagEnabled && !hasCredentials) {
    console.warn('⚠️ RRA_VERIFICATION_ENABLED=true but RRA credentials (RRA_BASE_URL, RRA_USERNAME, RRA_PASSWORD) are not fully configured')
  }

  return NextResponse.json({ enabled })
}
