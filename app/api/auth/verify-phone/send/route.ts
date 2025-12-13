import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber } = body;

    // Avoid logging PII (phone number) in server logs
    console.log('📱 Simple API: Starting verification for:', { hasUserId: !!userId, phoneSuffix: String(phoneNumber || '').slice(-3) });

    // Validate required fields - phoneNumber is required, userId is optional for registration
    if (!phoneNumber) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required field: phoneNumber' 
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
    const message = `Your Rwanda Water Board verification code is: ${verificationCode}. Valid for 10 minutes. Do not share this code.`;

    console.log('📱 Sending SMS via Pindo API...');

    // Send SMS via Pindo
    let smsResponse: Response | null = null;
    let smsResult: any = null;
    try {
      smsResponse = await fetch('https://api.pindo.io/v1/sms/', {
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
      smsResult = await smsResponse.json().catch(() => null);
      console.log('📱 Pindo response received');
    } catch (networkError) {
      // In local/dev environments, Pindo may be unreachable (no network). Fall back to dev code.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ Pindo unreachable in dev; falling back to test code 123456');
        return NextResponse.json({
          success: true,
          message: 'Development fallback: Use code 123456 to verify',
          requestId: undefined,
        });
      }
      throw networkError;
    }

    if (!smsResponse.ok) {
      console.error('❌ Pindo API Error:', smsResult);
      
      // Check for specific sender ID error
      if (smsResult.message && smsResult.message.includes('Unknown sender id')) {
        console.warn('⚠️ HINT: The Sender ID (PINDO_SENDER_NAME) is not registered. Try using "Pindo" for testing.');
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send SMS',
          message: smsResult.message || 'SMS service error',
        },
        { status: 400 }
      );
    }

    // Store verification code in temporary table (for registration flow)
    try {
      // Check if we have proper Supabase configuration
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!serviceRoleKey || serviceRoleKey === 'your_supabase_service_role_key_here') {
        console.log('⚠️ Service role key not configured, using anon key');
      }
      
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey && serviceRoleKey !== 'your_supabase_service_role_key_here' 
          ? serviceRoleKey 
          : anonKey!
      );

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store in phone_verification_logs table for registration flow
      console.log('📝 Storing verification in database:', {
        phone_number: phoneNumber,
        verification_code: verificationCode,
        expires_at: expiresAt.toISOString(),
        user_id: userId || null,
      });

      const { data: insertResult, error: insertError } = await supabase
        .from('phone_verification_logs')
        .insert({
          phone_number: phoneNumber,
          verification_code: verificationCode,
          expires_at: expiresAt.toISOString(),
          attempts: 1,
          sent_at: new Date().toISOString(),
          status: 'sent',
          user_id: userId || null,
        });

      if (insertError) {
        console.error('❌ Failed to store verification in database:', insertError);
      } else {
        console.log('✅ Verification stored successfully:', insertResult);
      }

      // If userId is provided, also update the users table
      if (userId) {
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({
            phone_verification_code: verificationCode,
            phone_verification_expires_at: expiresAt.toISOString(),
            phone_verification_attempts: 1,
            phone_verification_last_sent: new Date().toISOString(),
          })
          .eq('id', userId);

        if (userUpdateError) {
          console.error('❌ Failed to update user table:', userUpdateError);
        } else {
          console.log('✅ User table updated successfully');
        }
      }
    } catch (dbError) {
      console.error('❌ Database operation failed:', dbError);
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
