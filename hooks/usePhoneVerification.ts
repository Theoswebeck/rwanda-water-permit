"use client";

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface UsePhoneVerificationReturn {
  sendVerificationCode: (phoneNumber: string) => Promise<{ success: boolean; message: string; requestId?: number }>;
  verifyCode: (code: string, phoneNumber: string, requestId?: number) => Promise<{ success: boolean; message: string; verified?: boolean }>;
  isLoading: boolean;
  error: string | null;
  isVerified: boolean;
  checkVerificationStatus: () => Promise<boolean>;
}

export function usePhoneVerification(): UsePhoneVerificationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const { user } = useAuth();

  const sendVerificationCode = useCallback(async (phoneNumber: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id || null, // Optional for registration flow
          phoneNumber: phoneNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      if (data.success) {
        setError(null);
        return {
          success: true,
          message: data.message || 'Verification code sent successfully',
          requestId: data.requestId,
        };
      } else {
        setError(data.message || 'Failed to send verification code');
        return {
          success: false,
          message: data.message || 'Failed to send verification code',
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      return {
        success: false,
        message: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyCode = useCallback(async (code: string, phoneNumber: string, requestId?: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/verify-phone/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id || null, // Optional for registration flow
          phoneNumber: phoneNumber,
          code: code,
          requestId: requestId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify code');
      }

      if (data.success && data.verified) {
        setIsVerified(true);
        setError(null);
        return {
          success: true,
          message: data.message || 'Phone number verified successfully',
          verified: true,
        };
      } else {
        setError(data.message || 'Invalid verification code');
        return {
          success: false,
          message: data.message || 'Invalid verification code',
          verified: false,
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      return {
        success: false,
        message: errorMessage,
        verified: false,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkVerificationStatus = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      return false;
    }

    try {
      const response = await fetch('/api/auth/verify-phone/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (response.ok && data.verified) {
        setIsVerified(true);
        return true;
      }

      setIsVerified(false);
      return false;
    } catch (err) {
      console.error('Error checking verification status:', err);
      setIsVerified(false);
      return false;
    }
  }, [user?.id]);

  return {
    sendVerificationCode,
    verifyCode,
    isLoading,
    error,
    isVerified,
    checkVerificationStatus,
  };
}
