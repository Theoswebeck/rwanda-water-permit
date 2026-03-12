// =============================================
// usePayment Hook
// Custom React hook for payment operations
// =============================================

import { useState, useCallback, useEffect } from 'react';
import type { Payment, PaymentStatus, InitiatePaymentRequest } from '@/types/payment';

const isDev = process.env.NODE_ENV !== 'production';
const debugLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};

interface UsePaymentOptions {
  applicationId?: string;
  waterUseReportId?: string;
  autoFetch?: boolean;
  pollInterval?: number; // Auto-poll for status updates
}

interface UsePaymentReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
  statusDebug: Record<string, unknown> | null;
  initiatePayment: (data: InitiatePaymentRequest) => Promise<{ success: boolean; payment?: Payment; payment_url?: string; error?: string }>;
  checkStatus: (paymentId: string) => Promise<Payment | null>;
  triggerAcceleratedPolling: (durationMs?: number, intervalMs?: number) => void;
  refetch: () => Promise<void>;
  clearError: () => void;
}

export function usePayment(options: UsePaymentOptions = {}): UsePaymentReturn {
  const { applicationId, waterUseReportId, autoFetch = true, pollInterval } = options;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusDebug, setStatusDebug] = useState<Record<string, unknown> | null>(null);
  const [acceleratedPollingConfig, setAcceleratedPollingConfig] = useState<{
    until: number;
    intervalMs: number;
  } | null>(null);

  /**
   * Fetch payment for application
   */
  const fetchPayment = useCallback(async () => {
    if (!applicationId && !waterUseReportId) return;

    try {
      setLoading(true);
      setError(null);

      const query = waterUseReportId
        ? `water_use_report_id=${waterUseReportId}`
        : `application_id=${applicationId}`;
      const response = await fetch(`/api/payments?${query}`);
      
      // Check if response is OK before parsing JSON
      if (!response.ok) {
        // Don't treat 404 as an error - just means no payment exists yet
        if (response.status === 404) {
          setPayment(null);
          return;
        }
        console.warn('Payment fetch failed with status:', response.status);
        setPayment(null);
        return;
      }

      const data = await response.json();

      if (data.success && data.payment) {
        setPayment(data.payment);
        setStatusDebug(null);
      } else {
        setPayment(null);
        setStatusDebug(null);
      }
    } catch (err) {
      console.error('Error fetching payment:', err);
      // Don't show error to user for fetch failures - just log it
      // This prevents showing JSON parse errors for missing payments
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId, waterUseReportId]);

  /**
   * Initiate a new payment
   */
  const initiatePayment = useCallback(async (data: InitiatePaymentRequest) => {
    try {
      setLoading(true);
      setError(null);

      debugLog('🚀 Initiating payment...', data);

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
        setStatusDebug(null);
        debugLog('✅ Payment initiated successfully');
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
  const checkStatus = useCallback(async (paymentId: string): Promise<Payment | null> => {
    try {
      setLoading(true);
      setError(null);

      debugLog('🔍 Checking payment status...', paymentId);

      const response = await fetch(`/api/payments/${paymentId}/status`);
      
      // Check if response is OK before parsing JSON
      if (!response.ok) {
        let errorMsg = `Status check failed: ${response.status}`;
        try {
          const result = await response.json();
          errorMsg = result.error || errorMsg;
        } catch {
          // Response wasn't JSON - ignore parse error
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (result.success && result.payment) {
        setPayment(result.payment);
        setStatusDebug(
          result.status_debug && typeof result.status_debug === 'object'
            ? (result.status_debug as Record<string, unknown>)
            : null
        );
        debugLog('✅ Payment status:', result.payment.status);
        return result.payment;
      } else {
        throw new Error(result.error || 'Status check failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check payment status';
      console.error('❌ Status check error:', errorMessage);
      setError(errorMessage);
      return null;
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

  const triggerAcceleratedPolling = useCallback((durationMs = 30000, intervalMs = 1500) => {
    const normalizedDuration = Math.max(5000, durationMs);
    const normalizedInterval = Math.max(750, intervalMs);
    setAcceleratedPollingConfig({
      until: Date.now() + normalizedDuration,
      intervalMs: normalizedInterval,
    });
    debugLog('⚡ Accelerated polling enabled:', {
      durationMs: normalizedDuration,
      intervalMs: normalizedInterval,
    });
  }, []);

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
    if (autoFetch && (applicationId || waterUseReportId)) {
      fetchPayment();
    }
  }, [autoFetch, applicationId, waterUseReportId, fetchPayment]);

  /**
   * Auto-poll for status updates if payment is pending/processing
   */
  useEffect(() => {
    if (!acceleratedPollingConfig) return;

    const remainingMs = acceleratedPollingConfig.until - Date.now();
    if (remainingMs <= 0) {
      setAcceleratedPollingConfig(null);
      debugLog('⚡ Accelerated polling window ended');
      return;
    }

    const timeoutId = setTimeout(() => {
      setAcceleratedPollingConfig(null);
      debugLog('⚡ Accelerated polling disabled');
    }, remainingMs);

    return () => clearTimeout(timeoutId);
  }, [acceleratedPollingConfig]);

  /**
   * Auto-poll for status updates if payment is pending/processing
   */
  useEffect(() => {
    if (!pollInterval || !payment || !payment.id) return;

    // Only poll if payment is in an active state
    const shouldPoll = payment.status === 'pending' || payment.status === 'processing';
    
    if (!shouldPoll) {
      debugLog('⏹️  Not polling - payment status is:', payment.status);
      return;
    }

    const now = Date.now();
    const acceleratedActive = !!acceleratedPollingConfig && acceleratedPollingConfig.until > now;
    const effectiveInterval = acceleratedActive ? acceleratedPollingConfig.intervalMs : pollInterval;

    debugLog('🔄 Starting payment status polling for payment:', payment.id, {
      effectiveInterval,
      acceleratedActive,
    });

    const intervalId = setInterval(() => {
      checkStatus(payment.id);
    }, effectiveInterval);

    return () => {
      debugLog('⏹️  Stopping payment status polling');
      clearInterval(intervalId);
    };
  }, [
    pollInterval,
    payment?.id,
    payment?.status,
    checkStatus,
    acceleratedPollingConfig?.until,
    acceleratedPollingConfig?.intervalMs,
  ]);

  return {
    payment,
    loading,
    error,
    statusDebug,
    initiatePayment,
    checkStatus,
    triggerAcceleratedPolling,
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
        
        // Check if response is OK before parsing JSON
        if (!response.ok) {
          console.warn('Payment status fetch failed:', response.status);
          setPayment(null);
          return;
        }

        const data = await response.json();

        if (data.success && data.payment) {
          setPayment(data.payment);
        } else {
          setPayment(null);
        }
      } catch (error) {
        console.error('Error fetching payment status:', error);
        setPayment(null);
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

