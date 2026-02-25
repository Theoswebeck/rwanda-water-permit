// =============================================
// Payment Initiation API
// POST /api/payments/initiate
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getIremboPayClient } from '@/lib/irembopay-client';
import { 
  getApplicationFee, 
  normalizeRwandaPhone, 
  validatePaymentAmount,
  validateCustomerEmail,
  validateCustomerPhone,
  getPaymentExpiryTime
} from '@/lib/payment-utils';
import type { InitiatePaymentRequest, InitiatePaymentResponse } from '@/types/payment';
import { mapFormDataToApplication } from '@/lib/application-utils';

export async function POST(request: NextRequest) {
  try {
    console.log('💳 [PAYMENT INITIATE] Request received');

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

    // Initialize Supabase client
    const supabase = await createClient();

    // Check authentication using getUser() which is more reliable for API routes
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    console.log('🔐 [PAYMENT INITIATE] Auth check:', {
      hasUser: !!user,
      userId: user?.id,
      email: user?.email,
      authError: authError?.message
    });
    
    if (!user || authError) {
      console.error('❌ [PAYMENT INITIATE] Unauthorized: No authenticated user');
      console.error('   Auth error:', authError?.message);
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;
    
    console.log('✅ [PAYMENT INITIATE] Authenticated user:', userId, user.email);

    // Parse request body
    const body: InitiatePaymentRequest = await request.json();
    const {
      application_id,
      amount,
      currency,
      customer,
      application_data,
      purpose = 'application_fee',
      water_use_report_id,
    } = body;

    // Real payment mode only - demo mode removed

    console.log('📋 [PAYMENT INITIATE] Request data:', {
      application_id,
      amount,
      currency,
      user_id: userId,
      has_application_data: !!application_data
    });

    let application: any = null;
    let applicationIdToUse = application_id;

    // If initiating an annual report fee, validate the report ownership and derive application_id from it.
    if (purpose === 'annual_report_fee') {
      if (!water_use_report_id) {
        return NextResponse.json(
          { success: false, error: 'water_use_report_id is required for annual_report_fee' },
          { status: 400 }
        );
      }

      const { data: reportRow, error: reportError } = await supabase
        .from('water_use_reports')
        .select('id, applicant_id, application_id')
        .eq('id', water_use_report_id)
        .single();

      if (reportError || !reportRow) {
        console.error('❌ [PAYMENT INITIATE] Failed to fetch water use report:', reportError);
        return NextResponse.json(
          { success: false, error: 'Water use report not found' },
          { status: 404 }
        );
      }

      if (reportRow.applicant_id !== userId) {
        console.error('❌ [PAYMENT INITIATE] Access denied: User does not own this water use report');
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }

      applicationIdToUse = reportRow.application_id;
    }

    // =============================================
    // 1. GET OR CREATE APPLICATION
    // =============================================

    if (application_data) {
      // Permit modifications do not require payment. Reject early to avoid creating payment rows
      // (and avoid creating accidental draft applications via the payment endpoint).
      const looksLikeModification =
        purpose !== 'annual_report_fee' &&
        isRecord(application_data) &&
        (application_data.isModification === true || application_data.is_modification === true);

      if (looksLikeModification) {
        return NextResponse.json(
          {
            success: false,
            error: 'Payment is not required for permit modifications.',
          },
          { status: 400 }
        );
      }

      console.log('📝 [PAYMENT INITIATE] Received application data, creating draft...');
      const mappedData = mapFormDataToApplication(application_data, 'draft', userId);
      
      const { data: newApplication, error: createError } = await supabase
        .from('applications')
        .insert(mappedData)
        .select('*, users!applications_applicant_id_fkey(*)')
        .single();

      if (createError) {
        console.error('❌ [PAYMENT INITIATE] Failed to create draft application:', createError);
        return NextResponse.json(
          { success: false, error: 'Failed to create draft application before payment' },
          { status: 500 }
        );
      }
      application = newApplication;
      applicationIdToUse = newApplication.id;
      console.log('✅ [PAYMENT INITIATE] Draft application created:', applicationIdToUse);
    } else if (applicationIdToUse) {
      console.log(`🔍 [PAYMENT INITIATE] Fetching application ${applicationIdToUse}...`);
      const { data: existingApplication, error: appError } = await supabase
        .from('applications')
        .select('*, users!applications_applicant_id_fkey(*)')
        .eq('id', applicationIdToUse)
        .single();
      
      if (appError) {
        console.error('❌ [PAYMENT INITIATE] Error fetching application:', appError);
      }
      application = existingApplication;
    }

    if (application) {
      console.log('✅ [PAYMENT INITIATE] Using application:', application.application_number);
      // Verify ownership
      if (application.applicant_id !== userId) {
        console.error('❌ [PAYMENT INITIATE] Access denied: User does not own this application');
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }

      // Permit modifications do not require payment.
      if (purpose !== 'annual_report_fee' && (application.is_modification === true || application.application_type === 'modification')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Payment is not required for permit modifications.',
          },
          { status: 400 }
        );
      }
    } else {
      console.warn('⚠️ [PAYMENT INITIATE] No application found or created. Payment will not be linked to an application.');
      applicationIdToUse = undefined; // Ensure it's undefined if no app
    }

    // =============================================
    // 2. CHECK EXISTING PAYMENT
    // =============================================

    if (purpose === 'annual_report_fee') {
      // Block duplicate completed report-fee payments for this report
      const { data: existingReportPayment } = await supabase
        .from('payments')
        .select('*')
        .eq('purpose', 'annual_report_fee')
        .eq('water_use_report_id', water_use_report_id!)
        .eq('status', 'completed')
        .maybeSingle();

      if (existingReportPayment) {
        console.warn('⚠️  [PAYMENT INITIATE] Annual report fee already completed for this report');
        return NextResponse.json(
          {
            success: false,
            error: 'Payment already completed for this annual report',
            payment: existingReportPayment,
          },
          { status: 400 }
        );
      }
    } else {
      // Default behavior: block duplicate completed application fee payments for this application
      if (applicationIdToUse) {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('*')
          .eq('application_id', applicationIdToUse)
          .eq('status', 'completed')
          .maybeSingle();

        if (existingPayment) {
          console.warn('⚠️  [PAYMENT INITIATE] Payment already completed');
          return NextResponse.json(
            {
              success: false,
              error: 'Payment already completed for this application',
              payment: existingPayment,
            },
            { status: 400 }
          );
        }
      }
    }

    // =============================================
    // 3. PREPARE PAYMENT DETAILS
    // =============================================

    const paymentAmount = amount || getApplicationFee();
    const paymentCurrency = currency || 'RWF';

    // Validate amount
    const amountValidation = validatePaymentAmount(paymentAmount);
    if (!amountValidation.valid) {
      return NextResponse.json(
        { success: false, error: amountValidation.error },
        { status: 400 }
      );
    }

    // Get customer details (from application if exists, otherwise from user/customer)
    const userDetails = application?.users;
    const customerEmail = (customer?.email || userDetails?.email || user.email || '').trim();
    const customerPhone = (
      customer?.phone ||
      userDetails?.phone ||
      userDetails?.mobile_phone ||
      userDetails?.company_phone ||
      userDetails?.landline_phone ||
      ''
    ).trim();
    const customerName =
      (customer?.name ||
        `${userDetails?.first_name || ''} ${userDetails?.last_name || ''}`.trim() ||
        userDetails?.company_name ||
        '')?.trim();

    if (!customerEmail || !customerPhone || !customerName) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing customer details (name, email, phone). Please update your profile information before initiating payment.',
        },
        { status: 400 }
      );
    }

    // Validate customer details
    const emailValidation = validateCustomerEmail(customerEmail);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { success: false, error: `Invalid email: ${emailValidation.error}` },
        { status: 400 }
      );
    }

    const phoneValidation = validateCustomerPhone(customerPhone);
    if (!phoneValidation.valid) {
      return NextResponse.json(
        { success: false, error: `Invalid phone: ${phoneValidation.error}` },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizeRwandaPhone(customerPhone);

    console.log('👤 [PAYMENT INITIATE] Customer details:', {
      name: customerName,
      email: customerEmail,
      phone: normalizedPhone,
    });

    // =============================================
    // 4. INITIATE PAYMENT WITH IREMBOPAY
    // =============================================

    let iremboPayClient: ReturnType<typeof getIremboPayClient>;
    try {
      iremboPayClient = getIremboPayClient();
    } catch (e) {
      console.error('❌ [PAYMENT INITIATE] IremboPay configuration error:', e);
      const message =
        e instanceof Error
          ? e.message
          : 'IremboPay configuration error. Please contact support.';
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 500 }
      );
    }
    
    // Get product code from environment (must exist in IremboPay dashboard)
    const productCode =
      purpose === 'annual_report_fee'
        ? (process.env.IREMBOPAY_ANNUAL_REPORT_PRODUCT_CODE || process.env.IREMBOPAY_PRODUCT_CODE || 'WATER_PERMIT_FEE')
        : (process.env.IREMBOPAY_PRODUCT_CODE || 'WATER_PERMIT_FEE');
    const paymentAccountId = process.env.IREMBOPAY_ACCOUNT_ID || 'RWANDA_WATER_BOARD';

    const itemName = purpose === 'annual_report_fee'
      ? 'Annual Water Use Report Fee'
      : 'Water Permit Application Fee';

    const itemDescription = purpose === 'annual_report_fee'
      ? `Annual Water Use Report Fee - ${water_use_report_id}`
      : `Water Permit Application Fee - ${application?.application_number || application_id}`;

    const iremboPayRequest = {
      paymentItems: [
        {
          code: productCode,
          name: itemName,
          quantity: 1,
          unitAmount: paymentAmount,
        }
      ],
      paymentAccountIdentifier: paymentAccountId,
      description: itemDescription,
      customer: {
        email: customerEmail,
        phone: normalizedPhone,
        name: customerName,
      },
      language: 'EN' as const,
    };

    console.log('🌐 [PAYMENT INITIATE] Calling IremboPay API...');
    const iremboResponse = await iremboPayClient.initiatePayment(iremboPayRequest);

    if (!iremboResponse.success || !iremboResponse.data) {
      console.error('❌ [PAYMENT INITIATE] IremboPay initiation failed:', iremboResponse.error);
      return NextResponse.json(
        {
          success: false,
          error: iremboResponse.error?.message || 'Failed to initiate payment with IremboPay',
        },
        { status: 500 }
      );
    }

    // Map IremboPay response fields to our database fields
    const iremboData: any = iremboResponse.data;
    const paymentRef = iremboData.invoiceNumber || iremboData.payment_ref;
    const paymentUrl = iremboData.paymentLinkUrl || iremboData.payment_url;
    const requestId = iremboData.transactionId || iremboData.request_id;

    console.log('✅ [PAYMENT INITIATE] IremboPay payment initiated:', paymentRef);
    console.log('🔗 [PAYMENT INITIATE] Payment URL:', paymentUrl);

    // =============================================
    // 5. CREATE PAYMENT RECORD IN DATABASE
    // =============================================

    const initiatedAt = new Date();
    const initiatedAtIso = initiatedAt.toISOString();
    const expiresAt = getPaymentExpiryTime(initiatedAt);

    // Build payment record data - application_id may be null initially
    const paymentData: any = {
      applicant_id: userId,
      application_id: applicationIdToUse || null,
      purpose,
      water_use_report_id: water_use_report_id || null,
      amount: paymentAmount,
      currency: paymentCurrency,
      description: iremboPayRequest.description,
      status: 'pending',
      irembo_payment_ref: paymentRef,
      irembo_request_id: requestId,
      payment_url: paymentUrl,
      customer_email: customerEmail,
      customer_phone: normalizedPhone,
      customer_name: customerName,
      gateway_response: iremboResponse.data as any,
      gateway_metadata: {
        ...((iremboPayRequest as any).metadata || {}),
      },
      initiated_at: initiatedAtIso,
      expires_at: expiresAt.toISOString(),
      created_by: userId,
    };

    console.log('💾 [PAYMENT INITIATE] Payment data:', {
      payment_id: paymentData.id,
      application_id: paymentData.application_id,
      application_exists: !!application,
    });

    const { data: paymentRecord, error: paymentError } = (await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single()) as any;

    if (paymentError || !paymentRecord) {
      console.error('❌ [PAYMENT INITIATE] Failed to create payment record:', paymentError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create payment record',
        },
        { status: 500 }
      );
    }

    console.log('✅ [PAYMENT INITIATE] Payment record created:', paymentRecord.id);

    // =============================================
    // 6. UPDATE APPLICATION STATUS (only if application exists)
    // =============================================

    if (application && purpose !== 'annual_report_fee') {
      const nextStatus = 'pending_payment';
      const updateResult = await supabase
        .from('applications')
        // @ts-ignore - Type inference issue with conditional query
        .update({ status: nextStatus })
        .eq('id', applicationIdToUse);
      
      const { error: updateError } = updateResult as any;

      if (updateError) {
        console.error('⚠️  [PAYMENT INITIATE] Failed to update application status:', updateError);
        // Not a critical error, continue
      } else {
        console.log('✅ [PAYMENT INITIATE] Application status updated to', nextStatus);
      }
    } else {
      console.log('ℹ️  [PAYMENT INITIATE] No application status update required for this payment purpose');
    }

    // =============================================
    // 7. CREATE INITIAL TRANSACTION LOG
    // =============================================

    await supabase.from('payment_transactions').insert({
      payment_id: paymentRecord.id,
      irembo_txn_id: paymentRef,
      transaction_ref: requestId,
      amount: paymentAmount,
      currency: paymentCurrency,
      status: 'pending',
      provider_response: iremboResponse.data as any,
      initiated_at: initiatedAtIso,
    } as any);

    // =============================================
    // 8. RETURN SUCCESS RESPONSE
    // =============================================

    const response: InitiatePaymentResponse = {
      success: true,
      payment: paymentRecord as any,
      payment_url: paymentUrl,
    };

    console.log('✅ [PAYMENT INITIATE] Payment initiated successfully');
    console.log('🔗 [PAYMENT INITIATE] Payment URL:', response.payment_url);

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('❌ [PAYMENT INITIATE] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// OPTIONS method for CORS
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200 });
}

