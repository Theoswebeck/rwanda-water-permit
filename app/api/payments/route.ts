// =============================================
// Payment API - Get Payment by Application ID
// Endpoint: GET /api/payments?application_id=xxx
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Payment } from '@/types/payment';

/**
 * GET /api/payments?application_id=xxx
 * Fetch existing payment for an application
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const applicationId = searchParams.get('application_id');

    if (!applicationId) {
      return NextResponse.json(
        { error: 'application_id is required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = await createClient();

    // Fetch payment for this application
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // No payment found is OK - return null
    if (!payment || (error && error.code === 'PGRST116')) {
      return NextResponse.json({ success: true, payment: null }, { status: 200 });
    }

    if (error) {
      // Log but don't fail on UUID format errors (testing mode)
      console.warn('⚠️  Error fetching payment:', error);
      return NextResponse.json({ success: true, payment: null }, { status: 200 });
    }

    return NextResponse.json({ success: true, payment }, { status: 200 });
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/payments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payments (if needed for manual payment creation)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { application_id, amount, currency } = body;

    if (!application_id || !amount) {
      return NextResponse.json(
        { error: 'application_id and amount are required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create payment record
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        application_id,
        amount,
        currency: currency || 'RWF',
        status: 'pending',
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating payment:', error);
      return NextResponse.json(
        { error: 'Failed to create payment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error('❌ Unexpected error in POST /api/payments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

