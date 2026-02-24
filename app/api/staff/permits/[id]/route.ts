import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "Missing permit id" }, { status: 400 });

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("permits")
      .select(
        `
        id,
        permit_number,
        status,
        water_source,
        purpose,
        water_allowance,
        allowance_unit,
        issuing_authority,
        issued_date,
        expiry_date,
        permit_pdf_url,
        is_modification,
        modification_count,
        last_modified_at,
        original_permit_id,
        is_renewal,
        is_transfer,
        conditions,
        application_id,
        application:applications!application_id(
          id,
          application_number,
          project_title,
          status,
          terms_status,
          internal_notes,
          province,
          district,
          sector,
          cell,
          village,
          water_source,
          water_purpose,
          proposed_duration_years,
          max_yearly_volume_m3,
          max_daily_volume_m3,
          estimated_usage_volume,
          usage_unit,
          intended_activities,
          concession_area,
          coordinates,
          applicant:users!applicant_id(
            id,
            account_type,
            first_name,
            last_name,
            company_name,
            email,
            phone,
            id_number
          )
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, message: "Permit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, permit: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

