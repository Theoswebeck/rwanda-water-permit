import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { query } from '@/lib/db/postgres'
import { setDevEmailCode } from '../dev-store'
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  emailKey,
  getClientIp,
  tooManyRequests,
} from '@/lib/security/rate-limit'
import nodemailer from 'nodemailer'

// Util: basic email validation
const isValidEmail = (email: string) => /[^@\s]+@[^@\s]+\.[^@\s]+/.test(email)

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = 'signup' } = await req.json()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 })
    }

    // SECURITY: this endpoint sends mail on demand and is the entry point of
    // the password-reset flow. Without a limit it can be used to flood an
    // inbox or to churn through reset codes.
    const ipCheck = checkRateLimit(
      `emailcode:ip:${getClientIp(req)}`,
      AUTH_RATE_LIMITS.passwordResetRequestPerIp
    )
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck, 'Too many code requests from this network. Please try again later.')
    }

    const accountCheck = checkRateLimit(
      `emailcode:account:${String(purpose)}:${emailKey(email)}`,
      AUTH_RATE_LIMITS.passwordResetRequestPerAccount
    )
    if (!accountCheck.allowed) {
      return tooManyRequests(
        accountCheck,
        'A code was already sent recently. Please check your inbox (and spam) before requesting another.'
      )
    }

    const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'

    // Create a new verification code (TTL 15 minutes).
    // SECURITY: `Math.random()` is a predictable PRNG — an attacker who sees
    // one code can derive others. A code that grants a password reset must
    // come from a CSPRNG.
    const code = String(randomInt(100000, 1000000))
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await query(
      `
      update public.email_verification_codes
      set consumed_at = now(), updated_at = now()
      where lower(email) = lower($1) and purpose = $2 and consumed_at is null
      `,
      [email.toLowerCase(), purpose]
    ).catch(() => undefined)
    try {
      await query(
        `
        insert into public.email_verification_codes (email, code, purpose, expires_at, created_at, updated_at)
        values ($1, $2, $3, $4, now(), now())
        `,
        [email.toLowerCase(), code, purpose, expires]
      )
    } catch (dbErr) {
      console.error('❌ Failed to create verification code in PostgreSQL:', dbErr)
      if (isDev) {
        setDevEmailCode({ email, purpose, code, ttlMinutes: 15 })
      } else {
        return NextResponse.json({ success: false, message: 'Could not create verification code' }, { status: 500 })
      }
    }

    if (isDev) {
      console.log(`✉️ Dev email code for ${email}: ${code}`)
    }

    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpUser || !smtpPass) {
      if (isDev) {
        return NextResponse.json({
          success: true,
          message: 'SMTP not configured. Use dev code printed to server terminal.',
          delivered: false,
          deliveryProvider: 'none',
          devCode: code,
        })
      }
      return NextResponse.json({ success: false, message: 'Email provider not configured. Set SMTP_USER and SMTP_PASS.' }, { status: 500 })
    }

    const isPasswordReset = String(purpose) === 'password_reset'
    const subject = isPasswordReset
      ? 'Your password reset code - Rwanda Water Resources Board'
      : 'Your verification code - Rwanda Water Resources Board'
    const heading = isPasswordReset ? 'Password Reset' : 'Email Verification'
    const bodyText = isPasswordReset
      ? 'Use this code to reset your password:'
      : 'Use this code to verify your email address:'
    const ignoreText = isPasswordReset
      ? "If you didn't request a password reset, you can safely ignore this email."
      : "If you didn't request this verification, you can safely ignore this email."

    const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
    const html = `
      <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <div style="text-align:center;margin-bottom:30px">
          <h1 style="color:#1f2937;margin:0">${orgName}</h1>
          <h2 style="color:#4b5563;margin:10px 0">${heading}</h2>
        </div>
        <p style="font-size:16px;color:#374151">${bodyText}</p>
        <div style="text-align:center;margin:30px 0">
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;background:#f3f4f6;color:#1f2937;padding:20px;border-radius:12px;display:inline-block;border:2px solid #e5e7eb">${code}</div>
        </div>
        <p style="color:#6b7280;font-size:14px;margin:20px 0">This code expires in 15 minutes.</p>
        <p style="color:#6b7280;font-size:14px">${ignoreText}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0">
        <p style="color:#9ca3af;font-size:12px;text-align:center">${orgName} - Water Permit Application System</p>
      </div>`

    console.log(`📤 Sending verification email via SMTP...`)

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      })
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || smtpUser,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
        to: email,
        subject,
        html,
      })

      return NextResponse.json({
        success: true,
        message: 'Verification email sent successfully!',
        delivered: true,
        deliveryProvider: 'smtp',
        devCode: isDev ? code : undefined,
      })
    } catch (emailErr) {
      console.error('❌ SMTP send failed:', emailErr)
      return NextResponse.json({
        success: true,
        message: `Email sending failed but code created. ${isDev ? 'Use devCode below.' : 'Try resending.'}`,
        delivered: false,
        deliveryProvider: 'smtp',
        devCode: isDev ? code : undefined,
      })
    }
  } catch (err) {
    console.error('❌ send-code error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
