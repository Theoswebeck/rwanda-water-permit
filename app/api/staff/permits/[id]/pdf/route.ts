import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const path = body?.path as string | undefined;

    if (!id) return NextResponse.json({ success: false, message: "Missing permit id" }, { status: 400 });
    if (!path || typeof path !== "string") {
      return NextResponse.json({ success: false, message: "Missing path" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("permits")
      .update({ permit_pdf_url: path, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

