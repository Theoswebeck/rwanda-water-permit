import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const u = new URL(supabaseUrl)
    const host = u.hostname || ''
    // Typical: https://<ref>.supabase.co
    const first = host.split('.')[0]
    return first || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // DEBUG: Log the raw body to see exactly what frontend is sending
    console.log('📥 signup raw body:', JSON.stringify(body, null, 2))
    const { email, password, accountType, emailCode, ...rest } = body || {}

    if (!email || !password || !accountType) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    // Validate required fields for organizational signups (DB constraint chk_organizational_fields)
    if (accountType !== 'individual') {
      const missing: string[] = []
      const companyName = String(rest?.companyName ?? '').trim()
      const companyTIN = String(rest?.companyTIN ?? '').trim()
      const companyAddress = String(rest?.companyAddress ?? '').trim()
      const companyPhone = String(rest?.companyPhone ?? '').trim()
      if (!companyName) missing.push('companyName')
      if (!companyTIN) missing.push('companyTIN')
      if (!companyAddress) missing.push('companyAddress')
      if (!companyPhone) missing.push('companyPhone')
      if (missing.length) {
        return NextResponse.json(
          { success: false, message: `Missing required company fields: ${missing.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate ID number for individual signups (must be exactly 16 digits)
    if (accountType === 'individual') {
      const rawId = String(rest?.identification?.number ?? rest?.idNumber ?? '')
      const idDigits = rawId.replace(/\D/g, '')
      if (idDigits.length !== 16 || !/^\d{16}$/.test(idDigits)) {
        return NextResponse.json({ success: false, message: 'invalid ID number' }, { status: 400 })
      }
    }

    // Validate date of birth for individual signups (must be 18+)
    if (accountType === 'individual') {
      const dob = String(rest?.dateOfBirth ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return NextResponse.json({ success: false, message: 'invalid date of birth' }, { status: 400 })
      }
      const dobUtc = new Date(`${dob}T00:00:00.000Z`)
      if (Number.isNaN(dobUtc.getTime())) {
        return NextResponse.json({ success: false, message: 'invalid date of birth' }, { status: 400 })
      }
      const now = new Date()
      const cutoffUtc = new Date(Date.UTC(
        now.getUTCFullYear() - 18,
        now.getUTCMonth(),
        now.getUTCDate()
      ))
      if (dobUtc.getTime() > cutoffUtc.getTime()) {
        return NextResponse.json({ success: false, message: 'must be at least 18 years old' }, { status: 400 })
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ success: false, message: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing' }, { status: 500 })
    }
    const supabase = createClient(url, serviceKey)

    const emailLower = String(email).trim().toLowerCase()
    const supabaseRef = getSupabaseProjectRef(url)
    const supabaseHost = (() => {
      try { return new URL(url).hostname } catch { return null }
    })()

    // Debug: when users report "email already exists" but DB shows none,
    // it's usually because the app is pointed at a different Supabase project/environment.
    console.log('🔎 signup: supabaseHost=', supabaseHost, 'projectRef=', supabaseRef, 'email=', emailLower)

    // Pre-check: if a profile already exists for this email (case-insensitive),
    // fail early with a friendly message instead of creating an auth user then crashing on unique(email).
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id,email')
        .ilike('email', emailLower)
        .maybeSingle()

      if (existing?.id) {
        console.log('🔎 signup: existing profile found for email=', emailLower, 'id=', existing.id)
        return NextResponse.json(
          {
            success: false,
            message:
              'An account with this email already exists. Please log in instead, or delete the existing user before signing up again.',
            ...(process.env.NODE_ENV !== 'production'
              ? { debug: { supabaseHost, supabaseProjectRef: supabaseRef } }
              : {}),
          },
          { status: 409 }
        )
      }
    } catch {
      // ignore pre-check failures; we still have the unique constraint as a backstop
    }

    // Email verification already happened in the dialog - the code was consumed there
    // We trust the frontend only calls this after successful verification

    // Create auth user with confirmed email
    const { data: userCreate, error: userError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'applicant',
        status: 'active',
        account_type: accountType
      }
    })

    if (userError || !userCreate?.user) {
      console.error('❌ createUser error:', userError)
      return NextResponse.json({ success: false, message: userError?.message || 'Failed to create user' }, { status: 400 })
    }

    const userId = userCreate.user.id

    // Build profile data similar to previous client logic
    const profile: Record<string, any> = {
      id: userId,
      email: emailLower,
      role: 'applicant',
      status: 'active',
      account_type: accountType,
      applications_count: 0,
      reviews_count: 0,
      inspections_count: 0,
      // We confirm the Supabase auth email (so it doesn't require link-click verification),
      // but we still track app-level email verification via our Resend OTP flow.
      email_verified: false,
      email_verified_at: null,
    }

    if (accountType === 'individual') {
      profile.first_name = rest.firstName || 'User'
      profile.last_name = rest.lastName || 'Profile'
      profile.date_of_birth = rest.dateOfBirth
      profile.phone = rest.phone
      // Store normalized digits (avoid persisting spaces or separators)
      profile.id_number = String(rest?.identification?.number || rest.idNumber || '').replace(/\D/g, '')
      profile.id_type = 'national_id'
      profile.company_name = undefined
    } else {
      profile.company_name = rest.companyName
      profile.company_tin = rest.companyTIN
      profile.company_address = rest.companyAddress
      profile.company_phone = rest.companyPhone
      profile.id_type = 'tin'
      profile.id_number = rest.companyTIN
      profile.first_name = undefined
      profile.last_name = undefined
    }

    const { error: upsertError } = await supabase
      .from('users')
      .upsert(profile, { onConflict: 'id' })

    if (upsertError) {
      console.error('❌ profile upsert error:', upsertError)
      // best-effort cleanup
      try { await supabase.auth.admin.deleteUser(userId) } catch {}
      const code = (upsertError as any)?.code
      const message = (upsertError as any)?.message || ''
      const details = (upsertError as any)?.details || ''

      // If the email unique constraint is hit, it means there's a stale profile row with this email tied to a different id.
      if (code === '23505' && (message.includes('users_email_key') || details.includes('users_email_key') || details.includes('Key (email)'))) {
        return NextResponse.json(
          {
            success: false,
            message:
              'An account/profile with this email already exists in the system. ' +
              'Please log in instead, or delete the existing row in public.users for this email before signing up again.',
          },
          { status: 409 }
        )
      }

      return NextResponse.json({ success: false, message: 'Failed to create profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId })
  } catch (err) {
    console.error('❌ signup server error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


