import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  // PostgREST cannot query auth schema; use GoTrue Admin API pagination.
  // Some projects cap perPage; we iterate pages until exhausted (with a safety limit).
  const perPage = 1000;
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u) => String(u.email || "").toLowerCase() === email);
    if (found?.id) return found.id;
    if (users.length < perPage) break; // end of list
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const newPasswordRaw = String(body?.newPassword ?? "");
    const resetTokenRaw = String(body?.resetToken ?? "");

    const newPassword = newPasswordRaw;
    const resetToken = resetTokenRaw.trim();

    if (!resetToken) {
      return NextResponse.json({ success: false, message: "Missing reset token" }, { status: 400 });
    }
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json(
        { success: false, message: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey);

    const tokenHash = sha256Hex(resetToken);

    // Load token record (must be unconsumed and unexpired)
    const { data: tokenRow, error: tokenErr } = await admin
      .from("password_reset_tokens")
      .select("id,email,expires_at,consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenErr) {
      console.error("❌ password-reset confirm: token lookup error:", tokenErr);
      return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }

    const expiresAtMs = tokenRow?.expires_at ? new Date(String(tokenRow.expires_at)).getTime() : 0;
    const isExpired = !expiresAtMs || expiresAtMs < Date.now();
    const isConsumed = Boolean(tokenRow?.consumed_at);

    if (!tokenRow?.id || isConsumed || isExpired) {
      return NextResponse.json({ success: false, message: "Invalid or expired reset token" }, { status: 400 });
    }

    // Consume token (one-time)
    const { error: consumeErr } = await admin
      .from("password_reset_tokens")
      .update({ consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", tokenRow.id)
      .is("consumed_at", null);

    if (consumeErr) {
      console.error("❌ password-reset confirm: token consume error:", consumeErr);
      return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }

    const email = String(tokenRow.email ?? "").trim().toLowerCase();

    let userId: string | null = null;
    try {
      userId = await findAuthUserIdByEmail(admin, email);
    } catch (e) {
      console.error("❌ password-reset confirm: listUsers failed:", e);
      return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }

    // If we can't locate the auth user, do NOT return a false success (it will confuse users).
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to locate an account for this email. Please double-check the email address.",
        },
        { status: 400 }
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateErr) {
      console.error("❌ password-reset confirm: updateUserById error:", updateErr);
      return NextResponse.json({ success: false, message: "Could not update password" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now log in with your new password.",
    });
  } catch (err) {
    console.error("❌ password-reset confirm server error", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}


