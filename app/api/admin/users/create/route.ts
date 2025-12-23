import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Generate a secure random password
function generateTempPassword(length = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + special
  
  // Ensure at least one of each type
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

// Valid staff roles (applicants must self-register)
const STAFF_ROLES = ['assessor', 'inspector', 'admin', 'approver'] as const

export async function POST(req: NextRequest) {
  try {
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
        message: 'Applicants must register themselves. Admin can only create staff accounts (reviewer, inspector, admin, approver).' 
      }, { status: 400 })
    }

    // Validate role is a valid staff role
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ 
        success: false, 
        message: `Invalid role. Must be one of: ${STAFF_ROLES.join(', ')}` 
      }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceKey) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, serviceKey)
    const emailLower = String(email).trim().toLowerCase()

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', emailLower)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'A user with this email already exists.'
      }, { status: 409 })
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()
    
    console.log('📝 Creating staff user:', emailLower, 'with role:', role)

    // Create auth user with confirmed email
    const { data: userCreate, error: userError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role,
        status,
        account_type,
        must_change_password: true,
        first_name: first_name || 'Staff',
        last_name: last_name || 'User',
      }
    })

    if (userError || !userCreate?.user) {
      console.error('❌ createUser error:', userError)
      return NextResponse.json({ 
        success: false, 
        message: userError?.message || 'Failed to create auth user' 
      }, { status: 400 })
    }

    const userId = userCreate.user.id
    console.log('✅ Auth user created:', userId)

    // Create profile in public.users
    const profile = {
      id: userId,
      email: emailLower,
      role,
      status,
      account_type,
      first_name: first_name || 'Staff',
      last_name: last_name || 'User',
      phone: phone || null,
      company_name: company_name || null,
      applications_count: 0,
      reviews_count: 0,
      inspections_count: 0,
      profile_completed: false,
      must_change_password: true,
      account_confirmed: false,
      confirmed_at: null,
    }

    const { error: profileError } = await supabase
      .from('users')
      .upsert(profile, { onConflict: 'id' })

    if (profileError) {
      console.error('❌ Profile upsert error:', profileError)
      // Best-effort cleanup of auth user
      try { await supabase.auth.admin.deleteUser(userId) } catch {}
      return NextResponse.json({ 
        success: false, 
        message: `Failed to create user profile: ${profileError.message}` 
      }, { status: 500 })
    }

    console.log('✅ User profile created')

    // Send invite email via Resend
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM || 'nouru@menlohq.com'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'
    const loginUrl = `${appUrl}/login`
    const isDev = process.env.NODE_ENV !== 'production'

    let emailSent = false
    let emailError: string | null = null

    if (resendKey) {
      const displayName = first_name ? `${first_name}` : 'Staff Member'
      const rolePretty = role.charAt(0).toUpperCase() + role.slice(1)
      
      const html = `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:30px">
            <h1 style="color:#1f2937;margin:0">Rwanda Water Board</h1>
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
          <p style="color:#9ca3af;font-size:12px;text-align:center">
            Rwanda Water Board - Water Permit Application System
          </p>
        </div>`

      console.log('📤 Sending invite email to:', emailLower)

      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: emailLower,
            subject: 'Your Rwanda Water Board Staff Account',
            html,
          }),
        })

        const responseText = await resp.text()
        console.log('📬 Resend response:', resp.status, responseText)

        if (resp.ok) {
          emailSent = true
          console.log('✅ Invite email sent successfully')
        } else {
          emailError = responseText
          console.error('❌ Resend API error:', responseText)
        }
      } catch (fetchErr) {
        emailError = String(fetchErr)
        console.error('❌ Resend fetch failed:', fetchErr)
      }
    } else {
      emailError = 'RESEND_API_KEY not configured'
      console.warn('⚠️ RESEND_API_KEY not configured, skipping email')
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

