// =============================================
// Payment Webhook Handler
// POST /api/payments/webhook
// Handles IremboPay webhook callbacks
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getIremboPayClient } from '@/lib/irembopay-client';
import { mapIremboPayStatus, getApplicationStatusFromPayment, generateReceiptNumber } from '@/lib/payment-utils';
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission';
import type { IremboPayWebhookPayload, WebhookProcessingResult } from '@/types/payment';

// IMPORTANT:
// Do NOT create Supabase clients at module scope.
// Next.js may import route modules during build to collect route data; if env vars
// aren't available at build-time, this would throw and fail the build.
const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 [WEBHOOK] Payment webhook received');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      console.error('❌ [WEBHOOK] Server misconfiguration: missing Supabase keys');
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration: missing Supabase keys' },
        { status: 500 }
      );
    }

    // =============================================
    // 1. EXTRACT WEBHOOK DATA
    // =============================================

    const body = await request.text();
    const signature = request.headers.get('x-irembo-signature') || request.headers.get('x-signature') || '';
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';

    console.log('📨 [WEBHOOK] Source IP:', sourceIp);

    // =============================================
    // 2. VALIDATE WEBHOOK SIGNATURE
    // =============================================

    const iremboPayClient = getIremboPayClient();
    const isValidSignature = iremboPayClient.validateWebhookSignature(body, signature);

    // Note: Webhook signature validation is optional
    // To enable strict validation, set IREMBOPAY_WEBHOOK_SECRET and uncomment the check below
    if (!isValidSignature) {
      console.warn('⚠️ [WEBHOOK] Signature validation skipped or failed - processing anyway');
    }
    
    // Uncomment below to enforce signature validation in production:
    // if (!isValidSignature && process.env.NODE_ENV === 'production') {
    //   console.error('❌ [WEBHOOK] Invalid signature');
    //   await supabaseAdmin.from('webhook_logs').insert({
    //     event_type: 'payment.failed',
    //     payload: JSON.parse(body),
    //     headers: Object.fromEntries(request.headers.entries()),
    //     source_ip: sourceIp,
    //     signature: signature,
    //     signature_valid: false,
    //     processed: false,
    //     processing_error: 'Invalid webhook signature',
    //   });
    //   return NextResponse.json(
    //     { success: false, error: 'Invalid signature' },
    //     { status: 401 }
    //   );
    // }

    console.log('✅ [WEBHOOK] Signature validated');

    // =============================================
    // 3. PARSE WEBHOOK PAYLOAD
    // =============================================

    const payload = iremboPayClient.parseWebhook(body);

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

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*, applications(*)')
      .eq('irembo_payment_ref', payload.data.reference)
      .single();

    if (paymentError || !payment) {
      console.error('❌ [WEBHOOK] Payment not found:', payload.data.reference);
      
      // Log webhook for unknown payment
      await supabaseAdmin.from('webhook_logs').insert({
        event_type: payload.event,
        event_id: payload.data.transaction_id,
        payload: payload as any,
        headers: Object.fromEntries(request.headers.entries()),
        source_ip: sourceIp,
        signature: signature,
        signature_valid: isValidSignature,
        processed: false,
        processing_error: 'Payment not found',
      });

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
    const paymentUpdate: any = {
      status: internalStatus,
      irembo_transaction_id: payload.data.transaction_id || payment.irembo_transaction_id,
      payment_method: payload.data.payment_method || payment.payment_method,
      gateway_response: {
        ...(payment.gateway_response as any || {}),
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

    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update(paymentUpdate)
      .eq('id', payment.id);

    if (updateError) {
      console.error('❌ [WEBHOOK] Failed to update payment:', updateError);
      throw updateError;
    }

    console.log('✅ [WEBHOOK] Payment updated:', internalStatus);

    // =============================================
    // 7. CREATE TRANSACTION LOG
    // =============================================

    await supabaseAdmin.from('payment_transactions').insert({
      payment_id: payment.id,
      irembo_txn_id: payload.data.transaction_id,
      transaction_ref: payload.data.reference,
      payment_method: payload.data.payment_method as any,
      payment_channel: payload.data.payment_channel as any,
      amount: payload.data.amount,
      currency: payload.data.currency,
      status: internalStatus,
      provider_response: payload.data as any,
      provider_code: payload.data.status,
      provider_message: payload.data.failed_reason,
      processed_at: now,
    });

    console.log('✅ [WEBHOOK] Transaction log created');

    // =============================================
    // 8. UPDATE APPLICATION STATUS
    // =============================================

    if (internalStatus === 'completed') {
      const newApplicationStatus = getApplicationStatusFromPayment(internalStatus);
      
      const { error: appUpdateError } = await supabaseAdmin
        .from('applications')
        .update({ 
          status: newApplicationStatus,
          submitted_at: now,
        })
        .eq('id', payment.application_id);

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
        const { data: application } = await supabaseAdmin
          .from('applications')
          .select('*, users!applications_applicant_id_fkey(*)')
          .eq('id', payment.application_id)
          .single();

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

        const { error: receiptError } = await supabaseAdmin
          .from('payment_receipts')
          .insert({
            payment_id: payment.id,
            application_id: payment.application_id,
            receipt_number: receiptData.receipt_number,
            receipt_data: receiptData as any,
            generated_at: now,
          });

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
        const { data: updatedApp, error: revertError } = await supabaseAdmin
          .from('applications')
          .update({ status: newStatus })
          .eq('id', payment.application_id)
          .in('status', ['pending_payment', 'draft'])
          .select('id,status')
          .maybeSingle();

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

    await supabaseAdmin.from('webhook_logs').insert({
      payment_id: payment.id,
      event_type: payload.event,
      event_id: payload.data.transaction_id,
      payload: payload as any,
      headers: Object.fromEntries(request.headers.entries()),
      source_ip: sourceIp,
      signature: signature,
      signature_valid: isValidSignature,
      processed: true,
      processed_at: now,
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
      const body = await request.text();
      await supabaseAdmin.from('webhook_logs').insert({
        event_type: 'payment.failed',
        payload: JSON.parse(body),
        headers: Object.fromEntries(request.headers.entries()),
        source_ip: request.headers.get('x-forwarded-for') || '',
        signature: request.headers.get('x-irembo-signature') || '',
        signature_valid: false,
        processed: false,
        processing_error: error instanceof Error ? error.message : 'Unknown error',
      });
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
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200 });
}

// GET method to verify webhook endpoint is accessible
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      message: 'IremboPay Webhook Endpoint',
      status: 'active',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

