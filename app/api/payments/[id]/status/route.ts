// =============================================
// Payment Status Check API
// GET /api/payments/[id]/status
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getIremboPayClient } from '@/lib/irembopay-client';
import { getApplicationStatusFromPayment, mapIremboPayStatus } from '@/lib/payment-utils';
import type { PaymentStatusResponse } from '@/types/payment';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    console.log('🔍 [PAYMENT STATUS] Checking status for payment:', paymentId);

    // Initialize Supabase client
    const supabase = await createClient();

    // Check authentication using getUser() which is more reliable for API routes
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (!user || authError) {
      console.error('❌ [PAYMENT STATUS] Unauthorized: No authenticated user');
      console.error('   Auth error:', authError?.message);
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // =============================================
    // 1. FETCH PAYMENT FROM DATABASE
    // =============================================

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        applications (
          id,
          application_number,
          status,
          project_title
        )
      `)
      .eq('id', paymentId)
      .eq('applicant_id', userId)
      .single();

    if (paymentError || !payment) {
      console.error('❌ [PAYMENT STATUS] Payment not found:', paymentError);
      return NextResponse.json(
        { success: false, error: 'Payment not found or access denied' },
        { status: 404 }
      );
    }

    console.log('✅ [PAYMENT STATUS] Payment found:', {
      id: payment.id,
      status: payment.status,
      application: payment.applications?.application_number,
    });

    // =============================================
    // 2. FETCH LATEST TRANSACTION
    // =============================================

    const { data: latestTransaction } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // =============================================
    // 3. VERIFY WITH IREMBOPAY (OPTIONAL)
    // =============================================

    // Only verify with IremboPay if payment is still pending/processing
    if (
      (payment.status === 'pending' || payment.status === 'processing') &&
      payment.irembo_payment_ref
    ) {
      try {
        console.log('🌐 [PAYMENT STATUS] Verifying with IremboPay API...');
        
        const iremboPayClient = getIremboPayClient();
        const iremboStatus = await iremboPayClient.getPaymentStatus(
          payment.irembo_payment_ref
        );

        if (iremboStatus.success && iremboStatus.data) {
          // Map IremboPay status to our internal status
          const iremboPaymentStatus = iremboStatus.data.paymentStatus; // IremboPay uses 'paymentStatus' field
          const mappedStatus = mapIremboPayStatus(iremboPaymentStatus);
          
          console.log('✅ [PAYMENT STATUS] IremboPay status:', iremboPaymentStatus, '→ Mapped:', mappedStatus);

          // Update local status if different
          if (mappedStatus !== payment.status) {
            console.log('🔄 [PAYMENT STATUS] Updating local status from IremboPay');
            
            const updateData: any = {
              status: mappedStatus,
              irembo_transaction_id: iremboStatus.data.transactionId || payment.irembo_transaction_id,
              payment_method: iremboStatus.data.paymentMethod?.toLowerCase() || payment.payment_method,
              gateway_response: {
                ...(payment.gateway_response as any || {}),
                status_check: iremboStatus.data,
                checked_at: new Date().toISOString(),
              },
            };

            // Set appropriate timestamp
            if (mappedStatus === 'completed') {
              updateData.completed_at = iremboStatus.data.paidAt || new Date().toISOString();
            } else if (mappedStatus === 'failed') {
              updateData.failed_at = new Date().toISOString();
            }

            await supabase
              .from('payments')
              .update(updateData)
              .eq('id', paymentId);

            // Update the payment object with new status
            payment.status = mappedStatus as any;
            payment.irembo_transaction_id = iremboStatus.data.transactionId || payment.irembo_transaction_id;

            console.log('✅ [PAYMENT STATUS] Local status updated to:', mappedStatus);

            // =============================================
            // UPDATE APPLICATION STATUS IF PAYMENT COMPLETED
            // =============================================
            if (mappedStatus === 'completed' && payment.application_id) {
              const newApplicationStatus = getApplicationStatusFromPayment('completed');
              const now = new Date().toISOString();
              
              console.log('🔄 [PAYMENT STATUS] Updating application status:', {
                application_id: payment.application_id,
                new_status: newApplicationStatus,
              });

              const { error: appUpdateError } = await supabase
                .from('applications')
                .update({ 
                  status: newApplicationStatus,
                  submitted_at: now,
                })
                .eq('id', payment.application_id);

              if (appUpdateError) {
                console.error('⚠️  [PAYMENT STATUS] Failed to update application:', appUpdateError);
                console.error('   Error details:', JSON.stringify(appUpdateError));
                // Check if application exists
                const { data: checkApp } = await supabase
                  .from('applications')
                  .select('id, status')
                  .eq('id', payment.application_id)
                  .single();
                console.log('   Application check:', checkApp);
              } else {
                console.log('✅ [PAYMENT STATUS] Application updated to:', newApplicationStatus);
                // Update the payment.applications object if it exists
                if (payment.applications) {
                  payment.applications.status = newApplicationStatus as any;
                }
              }
            } else if (mappedStatus === 'completed' && !payment.application_id) {
              console.warn('⚠️  [PAYMENT STATUS] Payment completed but no application_id linked!');
            }
          }
        }
      } catch (verifyError) {
        console.error('⚠️  [PAYMENT STATUS] IremboPay verification failed:', verifyError);
        // Non-critical error, continue with local status
      }
    }

    // =============================================
    // 4. PREPARE RESPONSE
    // =============================================

    const response: PaymentStatusResponse = {
      success: true,
      payment: payment as any,
      transaction: latestTransaction as any,
    };

    console.log('✅ [PAYMENT STATUS] Returning status:', payment.status);

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('❌ [PAYMENT STATUS] Unexpected error:', error);
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

