import { NextRequest, NextResponse } from 'next/server';
import serverPhoneVerificationService from '@/lib/phone-verification-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required field: userId' 
        },
        { status: 400 }
      );
    }

    console.log(`🔍 API: Checking verification status for user ${userId}`);

    // Check verification status
    const isVerified = await serverPhoneVerificationService.isPhoneVerified(userId);

    return NextResponse.json({
      success: true,
      verified: isVerified,
      message: isVerified ? 'Phone number is verified' : 'Phone number is not verified',
    });

  } catch (error) {
    console.error('❌ Error in verification status API:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: 'An unexpected error occurred while checking verification status',
        verified: false,
      },
      { status: 500 }
    );
  }
}
