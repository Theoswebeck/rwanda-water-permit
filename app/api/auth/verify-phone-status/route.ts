import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

function normalizeRwandaPhoneToE164(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('07')) return `+250${digits.substring(1)}`;
  if (digits.length === 12 && digits.startsWith('2507')) return `+${digits}`;
  return null;
}

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

    const normalizedPhone = normalizeRwandaPhoneToE164(phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: 'Invalid phone number format. Use 07XXXXXXXX (10 digits).',
        },
        { status: 400 }
      );
    }

    const statusResult = await query<{ status: string | null; sent_at: string | null }>(
      `
      select status, sent_at
      from public.phone_verification_logs
      where phone_number = $1
      order by sent_at desc nulls last, created_at desc nulls last, id desc
      limit 1
      `,
      [normalizedPhone]
    );

    const verification = statusResult.rows[0];

    if (!verification || verification.status !== 'verified') {
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
