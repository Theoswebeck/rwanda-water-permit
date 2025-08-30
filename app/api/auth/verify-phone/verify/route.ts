import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber, code, requestId } = body;

    console.log('🔍 Simple verify API: Checking code for:', { userId, phoneNumber, code });

    // Validate required fields - code is required, userId or phoneNumber needed
    if (!code || (!userId && !phoneNumber)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: code and (userId or phoneNumber)' 
        },
        { status: 400 }
      );
    }

    // Check development mode
    const isDevelopmentMode = process.env.PINDO_DEVELOPMENT_MODE === 'true';
    const devCode = process.env.PINDO_DEV_CODE || '123456';
    
    console.log('🔧 Verify environment status:', {
      isDevelopmentMode,
      devCode,
      submittedCode: code,
    });

    if (isDevelopmentMode) {
      console.log('🔧 Development mode: Checking against test code');
      
      if (code === devCode) {
        console.log('✅ Development verification successful');
        
        // Try to mark as verified in database (optional)
        try {
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey && serviceRoleKey !== 'your_supabase_service_role_key_here' 
              ? serviceRoleKey 
              : anonKey!
          );

          await supabase
            .from('users')
            .update({
              phone_verified: true,
              phone_verification_code: null,
              phone_verification_expires_at: null,
              phone_verification_attempts: 0,
            })
            .eq('id', userId);
        } catch (dbError) {
          console.log('⚠️ Database update failed (non-critical):', dbError);
        }
        
        return NextResponse.json({
          success: true,
          message: 'Phone number verified successfully (development mode)',
          verified: true,
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid code. Expected: ${devCode}`,
            error: 'INVALID_CODE',
            verified: false,
          },
          { status: 400 }
        );
      }
    }

    // Production mode - check against database
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

      let verificationData = null;

      // Try to get verification from phone_verification_logs table first (for registration)
      if (phoneNumber) {
        console.log('🔍 Looking up verification for phone:', phoneNumber);
        
        const { data: phoneVerification, error: phoneError } = await supabase
          .from('phone_verification_logs')
          .select('verification_code, expires_at, status')
          .eq('phone_number', phoneNumber)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        console.log('📊 Database lookup result:', {
          data: phoneVerification,
          error: phoneError,
          phoneNumber
        });

        if (!phoneError && phoneVerification) {
          verificationData = {
            phone_verification_code: phoneVerification.verification_code,
            phone_verification_expires_at: phoneVerification.expires_at,
            phone_verified: phoneVerification.status === 'verified'
          };
          console.log('✅ Found verification data:', verificationData);
        } else {
          console.log('❌ No verification data found, error:', phoneError);
        }
      }

      // Fallback to users table if userId is provided and no verification found
      if (!verificationData && userId) {
        const { data: userVerification, error: userError } = await supabase
          .from('users')
          .select('phone_verification_code, phone_verification_expires_at, phone_verified')
          .eq('id', userId)
          .single();

        if (!userError && userVerification) {
          verificationData = userVerification;
        }
      }

      if (!verificationData) {
        return NextResponse.json(
          {
            success: false,
            message: 'No verification code found for this phone number',
            error: 'NO_VERIFICATION_FOUND',
            verified: false,
          },
          { status: 400 }
        );
      }

      // Check if already verified
      if (verificationData.phone_verified) {
        return NextResponse.json({
          success: true,
          message: 'Phone number already verified',
          verified: true,
        });
      }

      // Check if code has expired
      if (verificationData.phone_verification_expires_at) {
        const expiresAt = new Date(verificationData.phone_verification_expires_at);
        if (new Date() > expiresAt) {
          return NextResponse.json(
            {
              success: false,
              message: 'Verification code has expired',
              error: 'CODE_EXPIRED',
              verified: false,
            },
            { status: 400 }
          );
        }
      }

      // Verify the code
      if (!verificationData.phone_verification_code || verificationData.phone_verification_code !== code) {
        return NextResponse.json(
          {
            success: false,
            message: 'Invalid verification code',
            error: 'INVALID_CODE',
            verified: false,
          },
          { status: 400 }
        );
      }

      // Update verification status
      if (phoneNumber) {
        // Update phone_verification_logs table
        await supabase
          .from('phone_verification_logs')
          .update({ status: 'verified' })
          .eq('phone_number', phoneNumber)
          .eq('status', 'sent');
      }

      if (userId) {
        // Update users table if userId provided
        await supabase
          .from('users')
          .update({
            phone_verified: true,
            phone_verification_code: null,
            phone_verification_expires_at: null,
            phone_verification_attempts: 0,
          })
          .eq('id', userId);
      }

      console.log('✅ Production phone verification completed successfully');

      return NextResponse.json({
        success: true,
        message: 'Phone number verified successfully',
        verified: true,
      });

    } catch (error) {
      console.error('❌ Database error in verification:', error);
      return NextResponse.json(
        {
          success: false,
          message: 'Database error during verification',
          error: 'DATABASE_ERROR',
          verified: false,
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ Error in simple verify code:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: 'An unexpected error occurred while verifying code',
        verified: false,
      },
      { status: 500 }
    );
  }
}
