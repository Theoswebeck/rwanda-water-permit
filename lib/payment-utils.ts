// =============================================
// Payment Utility Functions
// Rwanda Water Resources Board Water Permit System
// =============================================

import type { Payment, PaymentStatus, PaymentReceipt } from '@/types/payment';

// =============================================
// CONSTANTS
// =============================================

export const PAYMENT_CONFIG = {
  DEFAULT_FEE: 35000,
  CURRENCY: 'RWF',
  PAYMENT_TIMEOUT_MINUTES: 3 * 24 * 60,
  RECEIPT_PREFIX: 'RWB-RCPT',
};

// =============================================
// PAYMENT STATUS UTILITIES
// =============================================

/**
 * Check if payment is successful
 */
export const isPaymentSuccessful = (payment: Payment): boolean => {
  return payment.status === 'completed';
};

/**
 * Check if payment is pending
 */
export const isPaymentPending = (payment: Payment): boolean => {
  return payment.status === 'pending' || payment.status === 'processing';
};

/**
 * Check if payment failed
 */
export const isPaymentFailed = (payment: Payment): boolean => {
  return payment.status === 'failed' || payment.status === 'cancelled';
};

/**
 * Check if payment is expired
 */
export const isPaymentExpired = (payment: Payment): boolean => {
  if (!payment.expires_at) return false;
  return new Date(payment.expires_at) < new Date();
};

/**
 * Get payment expiry time
 */
export const getPaymentExpiryTime = (initiatedAt: Date | string): Date => {
  const initiated = typeof initiatedAt === 'string' ? new Date(initiatedAt) : initiatedAt;
  return new Date(initiated.getTime() + PAYMENT_CONFIG.PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
};

/**
 * Calculate time remaining for payment
 */
export const getPaymentTimeRemaining = (payment: Payment): number => {
  if (!payment.expires_at) return 0;
  const now = new Date().getTime();
  const expiry = new Date(payment.expires_at).getTime();
  return Math.max(0, expiry - now);
};

/**
 * Format time remaining as human-readable string
 */
export const formatTimeRemaining = (milliseconds: number): string => {
  if (milliseconds <= 0) return 'Expired';
  
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

// =============================================
// PAYMENT AMOUNT UTILITIES
// =============================================

/**
 * Format amount with currency
 */
export const formatPaymentAmount = (amount: number, currency: string = 'RWF'): string => {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Get application fee
 */
export const getApplicationFee = (): number => {
  const envFee = process.env.NEXT_PUBLIC_APPLICATION_FEE_AMOUNT;
  return envFee ? parseFloat(envFee) : PAYMENT_CONFIG.DEFAULT_FEE;
};

/**
 * Calculate total payment amount (with any additional fees)
 */
export const calculateTotalAmount = (baseAmount: number, additionalFees: number = 0): number => {
  return baseAmount + additionalFees;
};

// =============================================
// RECEIPT UTILITIES
// =============================================

/**
 * Generate receipt number
 */
export const generateReceiptNumber = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `${PAYMENT_CONFIG.RECEIPT_PREFIX}-${timestamp}-${random}`;
};

/**
 * Format receipt data
 */
export const formatReceiptData = (
  payment: Payment,
  applicationNumber?: string,
  applicantName?: string
): Record<string, any> => {
  return {
    receiptNumber: generateReceiptNumber(),
    paymentId: payment.id,
    applicationId: payment.application_id,
    applicationNumber: applicationNumber || 'N/A',
    
    // Payment details
    amount: payment.amount,
    currency: payment.currency,
    paymentMethod: payment.payment_method || 'Unknown',
    transactionId: payment.irembo_transaction_id || payment.irembo_payment_ref,
    
    // Customer details
    customerName: applicantName || payment.customer_name || 'N/A',
    customerEmail: payment.customer_email || 'N/A',
    customerPhone: payment.customer_phone || 'N/A',
    
    // Dates
    paidDate: payment.completed_at || new Date().toISOString(),
    issuedDate: new Date().toISOString(),
    
    // Additional info
    description: payment.description || 'Water Permit Application Fee',
    status: payment.status,
  };
};

// =============================================
// PAYMENT VALIDATION
// =============================================

/**
 * Validate payment amount
 */
export const validatePaymentAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than zero' };
  }
  
  if (amount < 100) {
    return { valid: false, error: 'Payment amount is too small' };
  }
  
  if (amount > 10000000) {
    return { valid: false, error: 'Payment amount exceeds maximum allowed' };
  }
  
  return { valid: true };
};

/**
 * Validate customer email
 */
export const validateCustomerEmail = (email: string): { valid: boolean; error?: string } => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }
  
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
};

/**
 * Validate customer phone
 */
export const validateCustomerPhone = (phone: string): { valid: boolean; error?: string } => {
  // Rwanda phone format: +250 7XX XXX XXX or 07XX XXX XXX
  const phoneRegex = /^(\+?250|0)?7[0-9]{8}$/;
  
  if (!phone) {
    return { valid: false, error: 'Phone number is required' };
  }
  
  const cleanPhone = phone.replace(/\s+/g, '');
  
  if (!phoneRegex.test(cleanPhone)) {
    return { valid: false, error: 'Invalid Rwanda phone number format' };
  }
  
  return { valid: true };
};

/**
 * Normalize Rwanda phone number
 */
