import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const path = body?.path as string | undefined;

    if (!id) return NextResponse.json({ success: false, message: "Missing permit id" }, { status: 400 });
    if (!path || typeof path !== "string") {
      return NextResponse.json({ success: false, message: "Missing path" }, { status: 400 });
    }

    const result = await query(
      `
      update public.permits
      set permit_pdf_url = $2, updated_at = now()
      where id = $1
      `,
      [id, path]
    );
    if (!result.rowCount) return NextResponse.json({ success: false, message: "Permit not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

