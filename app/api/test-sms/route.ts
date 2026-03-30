import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // ─────────────────────────────────────────────────────────────────────────
  // SMS DISABLED — waiting for Pindo to register sender name "RWB"
  // To re-enable SMS:
  //   1. Confirm with Pindo support that "RWB" sender ID is approved
  //   2. Set SMS_ENABLED=true in .env.local / .env.production
  //   3. Set PINDO_SENDER_NAME=RWB
  //   4. Set PINDO_DEVELOPMENT_MODE=false
  // ─────────────────────────────────────────────────────────────────────────
  if (process.env.SMS_ENABLED !== 'true') {
    return NextResponse.json({
      success: false,
      disabled: true,
      message: 'SMS is currently disabled (SMS_ENABLED != true). Set SMS_ENABLED=true once Pindo confirms the RWB sender name is registered.',
    }, { status: 503 });
  }

  try {
    const { phoneNumber } = await request.json();

    const apiKey = process.env.PINDO_API_KEY;
    const senderName = process.env.PINDO_SENDER_NAME || 'RWB';

    console.log('🔧 Environment test:', {
      hasApiKey: !!apiKey,
      senderName,
      developmentMode: process.env.PINDO_DEVELOPMENT_MODE,
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'No API key found in environment'
      }, { status: 400 });
    }

    // Test SMS sending directly
    const message = `Test SMS from Rwanda Water Resources Board. Code: 123456`;

    const response = await fetch('https://api.pindo.io/v1/sms/', {
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

    const result = await response.json();

    console.log('📱 Pindo API test result:', result);

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      result,
      config: {
        hasApiKey: !!apiKey,
        senderName,
        developmentMode: process.env.PINDO_DEVELOPMENT_MODE,
      }
    });

  } catch (error) {
    console.error('❌ Test SMS error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
