import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

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

    const result = await query<{ phone_verified: boolean | null }>(
      `
      select phone_verified
      from public.users
      where id = $1
      limit 1
      `,
      [userId]
    );

    const isVerified = Boolean(result.rows[0]?.phone_verified);

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
