import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "Missing permit id" }, { status: 400 });

    const permitRes = await query(
      `
      select *
      from public.permits
      where id = $1
      limit 1
      `,
      [id]
    );
    const permit = permitRes.rows[0] as Record<string, unknown> | undefined;
    if (!permit) {
      return NextResponse.json({ success: false, message: "Permit not found" }, { status: 404 });
    }
    const appId = String(permit.application_id || "");
    const appRes = appId
      ? await query(
          `
          select *
          from public.applications
          where id = $1
          limit 1
          `,
          [appId]
        )
      : { rows: [] as Record<string, unknown>[] };
    const application = appRes.rows[0] || null;
    const applicantId = application?.applicant_id ? String(application.applicant_id) : "";
    const applicantRes = applicantId
      ? await query(
          `
          select id, account_type, first_name, last_name, company_name, email, phone, id_number
          from public.users
          where id = $1
          limit 1
          `,
          [applicantId]
        )
      : { rows: [] as Record<string, unknown>[] };

    const data = {
      ...permit,
      application: application
        ? {
            ...application,
            applicant: applicantRes.rows[0] || null,
          }
        : null,
    };

    return NextResponse.json({ success: true, permit: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

