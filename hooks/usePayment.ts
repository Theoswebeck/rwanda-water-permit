// =============================================
// usePayment Hook
// Custom React hook for payment operations
// =============================================

import { useState, useCallback, useEffect } from 'react';
import type { Payment, PaymentStatus, InitiatePaymentRequest } from '@/types/payment';

interface UsePaymentOptions {
  applicationId?: string;
  autoFetch?: boolean;
  pollInterval?: number; // Auto-poll for status updates
}

interface UsePaymentReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
  initiatePayment: (data: InitiatePaymentRequest) => Promise<{ success: boolean; payment?: Payment; payment_url?: string; error?: string }>;
  checkStatus: (paymentId: string) => Promise<void>;
  refetch: () => Promise<void>;
  clearError: () => void;
}

export function usePayment(options: UsePaymentOptions = {}): UsePaymentReturn {
  const { applicationId, autoFetch = true, pollInterval } = options;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch payment for application
   */
  const fetchPayment = useCallback(async () => {
    if (!applicationId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/payments?application_id=${applicationId}`);
      const data = await response.json();

      if (data.success && data.payment) {
        setPayment(data.payment);
      } else {
        setPayment(null);
      }
    } catch (err) {
      console.error('Error fetching payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  /**
   * Initiate a new payment
   */
  const initiatePayment = useCallback(async (data: InitiatePaymentRequest) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🚀 Initiating payment...', data);

      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        let errorMsg = `Payment API error: ${response.status} ${response.statusText}`;
        try {
          const result = await response.json();
          errorMsg = result.error || errorMsg;
        } catch (e) {
          // Response wasn't JSON
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (result.success && result.payment) {
        setPayment(result.payment);
        console.log('✅ Payment initiated successfully');
        return {
          success: true,
          payment: result.payment,
          payment_url: result.payment_url,
        };
      } else {
        throw new Error(result.error || 'Payment initiation failed');
      }
    } catch (err) {
      let errorMessage = 'Failed to initiate payment';
      
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to connect to payment server. Please check your connection and try again.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      console.error('❌ Payment initiation error:', errorMessage, err);
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check payment status
   */
  const checkStatus = useCallback(async (paymentId: string) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Checking payment status...', paymentId);

      const response = await fetch(`/api/payments/${paymentId}/status`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to check payment status');
      }

      if (result.success && result.payment) {
        setPayment(result.payment);
        console.log('✅ Payment status:', result.payment.status);
      } else {
        throw new Error(result.error || 'Status check failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check payment status';
      console.error('❌ Status check error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refetch payment data
   */
  const refetch = useCallback(async () => {
    await fetchPayment();
  }, [fetchPayment]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Auto-fetch on mount if applicationId is provided
   */
  useEffect(() => {
    if (autoFetch && applicationId) {
      fetchPayment();
    }
  }, [autoFetch, applicationId, fetchPayment]);

  /**
   * Auto-poll for status updates if payment is pending/processing
   */
  useEffect(() => {
    if (!pollInterval || !payment || !payment.id) return;

    // Only poll if payment is in an active state
    if (payment.status !== 'pending' && payment.status !== 'processing') {
      return;
    }

    console.log('🔄 Starting payment status polling...');

    const intervalId = setInterval(() => {
      checkStatus(payment.id);
    }, pollInterval);

    return () => {
      console.log('⏹️  Stopping payment status polling');
      clearInterval(intervalId);
    };
  }, [pollInterval, payment, checkStatus]);

  return {
    payment,
    loading,
    error,
    initiatePayment,
    checkStatus,
    refetch,
    clearError,
  };
}

/**
 * Hook to get payment status for an application
 */
export function usePaymentStatus(applicationId: string) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPaymentStatus = async () => {
      if (!applicationId) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/payments?application_id=${applicationId}`);
        const data = await response.json();

        if (data.success && data.payment) {
          setPayment(data.payment);
        }
      } catch (error) {
        console.error('Error fetching payment status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentStatus();
  }, [applicationId]);

  return {
    payment,
    loading,
    isPaid: payment?.status === 'completed',
    isPending: payment?.status === 'pending' || payment?.status === 'processing',
    isFailed: payment?.status === 'failed',
  };
}

/**
 * Hook to check if payment is required for status change
 */
export function usePaymentRequired(applicationStatus: string) {
  // Payment is required for these statuses
  const requiresPayment = ['pending_payment', 'draft'].includes(applicationStatus);
  
  return {
    requiresPayment,
    canProceed: !requiresPayment,
  };
}

export default usePayment;

