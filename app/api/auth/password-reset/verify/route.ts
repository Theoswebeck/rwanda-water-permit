import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const isValidEmail = (email: string) => /[^@\s]+@[^@\s]+\.[^@\s]+/.test(email);

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const emailRaw = String(body?.email ?? "");
    const codeRaw = String(body?.code ?? "");

    const email = emailRaw.trim().toLowerCase();
    const code = codeRaw.trim();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ success: false, message: "Missing code" }, { status: 400 });
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

    // Verify/consume OTP for password reset
    const { data: verified, error: verifyErr } = await admin.rpc("verify_email_code", {
      p_email: email,
      p_code: code,
      p_purpose: "password_reset",
    });

    if (verifyErr) {
      console.error("❌ password-reset verify: verify_email_code error:", verifyErr);
      return NextResponse.json({ success: false, message: "Invalid or expired code" }, { status: 400 });
    }
    if (!verified) {
      return NextResponse.json({ success: false, message: "Invalid or expired code" }, { status: 400 });
    }

    // Invalidate any previous active reset tokens for this email
    await admin
      .from("password_reset_tokens")
      .update({ consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("email", email)
      .is("consumed_at", null);

    const resetToken = randomToken(32);
    const tokenHash = sha256Hex(resetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertErr } = await admin.from("password_reset_tokens").insert({
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("❌ password-reset verify: insert token error:", insertErr);
      return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, resetToken });
  } catch (err) {
    console.error("❌ password-reset verify server error", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}




