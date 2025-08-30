import { NextRequest, NextResponse } from 'next/server';
import serverPhoneVerificationService from '@/lib/phone-verification-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code, requestId } = body;

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

    // Validate code format (should be 6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid verification code format. Code must be 6 digits.' 
        },
        { status: 400 }
      );
    }

    console.log(`🔍 API: Verifying code for user ${userId}, requestId: ${requestId}`);

    // Verify the code
    const result = await serverPhoneVerificationService.verifyCode(
      userId, 
      code, 
      requestId
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        verified: result.verified,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: result.message,
          verified: false,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Error in verify code API:', error);
    
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
