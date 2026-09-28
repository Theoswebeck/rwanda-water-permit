// Pulls an IremboPay invoice's live status into our payments row and, when it
// is paid, moves the linked application out of pending_payment. Shared by the
// applicant's status poll, the background reconcile sweep and application
// delete — IremboPay has never delivered a webhook to prod, so this pull is
// the only way a payment gets recorded.

import { getIremboPayClient } from '@/lib/irembopay-client';
import { getApplicationStatusFromPayment, mapIremboPayStatus } from '@/lib/payment-utils';
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission';
import { query } from '@/lib/db/postgres';

const PAYMENT_METHOD_ENUM_VALUES = new Set([
  'mobile_money',
  'card',
  'bank_transfer',
  'ussd',
  'cash',
]);

function normalizeGatewayPaymentMethod(rawMethod: unknown): string | null {
  if (typeof rawMethod !== 'string' || !rawMethod.trim()) return null;

  const normalized = rawMethod.trim().toLowerCase();

  if (PAYMENT_METHOD_ENUM_VALUES.has(normalized)) return normalized;
  if (normalized.includes('momo') || normalized.includes('mobile')) return 'mobile_money';
  if (normalized.includes('card') || normalized.includes('visa') || normalized.includes('master')) return 'card';
  if (normalized.includes('bank')) return 'bank_transfer';
  if (normalized.includes('ussd')) return 'ussd';
  if (normalized.includes('cash')) return 'cash';

  return null;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasCompletionEvidence(
  statusData: {
    paidAt?: string;
    transactionId?: string;
    invoiceNumber?: string;
    paymentReference?: string;
  },
  expectedInvoiceRef: string
): boolean {
  const paidAt = cleanString(statusData.paidAt);
  const transactionId = cleanString(statusData.transactionId);
  const invoiceRef = cleanString(statusData.invoiceNumber || statusData.paymentReference);
  const referenceMatches = expectedInvoiceRef ? invoiceRef === expectedInvoiceRef : true;
  return (Boolean(paidAt) || Boolean(transactionId)) && referenceMatches;
}


/** Mutates `payment` (status, irembo_transaction_id, applications.status) to match what was written. */
export async function syncPaymentWithIrembo(payment: Record<string, unknown>): Promise<void> {
  const paymentId = cleanString(payment.id);
  const applicationId = cleanString(payment.application_id);
  const iremboPaymentRef = cleanString(payment.irembo_payment_ref);

  // Only verify with IremboPay if payment is still pending/processing
  if (
    (payment.status === 'pending' || payment.status === 'processing') &&
    iremboPaymentRef
  ) {
    try {
      console.log('🌐 [PAYMENT STATUS] Verifying with IremboPay API...');

      const iremboPayClient = getIremboPayClient();
      const iremboStatus = await iremboPayClient.getPaymentStatus(
        iremboPaymentRef
      );

      if (iremboStatus.success && iremboStatus.data) {
        // Map IremboPay status to our internal status
        const iremboPaymentStatus = iremboStatus.data.paymentStatus; // IremboPay uses 'paymentStatus' field
        const mappedStatus = mapIremboPayStatus(iremboPaymentStatus);
        const completionVerified =
          mappedStatus !== 'completed' ||
          hasCompletionEvidence(iremboStatus.data, iremboPaymentRef);
        const effectiveStatus =
          mappedStatus === 'completed' && !completionVerified ? 'processing' : mappedStatus;

        console.log('✅ [PAYMENT STATUS] IremboPay status:', iremboPaymentStatus, '→ Mapped:', mappedStatus, '→ Effective:', effectiveStatus);
        if (mappedStatus === 'completed' && !completionVerified) {
          console.warn('⚠️ [PAYMENT STATUS] Gateway reported completed without strong proof; keeping payment in processing state');
        }

        // Real payment flow only - no auto-completion

        // Update local status if different
        if (effectiveStatus !== payment.status) {
          console.log('🔄 [PAYMENT STATUS] Updating local status from IremboPay');

          const gatewayResponse = (payment.gateway_response as Record<string, unknown> | null | undefined) || {};
          const normalizedPaymentMethod =
            normalizeGatewayPaymentMethod(iremboStatus.data.paymentMethod) ||
            normalizeGatewayPaymentMethod(payment.payment_method);
          const updateData: Record<string, unknown> = {
            status: effectiveStatus,
            irembo_transaction_id: iremboStatus.data.transactionId || payment.irembo_transaction_id,
            payment_method: normalizedPaymentMethod,
            gateway_response: {
              ...gatewayResponse,
              status_check: iremboStatus.data,
              checked_at: new Date().toISOString(),
            },
          };

          // Set appropriate timestamp
          if (effectiveStatus === 'completed') {
            updateData.completed_at = iremboStatus.data.paidAt || new Date().toISOString();
          } else if (effectiveStatus === 'failed') {
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
              effectiveStatus,
              updateData.irembo_transaction_id || null,
              updateData.payment_method || null,
              JSON.stringify(updateData.gateway_response || {}),
              updateData.completed_at || null,
              updateData.failed_at || null,
            ]
          );

          // Update the payment object with new status
          payment.status = effectiveStatus;
          payment.irembo_transaction_id = iremboStatus.data.transactionId || payment.irembo_transaction_id;

          console.log('✅ [PAYMENT STATUS] Local status updated to:', effectiveStatus);

          // =============================================
          // UPDATE APPLICATION STATUS IF PAYMENT COMPLETED
          // =============================================
          if (effectiveStatus === 'completed' && applicationId) {
            const newApplicationStatus = getApplicationStatusFromPayment('completed');
            // Anchor on the payment time, not when we noticed it (the sweep can lag).
            const now = String(updateData.completed_at);

            console.log('🔄 [PAYMENT STATUS] Updating application status:', {
              application_id: payment.application_id,
              new_status: newApplicationStatus,
            });

            const appUpdateRes = await query(
              `
              update public.applications
              set status = $2, submitted_at = $3, updated_at = now()
              where id = $1
                and status in ('pending_payment', 'draft')
              returning id, status
              `,
              [applicationId, newApplicationStatus, now]
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
                [applicationId]
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
                  const notifyResult = await notifyOnApplicationSubmitted(applicationId);
                  console.log('📣 [PAYMENT STATUS] Submission notification result:', notifyResult);
                  if (!notifyResult.ok) {
                    console.warn('⚠️ [PAYMENT STATUS] Submission notifications failed (non-blocking):', notifyResult.message);
                  }
                } catch (e) {
                  console.warn('⚠️ [PAYMENT STATUS] Submission notifications crashed (non-blocking):', e);
                }
              }
            }
          } else if (effectiveStatus === 'completed' && !applicationId) {
            console.warn('⚠️  [PAYMENT STATUS] Payment completed but no application_id linked!');
          } else if ((effectiveStatus === 'failed' || effectiveStatus === 'cancelled') && applicationId) {
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
              [applicationId]
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
}

/**
 * Background reconcile: re-check every pending IremboPay invoice (newest first).
 * Catches payments made after the applicant closed the tab or re-clicked Pay.
 */
export async function runPaymentReconcileSweep(limit = 200): Promise<{ checked: number; completed: number }> {
  const res = await query(
    `
    select p.*, row_to_json(a) as applications
    from public.payments p
    left join public.applications a on a.id = p.application_id
    where p.status in ('pending', 'processing')
      and p.irembo_payment_ref is not null
      and p.created_at > now() - interval '120 days'
    order by p.created_at desc
    limit $1
    `,
    [limit]
  );
  let completed = 0;
  for (const payment of res.rows as Record<string, unknown>[]) {
    await syncPaymentWithIrembo(payment);
    if (payment.status === 'completed') completed++;
  }
  return { checked: res.rows.length, completed };
}
