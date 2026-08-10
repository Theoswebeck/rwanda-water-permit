import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { query } from '@/lib/db/postgres'
import { hashPassword } from '@/lib/auth/password'
import { requireRole } from '@/lib/auth/require-role'
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/security/password'
import nodemailer from 'nodemailer'

/**
 * Generates a temporary password using a CSPRNG.
 *
 * `Math.random()` is not cryptographically secure and must never be used to
 * mint a credential — `crypto.randomInt` is.
 *
 * Random strings occasionally contain a run like "gfed", which our own policy
 * rejects; retry until the result satisfies the policy the staff member will
 * be held to when they change it.
 */
function generateTempPassword(length = 16): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomPassword(length)
    if (validatePassword(candidate).valid) return candidate
  }
  return randomPassword(length)
}

function randomPassword(length: number): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + special

  const size = Math.max(length, PASSWORD_MIN_LENGTH)
  const pick = (charset: string) => charset[randomInt(charset.length)]

  // Ensure at least one of each type so the temp password satisfies the policy
  const chars: string[] = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)]
  while (chars.length < size) {
    chars.push(pick(all))
  }

  // Fisher-Yates shuffle (an unbiased shuffle, unlike sort() with a random comparator)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

// Valid staff roles (applicants must self-register)
const STAFF_ROLES = ['assessor', 'reviewer', 'verifier', 'inspector', 'admin', 'approver'] as const

export async function POST(req: NextRequest) {
  try {
    // This endpoint mints accounts with any staff role, including `admin`.
    // `middleware.ts` already gates /api/admin/*, but a matcher change or a
    // route move would silently drop that; assert the requirement here too.
    const auth = await requireRole(req, ['admin'])
    if (!auth.ok) return auth.response
    const actorUserId = auth.userId

    const body = await req.json().catch(() => null)
    
    if (!body) {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 })
    }

    const {
      email,
      first_name,
      last_name,
      phone,
      role,
      status = 'active',
      account_type = 'individual',
      company_name,
    } = body

    // Validate required fields
    if (!email) {
      return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 })
    }

    if (!role) {
      return NextResponse.json({ success: false, message: 'Role is required' }, { status: 400 })
    }

    // Block applicant role - they must self-register
    if (role === 'applicant') {
      return NextResponse.json({ 
        success: false, 
        message: 'Applicants must register themselves. Admin can only create staff accounts (assessor, reviewer, verifier, inspector, admin, approver).' 
      }, { status: 400 })
    }

    // Validate role is a valid staff role
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ 
        success: false, 
        message: `Invalid role. Must be one of: ${STAFF_ROLES.join(', ')}` 
      }, { status: 400 })
    }

    const emailLower = String(email).trim().toLowerCase()

    // Check if user already exists
    const existingRes = await query<{ id: string; email: string }>(
      `select id, email from public.users where lower(email) = lower($1) limit 1`,
      [emailLower]
    )
    const existingUser = existingRes.rows[0]
    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'A user with this email already exists.'
      }, { status: 409 })
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)
    
    console.log('📝 Creating staff user:', emailLower, 'with role:', role)

    const insertRes = await query<{ id: string }>(
      `
      insert into public.users (
        email, password_hash, role, status, account_type,
        first_name, last_name, phone, company_name,
        applications_count, reviews_count, inspections_count,
        profile_completed, must_change_password, account_confirmed, confirmed_at,
        created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        0, 0, 0,
        false, true, true, now(),
        now(), now()
      )
      returning id
      `,
      [
        emailLower,
        passwordHash,
        role,
        status,
        account_type,
        first_name || 'Staff',
        last_name || 'User',
        phone || null,
        company_name || null,
      ]
    )
    const userId = insertRes.rows[0]?.id
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Failed to create user' }, { status: 500 })
    }
    console.log('✅ Auth user created:', userId)

    // Log the user creation action
    try {
      await query(
        `
        insert into public.audit_logs (
          action, entity_type, table_name, record_id, user_id, new_values, description, severity, status, request_id, created_at
        ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, now())
        `,
        [
          'user.created',
          'user',
          'users',
          userId,
          actorUserId,
          JSON.stringify({ email: emailLower, role, status, account_type }),
          `Created new staff account for ${emailLower} with role ${role}`,
          'info',
          'success',
          crypto.randomUUID(),
        ]
      )
      console.log('📝 Audit log created for user creation')
    } catch (auditErr) {
      console.warn('⚠️ Failed to create audit log:', auditErr)
    }

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://waterpermit.rwb.rw/'
    const isDev = process.env.NODE_ENV !== 'production'

    let emailSent = false
    let emailError: string | null = null

    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    if (!smtpUser || !smtpPass) {
      emailError = 'SMTP not configured'
      console.warn('⚠️ SMTP_USER/SMTP_PASS not configured, skipping invite email')
    } else {
      const displayName = first_name ? `${first_name}` : 'Staff Member'
      const rolePretty = role.charAt(0).toUpperCase() + role.slice(1)
      const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'

      const html = `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:30px">
            <h1 style="color:#1f2937;margin:0">${orgName}</h1>
            <h2 style="color:#4b5563;margin:10px 0">Staff Account Created</h2>
          </div>
          <p style="font-size:16px;color:#374151">Hello ${displayName},</p>
          <p style="font-size:16px;color:#374151">
            An account has been created for you on the Rwanda Water Permit Portal as a <strong>${rolePretty}</strong>.
          </p>
          <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:20px 0;border:2px solid #e5e7eb">
            <p style="margin:0 0 10px 0;font-size:14px;color:#6b7280"><strong>Your Login Credentials:</strong></p>
            <p style="margin:5px 0;font-size:16px;color:#1f2937"><strong>Email:</strong> ${emailLower}</p>
            <p style="margin:5px 0;font-size:16px;color:#1f2937"><strong>Temporary Password:</strong></p>
            <div style="font-size:18px;font-weight:700;letter-spacing:2px;background:#fff;color:#1f2937;padding:15px;border-radius:8px;text-align:center;font-family:monospace;margin-top:10px">
              ${tempPassword}
            </div>
          </div>
          <div style="text-align:center;margin:30px 0">
            <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
              Login to Portal
            </a>
          </div>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:15px;margin:20px 0">
            <p style="margin:0;font-size:14px;color:#92400e">
              ⚠️ <strong>Important:</strong> You will be required to change your password on first login. Please choose a strong, unique password.
            </p>
          </div>
          <p style="color:#6b7280;font-size:14px">
            If you did not expect this account, please contact the RWB administrator.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0">
          <p style="color:#9ca3af;font-size:12px;text-align:center">${orgName} - Water Permit Application System</p>
        </div>`

      console.log('📤 Sending invite email to:', emailLower)
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
          to: emailLower,
          subject: `Your ${orgName} Staff Account`,
          html,
        })
        emailSent = true
        console.log('✅ Invite email sent successfully')
      } catch (fetchErr) {
        emailError = String(fetchErr)
        console.error('❌ SMTP send failed:', fetchErr)
      }
    }

    // Return success with email status
    return NextResponse.json({
      success: true,
      userId,
      email: emailLower,
      role,
      emailSent,
      emailError: emailError || undefined,
      // In dev mode, include the temp password for testing
      ...(isDev ? { tempPassword } : {}),
      message: emailSent 
        ? 'Staff account created and invite email sent successfully!' 
        : 'Staff account created. Email could not be sent - please share credentials manually.',
    })

  } catch (err) {
    console.error('❌ Admin create user error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, message: msg || 'Server error' }, { status: 500 })
  }
}

