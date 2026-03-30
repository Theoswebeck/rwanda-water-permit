import { NextRequest, NextResponse } from 'next/server';
import { getPortalUrl } from '@/lib/notifications/portal-url'

export async function POST(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SMS DISABLED — waiting for Pindo to register sender name "RWB"
    // To re-enable SMS:
    //   1. Confirm with Pindo support that "RWB" sender ID is approved
    //   2. Set SMS_ENABLED=true in .env.local / .env.production
    //   3. Set PINDO_SENDER_NAME=RWB
    //   4. Set PINDO_DEVELOPMENT_MODE=false
    // ─────────────────────────────────────────────────────────────────────────
    if (process.env.SMS_ENABLED !== 'true') {
      console.log('📵 [send-approval] SMS disabled (SMS_ENABLED != true). Skipping notification.');
      return NextResponse.json({
        success: false,
        disabled: true,
        message: 'SMS is currently disabled (SMS_ENABLED != true). Set SMS_ENABLED=true once Pindo confirms the RWB sender name is registered.',
      }, { status: 503 });
    }

    const body = await request.json();
    const { 
      applicationNumber, 
      applicantPhone, 
      applicantName, 
      decision, // 'approved', 'rejected', 'revision_required'
      reason,
      projectTitle 
    } = body;

    console.log(`📱 API: Sending ${decision} notification for ${applicationNumber} to ${applicantPhone}`);

    // Validate required fields
    if (!applicationNumber || !applicantPhone || !applicantName || !decision) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: applicationNumber, applicantPhone, applicantName, decision' 
        },
        { status: 400 }
      );
    }

    // Get environment variables
    const apiKey = process.env.PINDO_API_KEY;
    const senderName = process.env.PINDO_SENDER_NAME || 'RWB';
    
    console.log('🔧 Environment status:', {
      hasApiKey: !!apiKey,
      senderName,
    });

    if (!apiKey) {
      console.error('❌ Pindo API key not configured');
      return NextResponse.json(
        { 
          success: false, 
          error: 'SMS service not configured. Please configure Pindo API key.' 
        },
        { status: 500 }
      );
    }

    // Format phone number (Rwandan format)
    const formatPhoneNumber = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      
      if (digits.startsWith('250') && digits.length === 12) {
        return `+${digits}`;
      } else if (digits.startsWith('0') && digits.length === 10) {
        return `+250${digits.substring(1)}`;
      } else if (digits.length === 9) {
        return `+250${digits}`;
      }
      
      return phone.startsWith('+') ? phone : `+${phone}`;
    };

    // Validate phone number format
    const formattedPhone = formatPhoneNumber(applicantPhone);
    const rwandanMobileRegex = /^\+2507[0-9]{8}$/;
    
    if (!rwandanMobileRegex.test(formattedPhone)) {
      console.warn('⚠️ Invalid phone number format:', applicantPhone);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid phone number format' 
        },
        { status: 400 }
      );
    }

    // Compose message based on decision
    let message: string;
    
    switch (decision) {
      case 'approved':
        const projectInfo = projectTitle ? ` for ${projectTitle}` : '';
        message = `Dear ${applicantName}, 

Congratulations! Your water permit application ${applicationNumber}${projectInfo} has been APPROVED by Rwanda Water Resources Board.

For inquiries: info@rwb.rw
Rwanda Water Resources Board`;
        break;

      case 'rejected':
        const reasonInfo = reason ? ` Reason: ${reason.substring(0, 100)}...` : '';
        message = `Dear ${applicantName},

Your water permit application ${applicationNumber} has been REJECTED by Rwanda Water Resources Board.${reasonInfo}

You may resubmit with corrections or contact us for guidance.

For support: info@rwb.rw
Rwanda Water Resources Board`;
        break;

      case 'revision_required':
        const portalUrl = getPortalUrl()
        message = `Dear ${applicantName},

Your water permit application ${applicationNumber} requires REVISIONS.

Please log into your dashboard to view detailed feedback and resubmit your application.

Portal: ${portalUrl}
Rwanda Water Resources Board`;
        break;

      default:
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid decision type. Must be: approved, rejected, or revision_required' 
          },
          { status: 400 }
        );
    }

    console.log('📱 Sending SMS via Pindo API...');

    // Send SMS via Pindo
    const smsResponse = await fetch('https://api.pindo.io/v1/sms/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: formattedPhone,
        text: message,
        sender: senderName,
      }),
    });

    const smsResult = await smsResponse.json();
    console.log('📱 Pindo response:', smsResult);

    if (!smsResponse.ok) {
      console.error('❌ Pindo API error:', smsResult);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send SMS notification',
          message: smsResult.message || 'SMS service error',
        },
        { status: 400 }
      );
    }

    console.log(`✅ ${decision} SMS sent successfully to ${formattedPhone}`);

    return NextResponse.json({
      success: true,
      message: `${decision} notification sent successfully`,
      smsId: smsResult.sms_id,
      phone: formattedPhone
    });

  } catch (error) {
    console.error(`❌ Error sending approval notification:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: 'An unexpected error occurred while sending notification'
      },
      { status: 500 }
    );
  }
}
