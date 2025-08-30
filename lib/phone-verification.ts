/**
 * Phone Verification Service for Rwanda Water Board
 * Integrates Pindo.io SMS service with Supabase database
 */

import { createClient } from '@/lib/supabase/client';
import pindoClient, { PindoVerifyResponse } from '@/lib/pindo-client';

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
  pindo_response?: any;
  cost_incurred?: number;
  network_operator?: string;
  created_at: string;
  updated_at: string;
}

export class PhoneVerificationService {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Send verification code to phone number
   */
  async sendVerificationCode(
    userId: string, 
    phoneNumber: string, 
    useCustomCode: boolean = false
  ): Promise<VerificationResult> {
    try {
      console.log(`📱 Starting phone verification for user ${userId}, phone: ${phoneNumber}`);

      // Check if Pindo is configured
      const pindoStatus = pindoClient.getStatus();
      if (!pindoStatus.configured) {
        return {
          success: false,
          message: 'SMS service is not configured',
          error: 'PINDO_NOT_CONFIGURED'
        };
      }

      // Validate phone number format
      if (!pindoClient.isValidRwandanPhone(phoneNumber)) {
        return {
          success: false,
          message: 'Invalid Rwandan phone number format',
          error: 'INVALID_PHONE_FORMAT'
        };
      }

      // Check for existing active verification
      const { data: existingVerification, error: checkError } = await this.supabase
        .from('users')
        .select('phone_verification_code, phone_verification_expires_at, phone_verification_attempts, phone_verification_last_sent')
        .eq('id', userId)
        .single();

      if (checkError) {
        console.error('❌ Error checking existing verification:', checkError);
        return {
          success: false,
          message: 'Error checking verification status',
          error: checkError.message
        };
      }

      // Check cooldown period
      if (existingVerification?.phone_verification_last_sent) {
        const lastSent = new Date(existingVerification.phone_verification_last_sent);
        const now = new Date();
        const cooldownMinutes = 1; // Get from system settings if needed
        const timeDiff = (now.getTime() - lastSent.getTime()) / (1000 * 60);
        
        if (timeDiff < cooldownMinutes) {
          const waitTime = Math.ceil(cooldownMinutes - timeDiff);
          return {
            success: false,
            message: `Please wait ${waitTime} minute(s) before requesting another code`,
            error: 'COOLDOWN_ACTIVE'
          };
        }
      }

      // Check max attempts
      const maxAttempts = 3; // Get from system settings if needed
      if (existingVerification?.phone_verification_attempts >= maxAttempts) {
        return {
          success: false,
          message: 'Maximum verification attempts reached. Please try again later.',
          error: 'MAX_ATTEMPTS_EXCEEDED'
        };
      }

      // Generate verification code
      const verificationCode = this.generateVerificationCode();
      const expiryMinutes = 10; // Get from system settings if needed
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      let pindoResponse: PindoVerifyResponse | null = null;
      let requestId: number | undefined;

      if (useCustomCode) {
        // Send custom SMS with our verification code
        const message = `Your Rwanda Water Board verification code is: ${verificationCode}. Valid for ${expiryMinutes} minutes. Do not share this code.`;
        
        try {
          const smsResponse = await pindoClient.sendSMS(phoneNumber, message, 'RWB');
          console.log('✅ Custom SMS sent successfully:', smsResponse);
          
          // For custom SMS, we don't get a request_id for verification
          // We'll track verification ourselves
        } catch (smsError) {
          console.error('❌ Error sending custom SMS:', smsError);
          return {
            success: false,
            message: 'Failed to send verification SMS',
            error: 'SMS_SEND_FAILED'
          };
        }
      } else {
        // Use Pindo's built-in verification system
        try {
          pindoResponse = await pindoClient.generateVerificationPIN(phoneNumber, 'RWB');
          console.log('✅ Pindo verification PIN sent:', pindoResponse);
          
          if (pindoResponse.message !== 'success') {
            return {
              success: false,
              message: 'Failed to send verification code',
              error: 'PINDO_VERIFY_FAILED'
            };
          }
          
          requestId = pindoResponse.request_id;
        } catch (pindoError) {
          console.error('❌ Error with Pindo verification:', pindoError);
          
          // Fallback to custom SMS
          console.log('🔄 Falling back to custom SMS...');
          const message = `Your Rwanda Water Board verification code is: ${verificationCode}. Valid for ${expiryMinutes} minutes. Do not share this code.`;
          
          try {
            await pindoClient.sendSMS(phoneNumber, message, 'RWB');
            console.log('✅ Fallback SMS sent successfully');
          } catch (fallbackError) {
            console.error('❌ Fallback SMS also failed:', fallbackError);
            return {
              success: false,
              message: 'SMS service temporarily unavailable',
              error: 'SMS_SERVICE_UNAVAILABLE'
            };
          }
        }
      }

      // Update user's verification status
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          phone_verification_code: useCustomCode ? verificationCode : null,
          phone_verification_expires_at: expiresAt.toISOString(),
          phone_verification_attempts: (existingVerification?.phone_verification_attempts || 0) + 1,
          phone_verification_last_sent: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Error updating user verification status:', updateError);
        return {
          success: false,
          message: 'Error updating verification status',
          error: updateError.message
        };
      }

      // Log the verification attempt
      const { error: logError } = await this.supabase
        .from('phone_verification_logs')
        .insert({
          user_id: userId,
          phone_number: phoneNumber,
          verification_code: useCustomCode ? verificationCode : 'PINDO_MANAGED',
          request_id: requestId?.toString(),
          status: 'sent',
          verification_method: useCustomCode ? 'custom_sms' : 'pindo_verify',
          attempts_count: 1,
          expires_at: expiresAt.toISOString(),
          pindo_response: pindoResponse,
          network_operator: pindoResponse?.network,
        });

      if (logError) {
        console.error('❌ Error logging verification attempt:', logError);
        // Don't fail the request if logging fails
      }

      return {
        success: true,
        message: 'Verification code sent successfully',
        requestId: requestId,
        remainingBalance: pindoResponse?.remaining_balance,
      };

    } catch (error) {
      console.error('❌ Unexpected error in sendVerificationCode:', error);
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
      console.log(`🔍 Verifying code for user ${userId}, requestId: ${requestId}`);

      // Get user's current verification status
      const { data: userVerification, error: userError } = await this.supabase
        .from('users')
        .select('phone_verification_code, phone_verification_expires_at, phone, phone_verified')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('❌ Error fetching user verification status:', userError);
        return {
          success: false,
          message: 'Error checking verification status',
          error: userError.message
        };
      }

