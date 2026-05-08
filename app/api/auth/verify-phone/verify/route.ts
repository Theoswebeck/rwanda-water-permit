import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

function normalizeRwandaPhoneToE164(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');

  if (digits.length === 10 && digits.startsWith('07')) {
    return `+250${digits.substring(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('2507')) return `+${digits}`;

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber, code, requestId } = body;

    console.log('🔍 Simple verify API: Checking code for:', { hasUserId: !!userId, phoneSuffix: String(phoneNumber || '').slice(-3) });

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

    const normalizedPhone = phoneNumber ? normalizeRwandaPhoneToE164(phoneNumber) : null;
    if (phoneNumber && !normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid phone number format. Use 07XXXXXXXX (10 digits).',
          error: 'INVALID_PHONE_FORMAT',
          verified: false,
        },
        { status: 400 }
      );
    }

    const normalizedCode = String(code).trim();
    let verificationCode: string | null = null;
    let verificationExpiresAt: string | null = null;
    let verificationLogId: number | null = null;
    let alreadyVerified = false;

    // Primary lookup by phone in phone_verification_logs (signup flow).
    if (normalizedPhone) {
      const phoneVerification = await query<{
        id: number;
        verification_code: string;
        expires_at: string;
        status: string | null;
      }>(
        `
        select id, verification_code, expires_at, status
        from public.phone_verification_logs
        where phone_number = $1
        order by sent_at desc nulls last, created_at desc nulls last, id desc
        limit 1
        `,
        [normalizedPhone]
      );

      const row = phoneVerification.rows[0];
      if (row) {
        verificationLogId = row.id;
        verificationCode = row.verification_code;
        verificationExpiresAt = row.expires_at;
        alreadyVerified = row.status === 'verified';
      }
    }

    // Fallback lookup by user from users table.
    if (!verificationCode && userId) {
      const userVerification = await query<{
        phone_verification_code: string | null;
        phone_verification_expires_at: string | null;
        phone_verified: boolean | null;
      }>(
        `
        select phone_verification_code, phone_verification_expires_at, phone_verified
        from public.users
        where id = $1
        limit 1
        `,
        [userId]
      );

      const row = userVerification.rows[0];
      if (row) {
        verificationCode = row.phone_verification_code;
        verificationExpiresAt = row.phone_verification_expires_at;
        alreadyVerified = Boolean(row.phone_verified);
      }
    }

    if (!verificationCode) {
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

    if (alreadyVerified) {
      return NextResponse.json({
        success: true,
        message: 'Phone number already verified',
        verified: true,
      });
    }

    if (verificationExpiresAt) {
      const expiresAt = new Date(verificationExpiresAt);
      if (new Date() > expiresAt) {
        if (verificationLogId) {
          await query(
            `
            update public.phone_verification_logs
            set status = 'expired', updated_at = now()
            where id = $1
            `,
            [verificationLogId]
          );
        }
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

    if (verificationCode !== normalizedCode) {
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

    if (verificationLogId) {
      await query(
        `
        update public.phone_verification_logs
        set status = 'verified', updated_at = now()
        where id = $1
        `,
        [verificationLogId]
      );
    }

    if (userId) {
      const basePhone = normalizedPhone || phoneNumber || null;
      await query(
        `
        update public.users
        set
          phone_verified = true,
          phone_verification_code = null,
          phone_verification_expires_at = null,
          phone_verification_attempts = 0,
          phone = coalesce($2, phone),
          company_phone = case when account_type <> 'individual'::public.account_type then coalesce($2, company_phone) else company_phone end,
          updated_at = now()
        where id = $1
        `,
        [userId, basePhone]
      );
    }

    console.log('✅ Phone verification completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      verified: true,
    });

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
