import { NextResponse } from 'next/server'

function safeHostname(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

function getProjectRefFromHost(hostname: string | null): string | null {
  if (!hostname) return null
  const first = hostname.split('.')[0]
  return first || null
}

export async function GET() {
  const hostname = safeHostname(process.env.NEXT_PUBLIC_APP_URL)
  const projectRef = getProjectRefFromHost(hostname)
  return NextResponse.json({
    mode: 'self-hosted',
    appHostname: hostname,
    appRef: projectRef,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  })
}




