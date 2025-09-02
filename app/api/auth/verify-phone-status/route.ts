import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber } = body;

    console.log('🔍 Checking phone verification status for:', phoneNumber);

    if (!phoneNumber) {
      return NextResponse.json(
        { 
          success: false, 
          verified: false,
          error: 'Phone number is required' 
        },
        { status: 400 }
      );
    }

    // Check if we have proper Supabase configuration
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey && serviceRoleKey !== 'your_supabase_service_role_key_here' 
        ? serviceRoleKey 
        : anonKey!
    );

    // Check if phone number has been verified
    const { data: verification, error } = await supabase
      .from('phone_verification_logs')
      .select('status, expires_at, sent_at')
      .eq('phone_number', phoneNumber)
      .eq('status', 'verified')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !verification) {
      console.log('❌ No verified record found for phone:', phoneNumber);
      return NextResponse.json({
        success: true,
        verified: false,
        message: 'Phone number has not been verified'
      });
    }

    // Check if verification is still valid (within 24 hours for security)
    const verifiedAt = new Date(verification.sent_at);
    const now = new Date();
    const hoursSinceVerification = (now.getTime() - verifiedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceVerification > 24) {
      console.log('⏰ Phone verification expired for:', phoneNumber);
      return NextResponse.json({
        success: true,
        verified: false,
        message: 'Phone verification has expired. Please verify again.'
      });
    }

    console.log('✅ Phone verification confirmed for:', phoneNumber);
    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Phone number is verified',
      verifiedAt: verification.sent_at
    });

  } catch (error) {
    console.error('❌ Error checking phone verification status:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        verified: false,
        error: 'Internal server error',
        message: 'Failed to check phone verification status'
      },
      { status: 500 }
    );
  }
}
