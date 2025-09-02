/**
 * Development-only Phone Verification Service
 * Bypasses all SMS sending for testing purposes
 */

import { createClient } from '@supabase/supabase-js';

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
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  /**
   * Send verification code (development mode - no actual SMS)
   */
  async sendVerificationCode(
    userId: string, 
    phoneNumber: string, 
    useCustomCode: boolean = false
  ): Promise<VerificationResult> {
    try {
      console.log(`📱 DEV: Starting phone verification for user ${userId}, phone: ${phoneNumber}`);

      // Always use test code in development
      const verificationCode = process.env.PINDO_DEV_CODE || '123456';
      const expiryMinutes = 10;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      console.log('🔧 Development mode: Using test code:', verificationCode);

      // Try to update user's verification status (skip if schema not applied)
      try {
        const { error: updateError } = await this.supabase
          .from('users')
          .update({
            phone_verification_code: verificationCode,
            phone_verification_expires_at: expiresAt.toISOString(),
            phone_verification_attempts: 1,
            phone_verification_last_sent: new Date().toISOString(),
          })
          .eq('id', userId);

        if (updateError) {
          console.log('⚠️ Could not update verification status (schema may not be applied):', updateError.message);
        }
      } catch (dbError) {
        console.log('⚠️ Database update failed, continuing with mock verification');
      }

      return {
        success: true,
        message: `Development mode: Use code ${verificationCode} to verify`,
        requestId: undefined,
      };

    } catch (error) {
      console.error('❌ Unexpected error in dev sendVerificationCode:', error);
      return {
        success: true, // Always succeed in dev mode
        message: 'Development mode: Use code 123456 to verify',
        error: undefined
      };
    }
  }

  /**
   * Verify the submitted code (development mode)
   */
  async verifyCode(
    userId: string, 
    submittedCode: string, 
    requestId?: number
  ): Promise<VerificationCheckResult> {
    try {
      console.log(`🔍 DEV: Verifying code for user ${userId}, code: ${submittedCode}`);

      const expectedCode = process.env.PINDO_DEV_CODE || '123456';

      // Check if code matches
      if (submittedCode !== expectedCode) {
        return {
          success: false,
          message: `Invalid code. Expected: ${expectedCode}`,
          error: 'INVALID_CODE'
        };
      }

      // Try to update user verification status
      try {
        const { error: updateError } = await this.supabase
          .from('users')
          .update({
            phone_verified: true,
            phone_verification_code: null,
            phone_verification_expires_at: null,
            phone_verification_attempts: 0,
          })
          .eq('id', userId);

        if (updateError) {
          console.log('⚠️ Could not update verification status (schema may not be applied):', updateError.message);
        }
      } catch (dbError) {
        console.log('⚠️ Database update failed, but continuing with successful verification');
      }

      console.log('✅ Development phone verification completed successfully');

      return {
        success: true,
        message: 'Phone number verified successfully (development mode)',
        verified: true
      };

    } catch (error) {
      console.error('❌ Unexpected error in dev verifyCode:', error);
      return {
        success: true, // Always succeed in dev mode
        message: 'Phone number verified successfully (development mode)',
        verified: true
      };
    }
  }

  /**
   * Check if user's phone is verified
   */
  async isPhoneVerified(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('phone_verified')
        .eq('id', userId)
        .single();

      if (error) {
        console.log('⚠️ Could not check verification status, assuming verified for dev mode');
        return true; // Assume verified in dev mode
      }

      return data.phone_verified || false;
    } catch (error) {
      console.log('⚠️ Database check failed, assuming verified for dev mode');
      return true; // Assume verified in dev mode
    }
  }
}

const devPhoneVerificationService = new DevPhoneVerificationService();
export default devPhoneVerificationService;
