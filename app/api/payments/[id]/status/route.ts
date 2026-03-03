// =============================================
// Payment Status Check API
// GET /api/payments/[id]/status
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getIremboPayClient } from '@/lib/irembopay-client';
import { getApplicationStatusFromPayment, mapIremboPayStatus } from '@/lib/payment-utils';
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission';
import type { PaymentStatusResponse } from '@/types/payment';
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session';
import { query } from '@/lib/db/postgres';

// Demo mode removed - using real payment flow only

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    console.log('🔍 [PAYMENT STATUS] Checking status for payment:', paymentId);

    const token = readSessionTokenFromRequest(request);
    const claims = token ? await verifySessionToken(token) : null;
    const user = claims ? { id: claims.sub } : null;
    const authError = user ? null : new Error('Missing/invalid session');

    if (!user || authError) {
      console.error('❌ [PAYMENT STATUS] Unauthorized: No authenticated user');
      console.error('   Auth error:', authError?.message);
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Determine whether the current user is staff (reviewer/verifier/approver/assessor/inspector/admin).
    // Applicants can only check their own payments; staff can verify any payment to support assessment.
    const staffRoles = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'] as const;
    let isStaff = false;
    try {
      const roleRes = await query<{ role: string | null }>(
        `
        select role
        from public.users
        where id = $1
        limit 1
        `,
        [userId]
      );
      const role = roleRes.rows[0]?.role || undefined;
      isStaff = !!role && (staffRoles as readonly string[]).includes(role);
    } catch {
      // If role lookup fails, default to non-staff behavior.
      isStaff = false;
    }

    // =============================================
    // 1. FETCH PAYMENT FROM DATABASE
    // =============================================

    const paymentRes = isStaff
      ? await query(
          `
          select
            p.*,
            row_to_json(a) as applications
          from public.payments p
          left join public.applications a on a.id = p.application_id
          where p.id = $1
          limit 1
          `,
          [paymentId]
        )
      : await query(
          `
          select
            p.*,
            row_to_json(a) as applications
          from public.payments p
          left join public.applications a on a.id = p.application_id
          where p.id = $1
            and p.applicant_id = $2
          limit 1
          `,
          [paymentId, userId]
        );
    const paymentRow = paymentRes.rows[0];
    const paymentError = !paymentRow ? new Error('not found') : null;

    if (paymentError || !paymentRow) {
      console.error('❌ [PAYMENT STATUS] Payment not found:', paymentError);
      return NextResponse.json(
        { success: false, error: 'Payment not found or access denied' },
        { status: 404 }
      );
    }

    const payment = paymentRow as Record<string, unknown>;

    console.log('✅ [PAYMENT STATUS] Payment found:', {
      id: payment.id,
      status: payment.status,
      application: payment.applications?.application_number,
    });

    // =============================================
    // 2. FETCH LATEST TRANSACTION
    // =============================================

    const latestTxRes = await query(
      `
      select *
      from public.payment_transactions
      where payment_id = $1
      order by created_at desc nulls last
      limit 1
      `,
      [paymentId]
    );
    const latestTransaction = latestTxRes.rows[0] || null;

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

          // Real payment flow only - no auto-completion

          // Update local status if different
          if (mappedStatus !== payment.status) {
            console.log('🔄 [PAYMENT STATUS] Updating local status from IremboPay');
            
            const gatewayResponse = (payment.gateway_response as Record<string, unknown> | null | undefined) || {};
            const updateData: Record<string, unknown> = {
              status: mappedStatus,
              irembo_transaction_id: iremboStatus.data.transactionId || payment.irembo_transaction_id,
              payment_method: iremboStatus.data.paymentMethod?.toLowerCase() || payment.payment_method,
              gateway_response: {
                ...gatewayResponse,
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

            await query(
              `
              update public.payments
              set
                status = $2,
                irembo_transaction_id = $3,
                payment_method = $4,
                gateway_response = $5::jsonb,
                completed_at = coalesce($6::timestamptz, completed_at),
                failed_at = coalesce($7::timestamptz, failed_at),
                updated_at = now()
              where id = $1
              `,
              [
                paymentId,
                mappedStatus,
                updateData.irembo_transaction_id || null,
                updateData.payment_method || null,
                JSON.stringify(updateData.gateway_response || {}),
                updateData.completed_at || null,
                updateData.failed_at || null,
              ]
            );

            // Update the payment object with new status
            payment.status = mappedStatus;
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

              const appUpdateRes = await query(
                `
                update public.applications
                set status = $2, submitted_at = $3, updated_at = now()
                where id = $1
                returning id, status
                `,
                [payment.application_id, newApplicationStatus, now]
              );
              const appUpdateError = !appUpdateRes.rowCount ? new Error('application not updated') : null;

              if (appUpdateError) {
                console.error('⚠️  [PAYMENT STATUS] Failed to update application:', appUpdateError);
                console.error('   Error details:', JSON.stringify(appUpdateError));
                // Check if application exists
                const checkApp = await query(
                  `
                  select id, status
                  from public.applications
                  where id = $1
                  limit 1
                  `,
                  [payment.application_id]
                );
                console.log('   Application check:', checkApp.rows[0] || null);
              } else {
                console.log('✅ [PAYMENT STATUS] Application updated to:', newApplicationStatus);
                // Update the payment.applications object if it exists
                if (payment.applications) {
                  (payment.applications as Record<string, unknown>).status = newApplicationStatus;
                }
                if (newApplicationStatus === 'submitted') {
                  try {
                    const notifyResult = await notifyOnApplicationSubmitted(payment.application_id);
                    console.log('📣 [PAYMENT STATUS] Submission notification result:', notifyResult);
                    if (!notifyResult.ok) {
                      console.warn('⚠️ [PAYMENT STATUS] Submission notifications failed (non-blocking):', notifyResult.message);
                    }
                  } catch (e) {
                    console.warn('⚠️ [PAYMENT STATUS] Submission notifications crashed (non-blocking):', e);
                  }
                }
              }
            } else if (mappedStatus === 'completed' && !payment.application_id) {
              console.warn('⚠️  [PAYMENT STATUS] Payment completed but no application_id linked!');
            } else if ((mappedStatus === 'failed' || mappedStatus === 'cancelled') && payment.application_id) {
              // ✅ Requirement: if payment fails, application should still be draft.
              // Race-safety: only revert if app is still pending payment (avoid clobbering submitted).
              const revertRes = await query(
                `
                update public.applications
                set status = 'draft', updated_at = now()
                where id = $1
                  and status in ('pending_payment', 'draft')
                returning id, status
                `,
                [payment.application_id]
              );
              const updatedApp = revertRes.rows[0] || null;
              const revertError = null;

              if (revertError) {
                console.error('⚠️  [PAYMENT STATUS] Failed to revert application to draft:', revertError);
              } else if (updatedApp) {
                console.log('✅ [PAYMENT STATUS] Application status reverted to draft');
                if (payment.applications) {
                  (payment.applications as Record<string, unknown>).status = 'draft';
                }
              } else {
                console.log('ℹ️  [PAYMENT STATUS] Application not reverted (already progressed beyond payment stage)');
              }
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
      payment: payment,
      transaction: (latestTransaction as Record<string, unknown> | null) || undefined,
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
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

