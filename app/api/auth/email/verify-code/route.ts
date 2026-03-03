import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { verifyDevEmailCode } from '../dev-store'

export async function POST(req: NextRequest) {
  try {
    const { email, code, purpose = 'signup', userId } = await req.json()
    if (!email || !code) {
      return NextResponse.json({ success: false, message: 'Missing email or code' }, { status: 400 })
    }

    const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'
    let verified = false
    const row = await query<{ id: string; expires_at: string; consumed_at: string | null }>(
      `
      select id, expires_at, consumed_at
      from public.email_verification_codes
      where lower(email) = lower($1)
        and purpose = $2
        and code = $3
      order by created_at desc
      limit 1
      `,
      [email.toLowerCase(), purpose, code]
    )
    const rec = row.rows[0]
    const isValid =
      !!rec?.id &&
      !rec.consumed_at &&
      new Date(String(rec.expires_at)).getTime() > Date.now()
    if (isValid) {
      verified = true
      await query(
        `
        update public.email_verification_codes
        set consumed_at = now(), updated_at = now()
        where id = $1
        `,
        [rec.id]
      ).catch(() => undefined)
    }

    if (!verified && isDev) {
      const dev = verifyDevEmailCode({ email, purpose, code })
      if (dev.ok) verified = true
    }

    if (!verified) {
      return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 400 })
    }

    // Mark profile email_verified (best effort). If service role is configured, also confirm in auth.
    // Only do this for signup/email verification purposes, not other OTP purposes like password reset.
    try {
      const shouldMarkVerified = purpose === 'signup' || purpose === 'email_verification'
      if (shouldMarkVerified) {
        if (userId) {
          await query(
            `
            update public.users
            set email_verified = true, email_verified_at = now(), updated_at = now()
            where id = $1
            `,
            [userId]
          )
        } else {
          await query(
            `
            update public.users
            set email_verified = true, email_verified_at = now(), updated_at = now()
            where lower(email) = lower($1)
            `,
            [email.toLowerCase()]
          )
        }
      }
    } catch {
      console.warn('⚠️ Post-verify updates skipped/failed')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ verify-code server error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


