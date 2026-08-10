import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db/postgres";
import {
  AUTH_RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  resetRateLimit,
  tooManyRequests,
} from "@/lib/security/rate-limit";

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

    // SECURITY: the OTP is six digits, so unthrottled guessing exhausts the
    // keyspace quickly. Throttle per account and per source IP.
    const ipKey = `pwreset:verify:ip:${getClientIp(req)}`;
    const accountKey = `pwreset:verify:account:${email}`;

    const ipCheck = checkRateLimit(ipKey, AUTH_RATE_LIMITS.passwordResetVerifyPerIp);
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck, "Too many attempts from this network. Please try again later.");
    }

    const accountCheck = checkRateLimit(accountKey, AUTH_RATE_LIMITS.passwordResetVerifyPerAccount);
    if (!accountCheck.allowed) {
      return tooManyRequests(
        accountCheck,
        "Too many incorrect codes. Please request a new reset code and try again later."
      );
    }

    const codeRes = await query<{ id: string; expires_at: string; consumed_at: string | null }>(
      `
      select id, expires_at, consumed_at
      from public.email_verification_codes
      where lower(email) = lower($1)
        and purpose = 'password_reset'
        and code = $2
      order by created_at desc
      limit 1
      `,
      [email, code]
    );
    const codeRow = codeRes.rows[0];
    const valid = !!codeRow?.id && !codeRow.consumed_at && new Date(String(codeRow.expires_at)).getTime() > Date.now();
    if (!valid) {
      return NextResponse.json({ success: false, message: "Invalid or expired code" }, { status: 400 });
    }
    await query(
      `
      update public.email_verification_codes
      set consumed_at = now(), updated_at = now()
      where id = $1
      `,
      [codeRow.id]
    ).catch(() => undefined);

    // Invalidate any previous active reset tokens for this email
    await query(
      `
      update public.password_reset_tokens
      set consumed_at = now(), updated_at = now()
      where lower(email) = lower($1) and consumed_at is null
      `,
      [email]
    );

    const resetToken = randomToken(32);
    const tokenHash = sha256Hex(resetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await query(
      `
      insert into public.password_reset_tokens (email, token_hash, expires_at, created_at, updated_at)
      values ($1, $2, $3, now(), now())
      `,
      [email, tokenHash, expiresAt]
    );

    // A correct code clears the per-account guess counter.
    resetRateLimit(accountKey);

    return NextResponse.json({ success: true, resetToken });
  } catch (err) {
    console.error("❌ password-reset verify server error", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}






