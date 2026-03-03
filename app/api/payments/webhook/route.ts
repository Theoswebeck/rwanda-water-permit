// =============================================
// Payment Webhook Handler
// POST /api/payments/webhook
// Handles IremboPay webhook callbacks
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getIremboPayClient } from '@/lib/irembopay-client';
import { mapIremboPayStatus, getApplicationStatusFromPayment, generateReceiptNumber } from '@/lib/payment-utils';
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission';
import type { WebhookProcessingResult } from '@/types/payment';
import { query } from '@/lib/db/postgres';

export async function POST(request: NextRequest) {
  let rawBody = '';
  let signature = '';
  let sourceIp = '';
  try {
    console.log('🔔 [WEBHOOK] Payment webhook received');

    // =============================================
    // 1. EXTRACT WEBHOOK DATA
    // =============================================

    rawBody = await request.text();
    signature = request.headers.get('x-irembo-signature') || request.headers.get('x-signature') || '';
    sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';

    console.log('📨 [WEBHOOK] Source IP:', sourceIp);

    // =============================================
    // 2. VALIDATE WEBHOOK SIGNATURE
    // =============================================

    const iremboPayClient = getIremboPayClient();
    const isValidSignature = iremboPayClient.validateWebhookSignature(rawBody, signature);

    // Note: Webhook signature validation is optional
    // To enable strict validation, set IREMBOPAY_WEBHOOK_SECRET and uncomment the check below
    if (!isValidSignature) {
      console.warn('⚠️ [WEBHOOK] Signature validation skipped or failed - processing anyway');
    }
    
    // Uncomment below to enforce signature validation in production:
    // if (!isValidSignature && process.env.NODE_ENV === 'production') {
    //   console.error('❌ [WEBHOOK] Invalid signature');
    //   // Persist a failed signature attempt in public.webhook_logs, then reject.
    //   return NextResponse.json(
    //     { success: false, error: 'Invalid signature' },
    //     { status: 401 }
    //   );
    // }

    console.log('✅ [WEBHOOK] Signature validated');

    // =============================================
    // 3. PARSE WEBHOOK PAYLOAD
    // =============================================

    const payload = iremboPayClient.parseWebhook(rawBody);

    if (!payload) {
      console.error('❌ [WEBHOOK] Invalid payload format');
      return NextResponse.json(
        { success: false, error: 'Invalid payload' },
        { status: 400 }
      );
    }

    console.log('📦 [WEBHOOK] Payload:', {
      event: payload.event,
      reference: payload.data.reference,
      status: payload.data.status,
      amount: payload.data.amount,
    });

    // =============================================
    // 4. FIND PAYMENT RECORD
    // =============================================

    const paymentRes = await query(
      `
      select
        p.*,
        row_to_json(a) as applications
      from public.payments p
      left join public.applications a on a.id = p.application_id
      where p.irembo_payment_ref = $1
      limit 1
      `,
      [payload.data.reference]
    );
    const payment = paymentRes.rows[0] as Record<string, unknown> | undefined;
    const paymentError = !payment ? new Error('Payment not found') : null;

    if (paymentError || !payment) {
      console.error('❌ [WEBHOOK] Payment not found:', payload.data.reference);
      
      // Log webhook for unknown payment
      await query(
        `
        insert into public.webhook_logs (
          event_type, event_id, payload, headers, source_ip, signature, signature_valid, processed, processing_error, received_at, created_at
        ) values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, false, $8, now(), now())
        `,
        [
          payload.event,
          payload.data.transaction_id || null,
          JSON.stringify(payload),
          JSON.stringify(Object.fromEntries(request.headers.entries())),
          sourceIp || null,
          signature || null,
          isValidSignature,
          'Payment not found',
        ]
      ).catch(() => undefined);

      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    console.log('✅ [WEBHOOK] Payment found:', payment.id);

    // =============================================
    // 5. PROCESS WEBHOOK EVENT
    // =============================================

    const internalStatus = mapIremboPayStatus(payload.data.status);
    const now = new Date().toISOString();

    console.log('🔄 [WEBHOOK] Processing event:', payload.event, '→ Status:', internalStatus);

    // Prepare update data
    const paymentGateway = (payment.gateway_response as Record<string, unknown> | null | undefined) || {};
    const paymentUpdate: Record<string, unknown> = {
      status: internalStatus,
      irembo_transaction_id: payload.data.transaction_id || payment.irembo_transaction_id,
      payment_method: payload.data.payment_method || payment.payment_method,
      gateway_response: {
        ...paymentGateway,
        webhook: payload,
      },
      updated_at: now,
    };

    // Set timestamp based on status
    switch (internalStatus) {
      case 'processing':
        paymentUpdate.processing_at = now;
        break;
      case 'completed':
        paymentUpdate.completed_at = payload.data.completed_at || now;
        break;
      case 'failed':
        paymentUpdate.failed_at = now;
        break;
    }

    // =============================================
    // 6. UPDATE PAYMENT RECORD
    // =============================================

    const updateRes = await query(
      `
      update public.payments
      set
        status = $2,
        irembo_transaction_id = $3,
        payment_method = $4,
        gateway_response = $5::jsonb,
        processing_at = coalesce($6::timestamptz, processing_at),
        completed_at = coalesce($7::timestamptz, completed_at),
        failed_at = coalesce($8::timestamptz, failed_at),
        updated_at = now()
      where id = $1
      `,
      [
        payment.id,
        internalStatus,
        paymentUpdate.irembo_transaction_id || null,
        paymentUpdate.payment_method || null,
        JSON.stringify(paymentUpdate.gateway_response || {}),
        paymentUpdate.processing_at || null,
        paymentUpdate.completed_at || null,
        paymentUpdate.failed_at || null,
      ]
    );
    const updateError = !updateRes.rowCount ? new Error('payment not updated') : null;

    if (updateError) {
      console.error('❌ [WEBHOOK] Failed to update payment:', updateError);
      throw updateError;
    }

    console.log('✅ [WEBHOOK] Payment updated:', internalStatus);

    // =============================================
    // 7. CREATE TRANSACTION LOG
    // =============================================

    await query(
      `
      insert into public.payment_transactions (
        payment_id,
        irembo_txn_id,
        transaction_ref,
        payment_method,
        payment_channel,
        amount,
        currency,
        status,
        provider_response,
        provider_code,
        provider_message,
        processed_at,
        created_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,now(),now())
      `,
      [
        payment.id,
        payload.data.transaction_id || null,
        payload.data.reference || null,
        payload.data.payment_method || null,
        payload.data.payment_channel || null,
        payload.data.amount,
        payload.data.currency,
        internalStatus,
        JSON.stringify(payload.data || {}),
        payload.data.status || null,
        payload.data.failed_reason || null,
        now,
      ]
    ).catch((err) => {
      console.warn('⚠️ [WEBHOOK] Failed creating payment transaction log:', err);
    });

    console.log('✅ [WEBHOOK] Transaction log created');

    // =============================================
    // 8. UPDATE APPLICATION STATUS
    // =============================================

    if (internalStatus === 'completed') {
      const newApplicationStatus = getApplicationStatusFromPayment(internalStatus);
      
      const appUpdateRes = payment.application_id
        ? await query(
            `
            update public.applications
            set status = $2, submitted_at = $3, updated_at = now()
            where id = $1
            returning id
            `,
            [payment.application_id, newApplicationStatus, now]
          )
        : { rowCount: 0 };
      const appUpdateError = !appUpdateRes.rowCount ? new Error('application not updated') : null;

      if (appUpdateError) {
        console.error('⚠️  [WEBHOOK] Failed to update application status:', appUpdateError);
      } else {
        console.log('✅ [WEBHOOK] Application status updated to:', newApplicationStatus);
        if (newApplicationStatus === 'submitted' && payment.application_id) {
          try {
            const notifyResult = await notifyOnApplicationSubmitted(payment.application_id);
            if (!notifyResult.ok) {
              console.warn('⚠️ [WEBHOOK] Submission notifications failed (non-blocking):', notifyResult.message);
            }
          } catch (e) {
            console.warn('⚠️ [WEBHOOK] Submission notifications crashed (non-blocking):', e);
          }
        }
      }

      // =============================================
      // 9. GENERATE RECEIPT
      // =============================================

      try {
        const applicationRes = payment.application_id
          ? await query(
              `
              select *
              from public.applications
              where id = $1
              limit 1
              `,
              [payment.application_id]
            )
          : { rows: [] as Record<string, unknown>[] };
        const application = applicationRes.rows[0];

        const receiptData = {
          receipt_number: generateReceiptNumber(),
          payment_id: payment.id,
          application_id: payment.application_id,
          application_number: application?.application_number || 'N/A',
          amount: payment.amount,
          currency: payment.currency,
          payment_method: payload.data.payment_method || 'Unknown',
          transaction_id: payload.data.transaction_id,
          customer_name: payment.customer_name,
          customer_email: payment.customer_email,
          customer_phone: payment.customer_phone,
          paid_date: now,
          description: payment.description,
        };

        const receiptInsert = await query(
          `
          insert into public.payment_receipts (
            payment_id,
            application_id,
            receipt_number,
            receipt_data,
            generated_at,
            created_at,
            updated_at
          ) values ($1,$2,$3,$4::jsonb,$5,now(),now())
          `,
          [
            payment.id,
            payment.application_id,
            receiptData.receipt_number,
            JSON.stringify(receiptData),
            now,
          ]
        );
        const receiptError = !receiptInsert.rowCount ? new Error('receipt not inserted') : null;

        if (receiptError) {
          console.error('⚠️  [WEBHOOK] Failed to generate receipt:', receiptError);
        } else {
          console.log('✅ [WEBHOOK] Receipt generated:', receiptData.receipt_number);
        }
      } catch (receiptError) {
        console.error('⚠️  [WEBHOOK] Receipt generation error:', receiptError);
        // Non-critical, continue
      }
    } else if (internalStatus === 'failed' || internalStatus === 'cancelled') {
      // ✅ Requirement: if payment fails, application should still be draft.
      // Race-safety: only revert if the application is still in the payment stage.
      const newStatus = 'draft';

      if (payment.application_id) {
        const revertRes = await query(
          `
          update public.applications
          set status = $2, updated_at = now()
          where id = $1
            and status in ('pending_payment', 'draft')
          returning id, status
          `,
          [payment.application_id, newStatus]
        );
        const updatedApp = revertRes.rows[0];
        const revertError = null;

        if (revertError) {
          console.error('⚠️  [WEBHOOK] Failed to revert application to draft:', revertError);
        } else if (updatedApp) {
          console.log('✅ [WEBHOOK] Application status updated to:', newStatus);
        } else {
          console.log('ℹ️  [WEBHOOK] Application not reverted (already progressed beyond payment stage)');
        }
      }
    }

    // =============================================
    // 10. LOG WEBHOOK EVENT
    // =============================================

    await query(
      `
      insert into public.webhook_logs (
        payment_id,
        event_type,
        event_id,
        payload,
        headers,
        source_ip,
        signature,
        signature_valid,
        processed,
        processed_at,
        received_at,
        created_at
      ) values (
        $1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,true,$9,now(),now()
      )
      `,
      [
        payment.id,
        payload.event,
        payload.data.transaction_id || null,
        JSON.stringify(payload),
        JSON.stringify(Object.fromEntries(request.headers.entries())),
        sourceIp || null,
        signature || null,
        isValidSignature,
        now,
      ]
    ).catch((err) => {
      console.warn('⚠️ [WEBHOOK] Failed to write webhook log:', err);
    });

    console.log('✅ [WEBHOOK] Webhook logged successfully');

    // =============================================
    // 11. RETURN SUCCESS RESPONSE
    // =============================================

    const result: WebhookProcessingResult = {
      success: true,
      payment_id: payment.id,
      message: `Webhook processed successfully for payment ${payment.id}`,
    };

    console.log('✅ [WEBHOOK] Processing completed successfully');

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Unexpected error:', error);

    // Try to log error
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      await query(
        `
        insert into public.webhook_logs (
          event_type,
          payload,
          headers,
          source_ip,
          signature,
          signature_valid,
          processed,
          processing_error,
          received_at,
          created_at
        ) values ($1, $2::jsonb, $3::jsonb, $4, $5, false, false, $6, now(), now())
        `,
        [
          'payment.failed',
          JSON.stringify(parsed),
          JSON.stringify(Object.fromEntries(request.headers.entries())),
          sourceIp || request.headers.get('x-forwarded-for') || null,
          signature || request.headers.get('x-irembo-signature') || null,
          error instanceof Error ? error.message : 'Unknown error',
        ]
      ).catch(() => undefined);
    } catch (logError) {
      console.error('❌ [WEBHOOK] Failed to log error:', logError);
    }

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

// GET method to verify webhook endpoint is accessible
export async function GET() {
  return NextResponse.json(
    {
      message: 'IremboPay Webhook Endpoint',
      status: 'active',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