      // Check if already verified
      if (userVerification.phone_verified) {
        return {
          success: true,
          message: 'Phone number already verified',
          verified: true
        };
      }

      // Check if verification has expired
      if (userVerification.phone_verification_expires_at) {
        const expiresAt = new Date(userVerification.phone_verification_expires_at);
        if (new Date() > expiresAt) {
          return {
            success: false,
            message: 'Verification code has expired',
            error: 'CODE_EXPIRED'
          };
        }
      }

      let verificationSuccessful = false;

      if (requestId && requestId > 0) {
        // Use Pindo's verification system
        try {
          const pindoResult = await pindoClient.verifyPIN(submittedCode, requestId);
          console.log('✅ Pindo verification result:', pindoResult);
          
          verificationSuccessful = pindoResult.message === 'success';
        } catch (pindoError) {
          console.error('❌ Error with Pindo verification:', pindoError);
          
          // Fallback to our own code comparison
          if (userVerification.phone_verification_code) {
            verificationSuccessful = userVerification.phone_verification_code === submittedCode;
            console.log('🔄 Using fallback code verification');
          }
        }
      } else {
        // Use our own verification system
        if (userVerification.phone_verification_code) {
          verificationSuccessful = userVerification.phone_verification_code === submittedCode;
        } else {
          return {
            success: false,
            message: 'No active verification code found',
            error: 'NO_ACTIVE_CODE'
          };
        }
      }

      if (!verificationSuccessful) {
        // Log failed attempt
        await this.supabase
          .from('phone_verification_logs')
          .insert({
            user_id: userId,
            phone_number: userVerification.phone || '',
            verification_code: submittedCode,
            request_id: requestId?.toString(),
            status: 'failed',
            verification_method: requestId ? 'pindo_verify' : 'custom_sms',
            attempts_count: 1,
            expires_at: userVerification.phone_verification_expires_at || new Date().toISOString(),
          });

        return {
          success: false,
          message: 'Invalid verification code',
          error: 'INVALID_CODE'
        };
      }

      // Verification successful - update user
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
        console.error('❌ Error updating user verification success:', updateError);
        return {
          success: false,
          message: 'Error updating verification status',
          error: updateError.message
        };
      }

      // Log successful verification
      await this.supabase
        .from('phone_verification_logs')
        .insert({
          user_id: userId,
          phone_number: userVerification.phone || '',
          verification_code: submittedCode,
          request_id: requestId?.toString(),
          status: 'verified',
          verification_method: requestId ? 'pindo_verify' : 'custom_sms',
          attempts_count: 1,
          verified_at: new Date().toISOString(),
          expires_at: userVerification.phone_verification_expires_at || new Date().toISOString(),
        });

      console.log('✅ Phone verification completed successfully');

      return {
        success: true,
        message: 'Phone number verified successfully',
        verified: true
      };

    } catch (error) {
      console.error('❌ Unexpected error in verifyCode:', error);
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
      const { data, error } = await this.supabase
        .from('users')
        .select('phone_verified')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Error checking phone verification status:', error);
        return false;
      }

      return data.phone_verified || false;
    } catch (error) {
      console.error('❌ Unexpected error checking phone verification:', error);
      return false;
    }
  }

  /**
   * Generate a 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Clean up expired verification codes
   */
  async cleanupExpiredCodes(): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('cleanup_expired_phone_verifications');
      
      if (error) {
        console.error('❌ Error cleaning up expired codes:', error);
      } else {
        console.log('✅ Expired verification codes cleaned up');
      }
    } catch (error) {
      console.error('❌ Unexpected error cleaning up codes:', error);
    }
  }
}

// Create singleton instance
const phoneVerificationService = new PhoneVerificationService();

export default phoneVerificationService;

export type { VerificationResult, VerificationCheckResult, PhoneVerificationLog };
