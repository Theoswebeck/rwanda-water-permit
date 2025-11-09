// =============================================
// Payment Completion API
// POST /api/payments/[id]/complete
// Save application after successful payment
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    console.log('✅ [PAYMENT COMPLETE] Request received for payment:', paymentId);

    // Initialize Supabase client
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (!user || authError) {
      console.error('❌ [PAYMENT COMPLETE] Unauthorized');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Parse request body
    const { formData } = await request.json();

    if (!formData) {
      return NextResponse.json(
        { success: false, error: 'Form data is required' },
        { status: 400 }
      );
    }

    // =============================================
    // 1. VERIFY PAYMENT EXISTS AND IS COMPLETED
    // =============================================

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('applicant_id', userId)
      .single();

    if (paymentError || !payment) {
      console.error('❌ [PAYMENT COMPLETE] Payment not found:', paymentError);
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.status !== 'completed') {
      console.error('❌ [PAYMENT COMPLETE] Payment not completed:', payment.status);
      return NextResponse.json(
        { success: false, error: 'Payment is not completed yet' },
        { status: 400 }
      );
    }

    if (payment.application_id) {
      console.error('❌ [PAYMENT COMPLETE] Payment already linked to application');
      return NextResponse.json(
        { success: false, error: 'Payment already linked to an application' },
        { status: 400 }
      );
    }

    console.log('✅ [PAYMENT COMPLETE] Payment verified and ready');

    // =============================================
    // 2. SAVE APPLICATION WITH STATUS="SUBMITTED"
    // =============================================

    const now = new Date().toISOString();

    // Generate application number
    const applicationNumber = `RWB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;

    // Prepare application data - ATOMIC INSERT with correct status
    const applicationData: Record<string, unknown> = {
      applicant_id: userId,
      application_number: applicationNumber,
      status: 'submitted', // ✓ Set directly on creation
      submitted_at: now,   // ✓ Set directly on creation
      created_at: now,
      updated_at: now,
      
      // Form data fields
      project_title: formData.intendedActivities?.join(', ') || 'Water Permit Application',
      applicant_type: formData.categoryApplicant || 'individual',
      applicant_name: formData.fullNameApplicant || '',
      representative_name: formData.nameRepresentative || null,
      
      // Contact details
      email: formData.emailAddress || '',
      phone: formData.telephoneContact || '',
      office_phone: formData.telephoneContactOffice || null,
      postal_address: formData.officePostalAddress || null,
      
      // Location
      province: formData.officeProvince || '',
      district: formData.officeDistrict || '',
      sector: formData.officeSector || '',
      cell: formData.officeCell || '',
      village: formData.officeVillage || '',
      
      // Water source details
      water_source_type: formData.waterSourceType || '',
      water_source_name: formData.nameSourceWater || '',
      water_source_province: formData.waterSourceProvince || '',
      water_source_district: formData.waterSourceDistrict || '',
      water_source_sector: formData.waterSourceSector || '',
      water_source_cell: formData.waterSourceCell || '',
      water_source_village: formData.waterSourceVillage || '',
      
      // Activities
      intended_activities: formData.intendedActivities || [],
      
      // Store full form data as JSON for reference
      form_data: formData,
    };

    console.log('💾 [PAYMENT COMPLETE] Saving application with status=submitted');

    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert(applicationData)
      .select('*, users!applications_applicant_id_fkey(*)')
      .single();

    if (appError || !application) {
      console.error('❌ [PAYMENT COMPLETE] Failed to save application:', appError);
      return NextResponse.json(
        { success: false, error: 'Failed to save application' },
        { status: 500 }
      );
    }

    console.log('✅ [PAYMENT COMPLETE] Application saved:', application.application_number);

    // =============================================
    // 3. LINK PAYMENT TO APPLICATION
    // =============================================

    const { error: linkError } = await supabase
      .from('payments')
      .update({ application_id: application.id })
      .eq('id', paymentId);

    if (linkError) {
      console.error('❌ [PAYMENT COMPLETE] Failed to link payment:', linkError);
      // Application is saved but payment not linked - log for manual fix
      console.error('⚠️  MANUAL FIX NEEDED: Link payment', paymentId, 'to application', application.id);
    } else {
      console.log('✅ [PAYMENT COMPLETE] Payment linked to application');
    }

    // =============================================
    // 4. RETURN SUCCESS
    // =============================================

    return NextResponse.json({
      success: true,
      application: {
        id: application.id,
        application_number: application.application_number,
        status: application.status,
        submitted_at: application.submitted_at,
        applicant: application.users,
      },
    });

  } catch (error) {
    console.error('❌ [PAYMENT COMPLETE] Unexpected error:', error);
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

