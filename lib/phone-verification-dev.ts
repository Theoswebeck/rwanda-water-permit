/**
 * Development-only Phone Verification Service
 */

import { query } from '@/lib/db/postgres';

interface VerificationResult {
  success: boolean;
  message: string;
  requestId?: number;
  error?: string;
  remainingBalance?: number;
}

interface VerificationCheckResult {
  success: boolean;
  message: string;
  verified?: boolean;
  error?: string;
}

export class DevPhoneVerificationService {
  async sendVerificationCode(userId: string, phoneNumber: string, useCustomCode: boolean = false): Promise<VerificationResult> {
    try {
      const verificationCode = process.env.PINDO_DEV_CODE || '123456';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await query(
        `
        update public.users
        set
          phone_verification_code = $2,
          phone_verification_expires_at = $3,
          phone_verification_attempts = 1,
          phone_verification_last_sent = now(),
          updated_at = now()
        where id = $1
        `,
        [userId, verificationCode, expiresAt]
      ).catch(() => undefined);
      return {
        success: true,
        message: `Development mode: Use code ${verificationCode} to verify`,
        requestId: undefined,
      };
    } catch {
      return { success: true, message: 'Development mode: Use code 123456 to verify' };
    }
  }

  async verifyCode(userId: string, submittedCode: string, requestId?: number): Promise<VerificationCheckResult> {
    const expectedCode = process.env.PINDO_DEV_CODE || '123456';
    if (submittedCode !== expectedCode) {
      return { success: false, message: `Invalid code. Expected: ${expectedCode}`, error: 'INVALID_CODE' };
    }
    await query(
      `
      update public.users
      set
        phone_verified = true,
        phone_verification_code = null,
        phone_verification_expires_at = null,
        phone_verification_attempts = 0,
        updated_at = now()
      where id = $1
      `,
      [userId]
    ).catch(() => undefined);
    return { success: true, message: 'Phone number verified successfully (development mode)', verified: true };
  }

  async isPhoneVerified(userId: string): Promise<boolean> {
    const res = await query<{ phone_verified: boolean | null }>(
      `select phone_verified from public.users where id = $1 limit 1`,
      [userId]
    ).catch(() => null);
    return Boolean(res?.rows?.[0]?.phone_verified ?? true);
  }
}

const devPhoneVerificationService = new DevPhoneVerificationService();
export default devPhoneVerificationService;