export const normalizeRwandaPhone = (phone: string): string => {
  // Remove spaces and non-numeric characters except +
  let cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // Ensure it starts with +250
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '+250' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('250')) {
    cleanPhone = '+' + cleanPhone;
  } else if (!cleanPhone.startsWith('+250')) {
    cleanPhone = '+250' + cleanPhone;
  }
  
  return cleanPhone;
};

// =============================================
// PAYMENT RETRY LOGIC
// =============================================

/**
 * Check if payment can be retried
 */
export const canRetryPayment = (payment: Payment): boolean => {
  // Can retry if failed, cancelled, or expired
  return (
    payment.status === 'failed' || 
    payment.status === 'cancelled' || 
    isPaymentExpired(payment)
  );
};

/**
 * Get retry message for failed payment
 */
export const getRetryMessage = (payment: Payment): string => {
  if (payment.status === 'failed') {
    return 'Payment failed. Please try again with a different payment method.';
  }
  
  if (payment.status === 'cancelled') {
    return 'Payment was cancelled. You can retry the payment.';
  }
  
  if (isPaymentExpired(payment)) {
    return 'Payment session expired. Please initiate a new payment.';
  }
  
  return 'You can retry the payment.';
};

// =============================================
// PAYMENT STATUS MAPPING
// =============================================

/**
 * Map IremboPay status to internal status
 * IremboPay uses: NEW, PAID, FAILED, CANCELLED, REFUNDED
 */
export const mapIremboPayStatus = (iremboStatus: string): PaymentStatus => {
  const statusMap: Record<string, PaymentStatus> = {
    'NEW': 'pending',
    'PENDING': 'pending',
    'PROCESSING': 'processing',
    'PAID': 'completed',
    'SUCCESS': 'completed',
    'COMPLETED': 'completed',
    'FAILED': 'failed',
    'CANCELLED': 'cancelled',
    'REFUNDED': 'refunded',
  };
  
  return statusMap[iremboStatus.toUpperCase()] || 'pending';
};

/**
 * Get application status based on payment status
 */
export const getApplicationStatusFromPayment = (paymentStatus: PaymentStatus): string => {
  const statusMap: Record<PaymentStatus, string> = {
    'pending': 'pending_payment',
    'processing': 'pending_payment',
    'completed': 'submitted',
    // If payment fails, the application should remain a draft so the applicant can retry.
    'failed': 'draft',
    'cancelled': 'draft',
    'refunded': 'pending_payment',
  };
  
  return statusMap[paymentStatus] || 'pending_payment';
};

// =============================================
// PAYMENT NOTIFICATION UTILITIES
// =============================================

/**
 * Get payment notification message
 */
export const getPaymentNotificationMessage = (
  paymentStatus: PaymentStatus,
  applicationNumber?: string
): { title: string; message: string; type: 'success' | 'error' | 'warning' | 'info' } => {
  switch (paymentStatus) {
    case 'completed':
      return {
        title: 'Payment Successful',
        message: `Your payment for application ${applicationNumber || ''} has been received. Your application is now being processed.`,
        type: 'success',
      };
    
    case 'failed':
      return {
        title: 'Payment Failed',
        message: 'Your payment could not be processed. Please try again or use a different payment method.',
        type: 'error',
      };
    
    case 'processing':
      return {
        title: 'Payment Processing',
        message: 'Your payment is being processed. This may take a few moments.',
        type: 'info',
      };
    
    case 'cancelled':
      return {
        title: 'Payment Cancelled',
        message: 'Your payment was cancelled. You can retry the payment when ready.',
        type: 'warning',
      };
    
    default:
      return {
        title: 'Payment Pending',
        message: 'Please complete your payment to proceed with your application.',
        type: 'info',
      };
  }
};

// =============================================
// PAYMENT ANALYTICS
// =============================================

/**
 * Calculate payment statistics
 */
export const calculatePaymentStatistics = (payments: Payment[]) => {
  const stats = {
    total: payments.length,
    completed: 0,
    pending: 0,
    failed: 0,
    totalAmount: 0,
    successRate: 0,
  };
  
  payments.forEach(payment => {
    if (payment.status === 'completed') {
      stats.completed++;
      stats.totalAmount += payment.amount;
    } else if (payment.status === 'pending' || payment.status === 'processing') {
      stats.pending++;
    } else if (payment.status === 'failed') {
      stats.failed++;
    }
  });
  
  if (stats.total > 0) {
    stats.successRate = (stats.completed / stats.total) * 100;
  }
  
  return stats;
};

// =============================================
// DATE/TIME UTILITIES
// =============================================

/**
 * Format payment date
 */
export const formatPaymentDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-RW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

/**
 * Get relative time (e.g., "2 hours ago")
 */
export const getRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};

// =============================================
// EXPORTS
// =============================================

export default {
  isPaymentSuccessful,
  isPaymentPending,
  isPaymentFailed,
  isPaymentExpired,
  formatPaymentAmount,
  getApplicationFee,
  generateReceiptNumber,
  validatePaymentAmount,
  validateCustomerEmail,
  validateCustomerPhone,
  normalizeRwandaPhone,
  canRetryPayment,
  mapIremboPayStatus,
  getApplicationStatusFromPayment,
  getPaymentNotificationMessage,
  formatPaymentDate,
  getRelativeTime,
};

