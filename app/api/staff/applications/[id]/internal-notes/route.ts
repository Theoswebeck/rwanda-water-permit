import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

function safeParseObject(s: unknown): Record<string, unknown> {
  if (typeof s !== "string" || !s.trim()) return {};
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
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
    const patch = body?.patch as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json({ success: false, message: "Missing patch object" }, { status: 400 });
    }

    const appRes = await query<{ id: string; internal_notes: string | null }>(
      `
      select id, internal_notes::text as internal_notes
      from public.applications
      where id = $1
      limit 1
      `,
      [id]
    );
    const appRow = appRes.rows[0];
    if (!appRow) return NextResponse.json({ success: false, message: "Application not found" }, { status: 404 });

    const existing = safeParseObject(appRow.internal_notes);
    const merged = { ...existing, ...patch };

    await query(
      `
      update public.applications
      set internal_notes = $2::jsonb, updated_at = now()
      where id = $1
      `,
      [id, JSON.stringify(merged)]
    );
    return NextResponse.json({ success: true, internal_notes: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, message: msg || "Server error" }, { status: 500 });
  }
}

