import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

function normalizeRwandaPhoneToE164(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');

  // UI expects: 07XXXXXXXX (10 digits) -> +2507XXXXXXXX
  if (digits.length === 10 && digits.startsWith('07')) {
    return `+250${digits.substring(1)}`;
  }

  // Backward-compatible: +2507XXXXXXXX / 2507XXXXXXXX
  if (digits.length === 12 && digits.startsWith('2507')) return `+${digits}`;

  return null;
}

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

    const normalizedPhone = normalizeRwandaPhoneToE164(phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid phone number format. Use 07XXXXXXXX (10 digits).',
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

    // Generate verification code (always real/random)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // In dev, we don't require Pindo to be reachable; we will log the code to the server terminal.
    if (isDevelopmentMode || process.env.NODE_ENV !== 'production') {
      console.log(`📟 Phone verification code (dev): code=${verificationCode} phoneSuffix=${String(phoneNumber || '').slice(-3)}`)
    }

    // Production mode - send real SMS
    if (!isDevelopmentMode) {
      if (!apiKey) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Pindo API key not configured' 
          },
          { status: 400 }
        );
      }
    }

    const senderName = process.env.PINDO_SENDER_NAME || 'Pindo';
    const message = `Your Rwanda Water Resources Board verification code is: ${verificationCode}. Valid for 10 minutes. Do not share this code.`;

    console.log('📱 Sending SMS via Pindo API...');

    // Send SMS via Pindo
    let smsResponse: Response | null = null;
    let smsResult: any = null;
    try {
      if (isDevelopmentMode) {
        // Skip external SMS in development mode; proceed to DB storage.
        smsResponse = { ok: true } as any;
      } else {
      smsResponse = await fetch('https://api.pindo.io/v1/sms/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: normalizedPhone,
          text: message,
          sender: senderName,
        }),
      });
      smsResult = await smsResponse.json().catch(() => null);
      console.log('📱 Pindo response received');
      }
    } catch (networkError) {
      // In local/dev environments, Pindo may be unreachable (no network). Still proceed with DB storage.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ Pindo unreachable in dev; proceeding without SMS delivery');
        smsResponse = { ok: true } as any;
      } else {
      throw networkError;
      }
    }

    if (!smsResponse || !smsResponse.ok) {
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

    // Store verification code in self-hosted PostgreSQL.
    // Do not swallow DB errors: if code is not persisted, verification cannot work.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (userId) {
      await query(
        `
        update public.phone_verification_logs
        set status = 'superseded', updated_at = now()
        where status = 'sent' and user_id = $1
        `,
        [userId]
      );
    }

    await query(
      `
      update public.phone_verification_logs
      set status = 'superseded', updated_at = now()
      where status = 'sent' and phone_number = $1
      `,
      [normalizedPhone]
    );

    await query(
      `
      insert into public.phone_verification_logs (
        phone_number,
        verification_code,
        expires_at,
        attempts,
        sent_at,
        status,
        user_id,
        created_at,
        updated_at
      ) values ($1, $2, $3, 1, now(), 'sent', $4, now(), now())
      `,
      [normalizedPhone, verificationCode, expiresAt.toISOString(), userId || null]
    );

    if (userId) {
      await query(
        `
        update public.users
        set
          phone_verification_code = $2,
          phone_verification_expires_at = $3,
          phone_verification_attempts = coalesce(phone_verification_attempts, 0) + 1,
          phone_verification_last_sent = now(),
          updated_at = now()
        where id = $1
        `,
        [userId, verificationCode, expiresAt.toISOString()]
      );
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
