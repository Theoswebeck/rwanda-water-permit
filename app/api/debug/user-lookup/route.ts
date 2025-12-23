import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getEmailParam(req: NextRequest): string | null {
  const raw = req.nextUrl.searchParams.get('email')
  if (!raw) return null
  const email = String(raw).trim().toLowerCase()
  if (!email) return null
  return email
}

export async function GET(req: NextRequest) {
  // Never expose env details / user lookups in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const email = getEmailParam(req)
  if (!email) {
    return NextResponse.json({ message: 'Missing email query param' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ message: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })
  }

  const supabase = createClient(url, serviceKey)

  // Replicate the signup pre-check behavior (ilike) and also run a strict eq check.
  const ilikeRes = await supabase.from('users').select('id,email', { count: 'exact' }).ilike('email', email)
  const eqRes = await supabase.from('users').select('id,email', { count: 'exact' }).eq('email', email)

  return NextResponse.json({
    email,
    ilike: {
      count: ilikeRes.count ?? null,
      rows: ilikeRes.data ?? null,
      error: ilikeRes.error ? { code: ilikeRes.error.code, message: ilikeRes.error.message, details: (ilikeRes.error as any).details } : null,
    },
    eq: {
      count: eqRes.count ?? null,
      rows: eqRes.data ?? null,
      error: eqRes.error ? { code: eqRes.error.code, message: eqRes.error.message, details: (eqRes.error as any).details } : null,
    },
  })
}


