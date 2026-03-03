/**
 * Server-side Phone Verification Service for Rwanda Water Resources Board
 */

import pindoClient from '@/lib/pindo-client';
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

export class ServerPhoneVerificationService {
  async sendVerificationCode(
    userId: string,
    phoneNumber: string,
    useCustomCode: boolean = false
  ): Promise<VerificationResult> {
    try {
      const isDevelopmentMode =
        process.env.PINDO_DEVELOPMENT_MODE === 'true' || process.env.NODE_ENV === 'development';

      if (!isDevelopmentMode) {
        const pindoStatus = pindoClient.getStatus();
        if (!pindoStatus.configured) {
          return { success: false, message: 'SMS service is not configured', error: 'PINDO_NOT_CONFIGURED' };
        }
      }

      if (!pindoClient.isValidRwandanPhone(phoneNumber)) {
        return { success: false, message: 'Invalid Rwandan phone number format', error: 'INVALID_PHONE_FORMAT' };
      }

      const existing = await query<{
        phone_verification_attempts: number | null;
        phone_verification_last_sent: string | null;
      }>(
        `
        select phone_verification_attempts, phone_verification_last_sent
        from public.users
        where id = $1
        limit 1
        `,
        [userId]
      );
      const verification = existing.rows[0];
      if (!verification) {
        return { success: false, message: 'User not found', error: 'USER_NOT_FOUND' };
      }

      if (verification.phone_verification_last_sent) {
        const lastSent = new Date(verification.phone_verification_last_sent);
        const diff = (Date.now() - lastSent.getTime()) / (1000 * 60);
        if (diff < 1) {
          return {
            success: false,
            message: `Please wait ${Math.ceil(1 - diff)} minute(s) before requesting another code`,
            error: 'COOLDOWN_ACTIVE',
          };
        }
      }

      const attempts = verification.phone_verification_attempts || 0;
      if (attempts >= 3) {
        return {
          success: false,
          message: 'Maximum verification attempts reached. Please try again later.',
          error: 'MAX_ATTEMPTS_EXCEEDED',
        };
      }

      const verificationCode = isDevelopmentMode
        ? process.env.PINDO_DEV_CODE || '123456'
        : this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      if (!isDevelopmentMode) {
        const message = `Your Rwanda Water Resources Board verification code is: ${verificationCode}. Valid for 10 minutes. Do not share this code.`;
        await pindoClient.sendSMS(phoneNumber, message, 'RWB');
      }

      await query(
        `
        update public.users
        set
          phone_verification_code = $2,
          phone_verification_expires_at = $3,
          phone_verification_attempts = coalesce(phone_verification_attempts, 0) + 1,
          phone_verification_last_sent = now(),
          updated_at = now()
        where id = $1
        `,
        [userId, verificationCode, expiresAt]
      );

      return { success: true, message: 'Verification code sent successfully' };
    } catch (error) {
      console.error('❌ Unexpected error in sendVerificationCode:', error);
      return { success: false, message: 'An unexpected error occurred', error: 'UNEXPECTED_ERROR' };
    }
  }

  async verifyCode(userId: string, submittedCode: string, requestId?: number): Promise<VerificationCheckResult> {
    try {
      const result = await query<{
        phone_verification_code: string | null;
        phone_verification_expires_at: string | null;
        phone_verified: boolean | null;
      }>(
        `
        select phone_verification_code, phone_verification_expires_at, phone_verified
        from public.users
        where id = $1
        limit 1
        `,
        [userId]
      );
      const userVerification = result.rows[0];
      if (!userVerification) {
        return { success: false, message: 'User not found', error: 'USER_NOT_FOUND' };
      }
      if (userVerification.phone_verified) {
        return { success: true, message: 'Phone number already verified', verified: true };
      }
      if (
        userVerification.phone_verification_expires_at &&
        new Date() > new Date(userVerification.phone_verification_expires_at)
      ) {
        return { success: false, message: 'Verification code has expired', error: 'CODE_EXPIRED' };
      }
      if (!userVerification.phone_verification_code || userVerification.phone_verification_code !== submittedCode) {
        return { success: false, message: 'Invalid verification code', error: 'INVALID_CODE' };
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
      );
      return { success: true, message: 'Phone number verified successfully', verified: true };
    } catch (error) {
      console.error('❌ Unexpected error in verifyCode:', error);
      return { success: false, message: 'An unexpected error occurred', error: 'UNEXPECTED_ERROR' };
    }
  }

  async isPhoneVerified(userId: string): Promise<boolean> {
    try {
      const result = await query<{ phone_verified: boolean | null }>(
        `select phone_verified from public.users where id = $1 limit 1`,
        [userId]
      );
      return Boolean(result.rows[0]?.phone_verified);
    } catch {
      return false;
    }
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

const serverPhoneVerificationService = new ServerPhoneVerificationService();
export default serverPhoneVerificationService;
