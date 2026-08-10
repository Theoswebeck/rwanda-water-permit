import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db/postgres";
import { hashPassword } from "@/lib/auth/password";
import { passwordPolicyError, validatePassword } from "@/lib/security/password";
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  tooManyRequests,
} from "@/lib/security/rate-limit";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
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
    // Throttle token redemption so the reset token cannot be guessed.
    const ipCheck = checkRateLimit(
      `pwreset:confirm:ip:${getClientIp(req)}`,
      AUTH_RATE_LIMITS.passwordResetConfirmPerIp
    );
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck, "Too many attempts from this network. Please try again later.");
    }

    const tokenHash = sha256Hex(resetToken);

    // Load token record (must be unconsumed and unexpired)
    const tokenRes = await query<{ id: string; email: string; expires_at: string; consumed_at: string | null }>(
      `
      select id, email, expires_at, consumed_at
      from public.password_reset_tokens
      where token_hash = $1
      limit 1
      `,
      [tokenHash]
    );
    const tokenRow = tokenRes.rows[0];

    const expiresAtMs = tokenRow?.expires_at ? new Date(String(tokenRow.expires_at)).getTime() : 0;
    const isExpired = !expiresAtMs || expiresAtMs < Date.now();
    const isConsumed = Boolean(tokenRow?.consumed_at);

    if (!tokenRow?.id || isConsumed || isExpired) {
      return NextResponse.json({ success: false, message: "Invalid or expired reset token" }, { status: 400 });
    }

    const email = String(tokenRow.email ?? "").trim().toLowerCase();

    // Enforce the password policy *before* consuming the token, so a rejected
    // password does not force the user through the whole reset flow again.
    const strength = validatePassword(newPassword, { email });
    if (!strength.valid) {
      return NextResponse.json(passwordPolicyError(strength), { status: 400 });
    }

    // Consume token (one-time)
    await query(
      `
      update public.password_reset_tokens
      set consumed_at = now(), updated_at = now()
      where id = $1 and consumed_at is null
      `,
      [tokenRow.id]
    );

    const userRes = await query<{ id: string }>(
      `
      select id
      from public.users
      where lower(email) = lower($1)
      limit 1
      `,
      [email]
    );
    const userId = userRes.rows[0]?.id || null;
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to locate an account for this email. Please double-check the email address.",
        },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await query(
      `
      update public.users
      set password_hash = $2, updated_at = now()
      where id = $1
      `,
      [userId, passwordHash]
    );

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now log in with your new password.",
    });
  } catch (err) {
    console.error("❌ password-reset confirm server error", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}


