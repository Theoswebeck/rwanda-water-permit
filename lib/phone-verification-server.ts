/**
 * Server-side Phone Verification Service for Rwanda Water Resources Board
 * For use in API routes with server-side Supabase client
 */

import { createClient } from '@supabase/supabase-js';
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

export class ServerPhoneVerificationService {
  private supabase;

  constructor() {
    // Create server-side Supabase client with service role
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
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
      console.log(`📱 Server: Starting phone verification for user ${userId}, phone: ${phoneNumber}`);

      // Check if we're in development mode
      const isDevelopmentMode = process.env.PINDO_DEVELOPMENT_MODE === 'true' || 
                                process.env.NODE_ENV === 'development';
      
      console.log('🔧 Environment check:', {
        PINDO_DEVELOPMENT_MODE: process.env.PINDO_DEVELOPMENT_MODE,
        NODE_ENV: process.env.NODE_ENV,
        isDevelopmentMode
      });
      
      if (isDevelopmentMode) {
        console.log('🔧 Development mode: Skipping SMS sending');
      } else {
        // Check if Pindo is configured
        const pindoStatus = pindoClient.getStatus();
        if (!pindoStatus.configured) {
          return {
            success: false,
            message: 'SMS service is not configured',
            error: 'PINDO_NOT_CONFIGURED'
          };
        }
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

      if (checkError && checkError.code !== 'PGRST116') {
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
        const cooldownMinutes = 1;
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
      const maxAttempts = 3;
      if (existingVerification?.phone_verification_attempts >= maxAttempts) {
        return {
          success: false,
          message: 'Maximum verification attempts reached. Please try again later.',
          error: 'MAX_ATTEMPTS_EXCEEDED'
        };
      }

      // Generate verification code
      const verificationCode = isDevelopmentMode 
        ? (process.env.PINDO_DEV_CODE || '123456')
        : this.generateVerificationCode();
      const expiryMinutes = 10;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      let pindoResponse: PindoVerifyResponse | null = null;
      let requestId: number | undefined;

      if (isDevelopmentMode) {
        console.log('🔧 Development mode: Using test code:', verificationCode);
        console.log('✅ Mock SMS sent successfully (no actual SMS sent)');
      } else {
        // Send SMS with our verification code
        const message = `Your Rwanda Water Resources Board verification code is: ${verificationCode}. Valid for ${expiryMinutes} minutes. Do not share this code.`;
        
        try {
          const smsResponse = await pindoClient.sendSMS(phoneNumber, message, 'RWB');
          console.log('✅ SMS sent successfully:', smsResponse);
        } catch (smsError) {
          console.error('❌ Error sending SMS:', smsError);
          
          // In case of API error, fall back to development mode
          console.log('🔄 Falling back to development mode due to SMS error');
          return {
            success: true,
            message: 'Verification code generated (development fallback)',
            requestId: undefined,
          };
        }
      }

      // Update user's verification status
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          phone_verification_code: verificationCode,
          phone_verification_expires_at: expiresAt.toISOString(),
          phone_verification_attempts: (existingVerification?.phone_verification_attempts || 0) + 1,
          phone_verification_last_sent: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Error updating user verification status:', updateError);
        
        // If the error is because columns don't exist, return a helpful message
        if (updateError.message.includes('column') && updateError.message.includes('does not exist')) {
          return {
            success: false,
            message: 'Database schema needs to be updated. Please apply the phone verification schema.',
            error: 'SCHEMA_NOT_APPLIED'
          };
        }
        
        return {
          success: false,
          message: 'Error updating verification status',
          error: updateError.message
        };
      }

      return {
        success: true,
        message: 'Verification code sent successfully',
        requestId: requestId,
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
      console.log(`🔍 Server: Verifying code for user ${userId}`);

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

      // Verify the code
      if (!userVerification.phone_verification_code || userVerification.phone_verification_code !== submittedCode) {
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
}

// Create singleton instance
const serverPhoneVerificationService = new ServerPhoneVerificationService();

export default serverPhoneVerificationService;
