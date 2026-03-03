import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export async function createClient(request: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(request)
    const claims = token ? await verifySessionToken(token) : null
    const user = claims?.sub ? { id: claims.sub, role: claims.role, email: claims.email } : null
    return { supabase: null, response: NextResponse.next({ request }), user }
  } catch {
    return { supabase: null, response: NextResponse.next({ request }), user: null }
  }
}
