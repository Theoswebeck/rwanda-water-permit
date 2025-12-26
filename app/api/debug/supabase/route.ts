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
  // Never expose env details in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hostname = safeHostname(supabaseUrl)
  const projectRef = getProjectRefFromHost(hostname)

  return NextResponse.json({
    supabaseHostname: hostname,
    supabaseProjectRef: projectRef,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}




