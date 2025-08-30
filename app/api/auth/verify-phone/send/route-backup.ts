import { NextRequest, NextResponse } from 'next/server';
import serverPhoneVerificationService from '@/lib/phone-verification-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber } = body;

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

    // Validate phone number format (basic check)
    const phoneRegex = /^(\+250|0)7\d{8}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid Rwandan phone number format' 
        },
        { status: 400 }
      );
    }

    console.log(`📱 API: Sending verification code to ${phoneNumber} for user ${userId}`);

    // Send verification code
    const result = await serverPhoneVerificationService.sendVerificationCode(
      userId, 
      phoneNumber, 
      true // Use custom code for better control
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        requestId: result.requestId,
        remainingBalance: result.remainingBalance,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: result.message,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Error in send verification API:', error);
    
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
