import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Util: basic email validation
const isValidEmail = (email: string) => /[^@\s]+@[^@\s]+\.[^@\s]+/.test(email)

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = 'signup' } = await req.json()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(url, serviceKey)

    // Create a new verification code (TTL 15 minutes)
    let code: string | undefined
    try {
      const { data: rows, error: codeError } = await supabase
        .rpc('create_email_verification_code', { p_email: email.toLowerCase(), p_purpose: purpose, p_ttl_minutes: 15 })

      if (codeError) throw codeError
      const codeRow: any = Array.isArray(rows) ? rows[0] : rows
      code = codeRow?.code || codeRow?.out_code
    } catch (rpcErr) {
      console.warn('⚠️ RPC failed, falling back to manual insert:', rpcErr)
      // Fallback: generate and insert directly
      const fallback = String(Math.floor(100000 + Math.random() * 900000))
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      const { error: insertErr } = await supabase
        .from('email_verification_codes')
        .insert({ email: email.toLowerCase(), code: fallback, purpose, expires_at: expires })
      if (insertErr) {
        console.error('❌ Fallback insert failed:', insertErr)
        return NextResponse.json({ success: false, message: 'Could not create verification code' }, { status: 500 })
      }
      code = fallback
    }

    // In development, log the code and short-circuit
    if (process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true') {
      console.log(`✉️ Dev email code for ${email}: ${code}`)
      return NextResponse.json({ success: true, message: 'Dev mode: code generated', devCode: code })
    }

    // Send the email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM || 'noreply@rwb.gov.rw'
    if (resendKey) {
      const subject = 'Your verification code'
      const html = `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6">
          <h2>Verify your email</h2>
          <p>Use this code to verify your email address. It expires in 15 minutes.</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f4f6f8;padding:12px 16px;border-radius:8px;display:inline-block">${code}</div>
          <p style="color:#6b7280">If you didn't request this, you can ignore this email.</p>
        </div>`

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from: fromEmail, to: email, subject, html })
      })

      if (!resp.ok) {
        const msg = await resp.text()
        console.warn('⚠️ Resend error:', msg)
        // Still return success because code was created; user can use code if they receive later or request dev
      }
      return NextResponse.json({ success: true, message: 'Verification email sent' })
    }

    // No provider configured; fall back to dev behavior requiring EMAIL_DEV_MODE
    return NextResponse.json({ success: false, message: 'Email provider not configured. Set RESEND_API_KEY.' }, { status: 500 })
  } catch (err) {
    console.error('❌ send-code error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


