import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyDevEmailCode } from '../dev-store'

export async function POST(req: NextRequest) {
  try {
    const { email, code, purpose = 'signup', userId } = await req.json()
    if (!email || !code) {
      return NextResponse.json({ success: false, message: 'Missing email or code' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(url, serviceKey)

    const { data: verified, error } = await supabase
      .rpc('verify_email_code', { p_email: email.toLowerCase(), p_code: code, p_purpose: purpose })

    if (error) {
      console.error('❌ verify-code error:', error)
      // Dev fallback when RPC permissions aren't set and service role key is missing
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && isDev) {
        const dev = verifyDevEmailCode({ email, purpose, code })
        if (dev.ok) {
          return NextResponse.json({ success: true, devFallback: true })
        }
        return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 400 })
      }
      return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 })
    }

    if (!verified) {
      return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 400 })
    }

    // Mark profile email_verified (best effort). If service role is configured, also confirm in auth.
    // Only do this for signup/email verification purposes, not other OTP purposes like password reset.
    try {
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      const shouldMarkVerified = purpose === 'signup' || purpose === 'email_verification'
      if (adminKey && shouldMarkVerified) {
        const admin = createClient(url, adminKey)

        // Update public.users (service role bypasses RLS)
        await admin
          .from('users')
          .update({ email_verified: true, email_verified_at: new Date().toISOString() })
          .eq('email', email.toLowerCase())

        // Confirm email in auth so login doesn't block on "Email not confirmed"
        if (userId) {
          await admin.auth.admin.updateUserById(userId, { email_confirm: true })
        } else {
          // Fallback: no userId provided; best-effort update profile only
        }
      }
    } catch {
      // Non-fatal: code verification succeeded, but auth/profile confirmation may require service role key
      console.warn('⚠️ Post-verify updates skipped/failed')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ verify-code server error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


