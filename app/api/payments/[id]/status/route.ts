// =============================================
// Payment Status Check API
// GET /api/payments/[id]/status
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { syncPaymentWithIrembo } from '@/lib/payments/sync-irembo-payment';
import type { Payment, PaymentStatusResponse, PaymentTransaction } from '@/types/payment';
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session';
import { query } from '@/lib/db/postgres';
import { isEffectiveStaffUser, resolveEffectiveRoles } from '@/lib/auth/effective-roles';

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
    let isStaff = false;
    try {
      const resolvedRoles = await resolveEffectiveRoles({
        userId,
        claimsRole: claims?.role,
      });
      isStaff = isEffectiveStaffUser(resolvedRoles.effectiveRoles);
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
    const linkedApplication = (payment.applications as Record<string, unknown> | null | undefined) || null;

    console.log('✅ [PAYMENT STATUS] Payment found:', {
      id: payment.id,
      status: payment.status,
      application: linkedApplication?.application_number,
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

    await syncPaymentWithIrembo(payment);

    // =============================================
    // 4. PREPARE RESPONSE
    // =============================================

    const response: PaymentStatusResponse = {
      success: true,
      payment: payment as unknown as Payment,
      transaction: (latestTransaction as PaymentTransaction | null) || undefined,
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

