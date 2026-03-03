import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  // OAuth callback is retired in self-hosted auth mode.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
