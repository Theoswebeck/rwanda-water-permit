import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'

export async function POST(_req: NextRequest) {
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)
  return response
}
