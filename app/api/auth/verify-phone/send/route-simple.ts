import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber } = body;

    console.log('📱 Simple API: Starting verification for:', { userId, phoneNumber });

    // Validate required fields
    if (!userId || !phoneNumber) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: userId and phoneNumber' 
        },
        { status: 400 }
      );
    }

    // Check development mode
    const isDevelopmentMode = process.env.PINDO_DEVELOPMENT_MODE === 'true';
    const apiKey = process.env.PINDO_API_KEY;
    
    console.log('🔧 Environment status:', {
      isDevelopmentMode,
      hasApiKey: !!apiKey,
      senderName: process.env.PINDO_SENDER_NAME,
    });

    if (isDevelopmentMode) {
      console.log('🔧 Development mode: Using test code 123456');
      
      // In development mode, just return success
      return NextResponse.json({
        success: true,
        message: 'Development mode: Use code 123456 to verify',
        requestId: undefined,
      });
    }

    // Production mode - send real SMS
    if (!apiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Pindo API key not configured' 
        },
        { status: 400 }
      );
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const senderName = process.env.PINDO_SENDER_NAME || 'Pindo';
    const message = `Your Rwanda Water Resources Board verification code is: ${verificationCode}. Valid for 10 minutes. Do not share this code.`;

    console.log('📱 Sending SMS via Pindo API...');

    // Send SMS via Pindo
    const smsResponse = await fetch('https://api.pindo.io/v1/sms/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: phoneNumber,
        text: message,
        sender: senderName,
      }),
    });

    const smsResult = await smsResponse.json();
    console.log('📱 Pindo response:', smsResult);

    if (!smsResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send SMS',
          message: smsResult.message || 'SMS service error',
        },
        { status: 400 }
      );
    }

    // Try to update user verification status (optional - graceful fail)
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await supabase
        .from('users')
        .update({
          phone_verification_code: verificationCode,
          phone_verification_expires_at: expiresAt.toISOString(),
          phone_verification_attempts: 1,
          phone_verification_last_sent: new Date().toISOString(),
        })
        .eq('id', userId);
    } catch (dbError) {
      console.log('⚠️ Database update failed (non-critical):', dbError);
    }

    return NextResponse.json({
      success: true,
      message: 'SMS sent successfully',
      requestId: undefined,
      smsId: smsResult.sms_id,
    });

  } catch (error) {
    console.error('❌ Error in simple send verification:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: 'An unexpected error occurred while sending verification code'
      },
      { status: 500 }
    );
  }
}
