import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, accountType, emailCode, ...rest } = body || {}

    if (!email || !password || !accountType || !emailCode) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(url, serviceKey)

    // Server-side email code verification (purpose: signup). This consumes the code when valid.
    const { data: verified, error: verifyError } = await supabase
      .rpc('verify_email_code', { p_email: String(email).toLowerCase(), p_code: String(emailCode), p_purpose: 'signup' })

    if (verifyError || !verified) {
      return NextResponse.json({ success: false, message: 'Invalid or expired email code' }, { status: 400 })
    }

    // Create auth user with confirmed email
    const { data: userCreate, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (userError || !userCreate?.user) {
      console.error('❌ createUser error:', userError)
      return NextResponse.json({ success: false, message: userError?.message || 'Failed to create user' }, { status: 400 })
    }

    const userId = userCreate.user.id

    // Build profile data similar to previous client logic
    const profile: Record<string, any> = {
      id: userId,
      email,
      role: 'applicant',
      status: 'active',
      account_type: accountType,
      applications_count: 0,
      reviews_count: 0,
      inspections_count: 0,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    }

    if (accountType === 'individual') {
      profile.first_name = rest.firstName || 'User'
      profile.last_name = rest.lastName || 'Profile'
      profile.phone = rest.phone
      profile.id_number = rest?.identification?.number || rest.idNumber
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
      return NextResponse.json({ success: false, message: 'Failed to create profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ signup server error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


