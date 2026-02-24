import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function safeParseObject(s: unknown): Record<string, any> {
  if (typeof s !== "string" || !s.trim()) return {};
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
    return {};
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "Missing application id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const patch = body?.patch as Record<string, any> | undefined;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json({ success: false, message: "Missing patch object" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: appRow, error: fetchErr } = await supabase
      .from("applications")
      .select("id, internal_notes")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    if (!appRow) return NextResponse.json({ success: false, message: "Application not found" }, { status: 404 });

    const existing = safeParseObject((appRow as any).internal_notes);
    const merged = { ...existing, ...patch };

    const { error: updateErr } = await supabase
      .from("applications")
      .update({ internal_notes: JSON.stringify(merged), updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true, internal_notes: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

