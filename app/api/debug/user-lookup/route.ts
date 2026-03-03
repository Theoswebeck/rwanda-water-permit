import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'

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

  const ilikeRes = await query<{ id: string; email: string }>(
    `select id, email from public.users where lower(email) = lower($1)`,
    [email]
  )
  const eqRes = await query<{ id: string; email: string }>(
    `select id, email from public.users where email = $1`,
    [email]
  )

  return NextResponse.json({
    email,
    ilike: {
      count: ilikeRes.rows.length,
      rows: ilikeRes.rows,
      error: null,
    },
    eq: {
      count: eqRes.rows.length,
      rows: eqRes.rows,
      error: null,
    },
  })
}




