/**
 * Phone Verification Service for Rwanda Water Resources Board
 * Uses self-hosted API routes (no Supabase client).
 */

interface VerificationResult {
  success: boolean;
  message: string;
  requestId?: number;
  error?: string;
}

interface VerificationCheckResult {
  success: boolean;
  message: string;
  verified?: boolean;
  error?: string;
}

interface PhoneVerificationLog {
  id: string;
  user_id: string;
  phone_number: string;
  verification_code: string;
  request_id?: string;
  pindo_message_id?: string;
  status: 'sent' | 'verified' | 'expired' | 'failed';
  verification_method: string;
  attempts_count: number;
  verified_at?: string;
  expires_at: string;
  pindo_response?: unknown;
  cost_incurred?: number;
  network_operator?: string;
  created_at: string;
  updated_at: string;
}

export class PhoneVerificationService {
  /**
   * Send verification code to phone number
   */
  async sendVerificationCode(
    userId: string, 
    phoneNumber: string, 
    useCustomCode: boolean = false
  ): Promise<VerificationResult> {
    try {
      const endpoint = '/api/auth/verify-phone/send';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          phoneNumber,
          useCustomCode,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success !== true) {
        return {
          success: false,
          message: String(json.message || 'Failed to send verification code'),
          error: String(json.error || 'SEND_FAILED'),
        };
      }
      return {
        success: true,
        message: String(json.message || 'Verification code sent successfully'),
        requestId: typeof json.requestId === 'number' ? json.requestId : undefined,
      };
    } catch {
      return {
        success: false,
        message: 'An unexpected error occurred',
        error: 'UNEXPECTED_ERROR'
      };
    }
  }

  /**
   * Verify the submitted code
   */
  async verifyCode(
    userId: string, 
    submittedCode: string, 
    requestId?: number
  ): Promise<VerificationCheckResult> {
    try {
      const endpoint = '/api/auth/verify-phone/verify';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          code: submittedCode,
          requestId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success !== true) {
        return {
          success: false,
          message: String(json.message || 'Invalid verification code'),
          error: String(json.error || 'INVALID_CODE'),
        };
      }
      return {
        success: true,
        message: String(json.message || 'Phone number verified successfully'),
        verified: true,
      };
    } catch {
      return {
        success: false,
        message: 'An unexpected error occurred',
        error: 'UNEXPECTED_ERROR'
      };
    }
  }

  /**
   * Check if user's phone is verified
   */
  async isPhoneVerified(userId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/verify-phone/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) return false;
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return Boolean(json.verified);
    } catch {
      return false;
    }
  }

  // Compatibility no-op in self-hosted mode.
  async cleanupExpiredCodes(): Promise<void> {
    return;
  }
}

// Create singleton instance
const phoneVerificationService = new PhoneVerificationService();

export default phoneVerificationService;

export type { VerificationResult, VerificationCheckResult, PhoneVerificationLog };
