import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code, requestId } = body;

    console.log('🔍 Simple verify API: Checking code for:', { userId, code });

    // Validate required fields
    if (!userId || !code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: userId and code' 
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
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: userVerification, error: userError } = await supabase
        .from('users')
        .select('phone_verification_code, phone_verification_expires_at, phone_verified')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('❌ Error fetching user verification status:', userError);
        return NextResponse.json(
          {
            success: false,
            message: 'Error checking verification status',
            error: userError.message,
            verified: false,
          },
          { status: 400 }
        );
      }

      // Check if already verified
      if (userVerification.phone_verified) {
        return NextResponse.json({
          success: true,
          message: 'Phone number already verified',
          verified: true,
        });
      }

      // Check if code has expired
      if (userVerification.phone_verification_expires_at) {
        const expiresAt = new Date(userVerification.phone_verification_expires_at);
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
      if (!userVerification.phone_verification_code || userVerification.phone_verification_code !== code) {
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

      // Update user as verified
      await supabase
        .from('users')
        .update({
          phone_verified: true,
          phone_verification_code: null,
          phone_verification_expires_at: null,
          phone_verification_attempts: 0,
        })
        .eq('id', userId);

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
