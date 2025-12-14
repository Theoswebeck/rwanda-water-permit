import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setDevEmailCode } from '../dev-store'

// Util: basic email validation
const isValidEmail = (email: string) => /[^@\s]+@[^@\s]+\.[^@\s]+/.test(email)

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = 'signup' } = await req.json()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseKey = adminKey || anonKey

    if (!supabaseKey) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: missing Supabase keys (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)' },
        { status: 500 }
      )
    }

    if (!adminKey && isDev) {
      console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is missing; using NEXT_PUBLIC_SUPABASE_ANON_KEY for email code generation.')
    }

    const supabase = createClient(url, supabaseKey)

    // Create a new verification code (TTL 15 minutes)
    let code: string | undefined
    try {
      const { data: rows, error: codeError } = await supabase
        .rpc('create_email_verification_code', { p_email: email.toLowerCase(), p_purpose: purpose, p_ttl_minutes: 15 })

      if (codeError) throw codeError
      const codeRow: any = Array.isArray(rows) ? rows[0] : rows
      code = codeRow?.code || codeRow?.out_code
    } catch (rpcErr) {
      console.warn('⚠️ Email code RPC failed:', rpcErr)

      // Dev fallback when service role is missing (RLS blocks direct inserts):
      // generate a real code, keep it in a server-side dev store, and print it to the terminal.
      if (!adminKey && isDev) {
        const fallback = String(Math.floor(100000 + Math.random() * 900000))
        setDevEmailCode({ email, purpose, code: fallback, ttlMinutes: 15 })
        code = fallback
      } else {
        // Production / service-role path: try direct insert (service role bypasses RLS)
        console.warn('⚠️ Falling back to manual insert (requires service role)...')
        const fallback = String(Math.floor(100000 + Math.random() * 900000))
        const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        const { error: insertErr } = await supabase
          .from('email_verification_codes')
          .insert({ email: email.toLowerCase(), code: fallback, purpose, expires_at: expires })
        if (insertErr) {
          console.error('❌ Fallback insert failed:', insertErr)
          return NextResponse.json(
            {
              success: false,
              message: 'Could not create verification code. Configure SUPABASE_SERVICE_ROLE_KEY or grant RPC access for anon/authenticated.',
            },
            { status: 500 }
          )
        }
        code = fallback
      }
    }

    if (isDev) {
      console.log(`✉️ Dev email code for ${email}: ${code}`)
    }

    // Send the email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev' // Use Resend's onboarding domain
    
    if (resendKey) {
      const subject = 'Your verification code - Rwanda Water Board'
      const html = `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:30px">
            <h1 style="color:#1f2937;margin:0">Rwanda Water Board</h1>
            <h2 style="color:#4b5563;margin:10px 0">Email Verification</h2>
          </div>
          <p style="font-size:16px;color:#374151">Use this code to verify your email address:</p>
          <div style="text-align:center;margin:30px 0">
            <div style="font-size:36px;font-weight:700;letter-spacing:8px;background:#f3f4f6;color:#1f2937;padding:20px;border-radius:12px;display:inline-block;border:2px solid #e5e7eb">${code}</div>
          </div>
          <p style="color:#6b7280;font-size:14px;margin:20px 0">This code expires in 15 minutes.</p>
          <p style="color:#6b7280;font-size:14px">If you didn't request this verification, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0">
          <p style="color:#9ca3af;font-size:12px;text-align:center">Rwanda Water Board - Water Permit Application System</p>
        </div>`

      console.log(`📤 Sending email via Resend API...`)
      
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          from: fromEmail, 
          to: email, 
          subject, 
          html 
        })
      })

      const responseText = await resp.text()
      console.log(`📬 Resend response: status=${resp.status}, body=${responseText}`)

      if (!resp.ok) {
        console.error('❌ Resend API error:', responseText)
        // Still return success because code was created; user can use devCode
        return NextResponse.json({ 
          success: true, 
          message: `Email sending failed but code created. ${isDev ? 'Use devCode below.' : 'Try resending.'}`, 
          delivered: false,
          deliveryProvider: 'resend',
          devCode: isDev ? code : undefined,
          debug: isDev ? { resendError: responseText } : undefined
        })
      }
      
      // Email sent successfully
      return NextResponse.json({ 
        success: true, 
        message: 'Verification email sent successfully!', 
        delivered: true,
        deliveryProvider: 'resend',
        devCode: isDev ? code : undefined 
      })
    }

    // No provider configured
    if (isDev) {
      return NextResponse.json({
        success: true,
        message: 'Email was not sent because RESEND_API_KEY is not configured. Use the dev code (printed to the server terminal) or set RESEND_API_KEY and resend.',
        delivered: false,
        deliveryProvider: 'none',
        devCode: code,
      })
    }
    return NextResponse.json({ success: false, message: 'Email provider not configured. Set RESEND_API_KEY.' }, { status: 500 })
  } catch (err) {
    console.error('❌ send-code error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


