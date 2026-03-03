// =============================================
// Payment Initiation API
// POST /api/payments/initiate
// =============================================

import { NextRequest, NextResponse } from 'next/server';
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
import { query } from '@/lib/db/postgres';
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    console.log('💳 [PAYMENT INITIATE] Request received');

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

    const token = readSessionTokenFromRequest(request);
    const claims = token ? await verifySessionToken(token) : null;
    const user = claims
      ? {
          id: claims.sub,
          email: claims.email,
        }
      : null;
    const authError = user ? null : new Error('Missing/invalid session');

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

    let application: Record<string, unknown> | null = null;
    let applicationIdToUse = application_id;

    // If initiating an annual report fee, validate the report ownership and derive application_id from it.
    if (purpose === 'annual_report_fee') {
      if (!water_use_report_id) {
        return NextResponse.json(
          { success: false, error: 'water_use_report_id is required for annual_report_fee' },
          { status: 400 }
        );
      }

      const reportRes = await query<{ id: string; applicant_id: string; application_id: string }>(
        `
        select id, applicant_id, application_id
        from public.water_use_reports
        where id = $1
        limit 1
        `,
        [water_use_report_id]
      );
      const reportRow = reportRes.rows[0];

      if (!reportRow) {
        console.error('❌ [PAYMENT INITIATE] Failed to fetch water use report');
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
      
      const entries = Object.entries(mappedData).filter(([key]) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key));
      if (!entries.length) {
        return NextResponse.json(
          { success: false, error: 'Failed to create draft application before payment' },
          { status: 500 }
        );
      }
      const cols = entries.map(([key]) => key);
      const vals = entries.map(([, value]) => value);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`);

      const appInsert = await query(
        `
        insert into public.applications (${cols.join(', ')})
        values (${placeholders.join(', ')})
        returning *
        `,
        vals
      );
      const newApplication = appInsert.rows[0];
      if (!newApplication?.id) {
        return NextResponse.json(
          { success: false, error: 'Failed to create draft application before payment' },
          { status: 500 }
        );
      }
      const applicantRes = await query(
        `
        select *
        from public.users
        where id = $1
        limit 1
        `,
        [newApplication.applicant_id]
      );
      application = { ...newApplication, users: applicantRes.rows[0] || null };
      applicationIdToUse = newApplication.id;
      console.log('✅ [PAYMENT INITIATE] Draft application created:', applicationIdToUse);
    } else if (applicationIdToUse) {
      console.log(`🔍 [PAYMENT INITIATE] Fetching application ${applicationIdToUse}...`);
      const appRes = await query(
        `
        select *
        from public.applications
        where id = $1
        limit 1
        `,
        [applicationIdToUse]
      );
      const existingApplication = appRes.rows[0];
      if (!existingApplication) {
        console.error('❌ [PAYMENT INITIATE] Error fetching application: not found');
      }
      let appUser: Record<string, unknown> | null = null;
      if (existingApplication?.applicant_id) {
        const appUserRes = await query(
          `
          select *
          from public.users
          where id = $1
          limit 1
          `,
          [existingApplication.applicant_id]
        );
        appUser = (appUserRes.rows[0] as Record<string, unknown> | undefined) || null;
      }
      
      application = existingApplication;
      if (application) application = { ...application, users: appUser };
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
      const reportPaymentRes = await query(
        `
        select *
        from public.payments
        where purpose = 'annual_report_fee'
          and water_use_report_id = $1
          and status = 'completed'
        order by created_at desc nulls last
        limit 1
        `,
        [water_use_report_id]
      );
      const existingReportPayment = reportPaymentRes.rows[0];

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
        const existingPaymentRes = await query(
          `
          select *
          from public.payments
          where application_id = $1
            and status = 'completed'
          order by created_at desc nulls last
          limit 1
          `,
          [applicationIdToUse]
        );
        const existingPayment = existingPaymentRes.rows[0];

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
    const iremboData = iremboResponse.data as Record<string, unknown>;
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
    const paymentData: Record<string, unknown> = {
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
      gateway_response: iremboResponse.data as Record<string, unknown>,
      gateway_metadata: {},
      initiated_at: initiatedAtIso,
      expires_at: expiresAt.toISOString(),
      created_by: userId,
    };

    console.log('💾 [PAYMENT INITIATE] Payment data:', {
      payment_id: paymentData.id,
      application_id: paymentData.application_id,
      application_exists: !!application,
    });

    const paymentInsert = await query(
      `
      insert into public.payments (
        applicant_id,
        application_id,
        purpose,
        water_use_report_id,
        amount,
        currency,
        description,
        status,
        irembo_payment_ref,
        irembo_request_id,
        payment_url,
        customer_email,
        customer_phone,
        customer_name,
        gateway_response,
        gateway_metadata,
        initiated_at,
        expires_at,
        created_by,
        created_at,
        updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,now(),now()
      )
      returning *
      `,
      [
        paymentData.applicant_id,
        paymentData.application_id,
        paymentData.purpose,
        paymentData.water_use_report_id,
        paymentData.amount,
        paymentData.currency,
        paymentData.description,
        paymentData.status,
        paymentData.irembo_payment_ref,
        paymentData.irembo_request_id,
        paymentData.payment_url,
        paymentData.customer_email,
        paymentData.customer_phone,
        paymentData.customer_name,
        JSON.stringify(paymentData.gateway_response ?? {}),
        JSON.stringify(paymentData.gateway_metadata ?? {}),
        paymentData.initiated_at,
        paymentData.expires_at,
        paymentData.created_by,
      ]
    );
    const paymentRecord = paymentInsert.rows[0] as Record<string, unknown> | undefined;

    if (!paymentRecord) {
      console.error('❌ [PAYMENT INITIATE] Failed to create payment record');
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
      await query(
        `
        update public.applications
        set status = $2, updated_at = now()
        where id = $1
        `,
        [applicationIdToUse, nextStatus]
      ).then(
        () => console.log('✅ [PAYMENT INITIATE] Application status updated to', nextStatus),
        (updateError) => console.error('⚠️  [PAYMENT INITIATE] Failed to update application status:', updateError)
      );
    } else {
      console.log('ℹ️  [PAYMENT INITIATE] No application status update required for this payment purpose');
    }

    // =============================================
    // 7. CREATE INITIAL TRANSACTION LOG
    // =============================================

    await query(
      `
      insert into public.payment_transactions (
        payment_id,
        irembo_txn_id,
        transaction_ref,
        amount,
        currency,
        status,
        provider_response,
        initiated_at,
        created_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7,now(),now())
      `,
      [
        paymentRecord.id,
        paymentRef || null,
        requestId || null,
        paymentAmount,
        paymentCurrency,
        JSON.stringify(iremboResponse.data ?? {}),
        initiatedAtIso,
      ]
    );

    // =============================================
    // 8. RETURN SUCCESS RESPONSE
    // =============================================

    const response: InitiatePaymentResponse = {
      success: true,
      payment: paymentRecord,
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
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

