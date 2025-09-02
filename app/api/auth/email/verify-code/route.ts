import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, code, purpose = 'signup' } = await req.json()
    if (!email || !code) {
      return NextResponse.json({ success: false, message: 'Missing email or code' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(url, serviceKey)

    const { data: verified, error } = await supabase
      .rpc('verify_email_code', { p_email: email.toLowerCase(), p_code: code, p_purpose: purpose })

    if (error) {
      console.error('❌ verify-code error:', error)
      return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 })
    }

    return NextResponse.json({ success: !!verified })
  } catch (err) {
    console.error('❌ verify-code server error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


