// =============================================
// IremboPay API Client
// Rwanda Water Board Water Permit System
// =============================================

import crypto from 'crypto';
import type {
  IremboPayInitiateRequest,
  IremboPayInitiateResponse,
  IremboPayStatusResponse,
  IremboPayWebhookPayload,
} from '@/types/payment';

// =============================================
// CONFIGURATION
// =============================================

const getIsSandbox = (): boolean => {
  // 1. Explicitly check for sandbox URL
  if (process.env.IREMBOPAY_API_URL) {
    return process.env.IREMBOPAY_API_URL.includes('sandbox');
  }
  // 2. Check for explicit sandbox flag
  if (process.env.IREMBOPAY_SANDBOX) {
    return process.env.IREMBOPAY_SANDBOX === 'true';
  }
  // 3. Default to sandbox mode in local development if nothing is set
  return process.env.NODE_ENV === 'development';
};

const IREMBOPAY_CONFIG = {
  // Sandbox URLs
  sandbox: {
    apiUrl: 'https://api.sandbox.irembopay.com',
    dashboardUrl: 'https://dashboard.sandbox.irembopay.com',
    inlineScript: 'https://dashboard.sandbox.irembopay.com/assets/payment/inline.js',
  },
  // Production URLs
  production: {
    apiUrl: 'https://api.irembopay.com',
    dashboardUrl: 'https://dashboard.irembopay.com',
    inlineScript: 'https://dashboard.irembopay.com/assets/payment/inline.js',
  },
  // Environment - use IREMBOPAY_API_URL to determine sandbox vs production
  isSandbox: getIsSandbox(),
  apiKey: process.env.IREMBOPAY_SECRET_KEY || process.env.IREMBOPAY_API_KEY || '',
  publicKey: process.env.NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY || '',
  webhookSecret: process.env.IREMBOPAY_WEBHOOK_SECRET || '',
};

// Get current environment URLs
const getCurrentConfig = () => {
  return IREMBOPAY_CONFIG.isSandbox 
    ? IREMBOPAY_CONFIG.sandbox 
    : IREMBOPAY_CONFIG.production;
};

// =============================================
// API CLIENT CLASS
// =============================================

export class IremboPayClient {
  private apiKey: string;
  private baseUrl: string;
  private isSandbox: boolean;

  constructor(apiKey?: string, isSandbox?: boolean) {
    this.apiKey = apiKey || IREMBOPAY_CONFIG.apiKey;
    this.isSandbox = isSandbox ?? IREMBOPAY_CONFIG.isSandbox;
    this.baseUrl = getCurrentConfig().apiUrl;

    if (!this.apiKey) {
      throw new Error('IremboPay API key is required');
    }
    
    // Debug logging
    console.log('🔧 IremboPay Client Initialized:', {
      isSandbox: this.isSandbox,
      baseUrl: this.baseUrl,
      apiKeyPrefix: this.apiKey.substring(0, 20) + '...',
      apiKeyLength: this.apiKey.length,
    });
  }

  // =============================================
  // PRIVATE METHODS
  // =============================================

  /**
   * Make HTTP request to IremboPay API
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'irembopay-secretKey': this.apiKey, // Corrected header key
      'X-API-Version': '2',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`🌐 IremboPay API Request: ${method} ${url}`);
      console.log('📋 API Key Being Used:', this.apiKey.substring(0, 15) + '...' + this.apiKey.substring(this.apiKey.length - 5));
      if (body) {
        console.log('📦 Request Body:', JSON.stringify(body, null, 2));
      }
      
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        console.error('❌ IremboPay API Error:', data);
        throw new Error(data.error?.message || data.message || 'IremboPay API request failed');
      }

      console.log('✅ IremboPay API Response:', data);
      return data as T;
    } catch (error) {
      console.error('❌ IremboPay API Request Failed:', error);
      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `RWB-${timestamp}-${random}`.toUpperCase();
  }

  // =============================================
  // PUBLIC API METHODS
  // =============================================

  /**
   * Initiate a new payment
   */
  async initiatePayment(
    request: Omit<IremboPayInitiateRequest, 'transactionId'>
  ): Promise<IremboPayInitiateResponse> {
    const transactionId = this.generateRequestId();
    
    const payload: IremboPayInitiateRequest = {
      ...request,
      transactionId,
    };

    console.log('💳 Initiating IremboPay payment:', {
      transactionId,
      paymentItems: payload.paymentItems,
      customer: payload.customer?.email,
    });

    try {
      const response = await this.request<IremboPayInitiateResponse>(
        '/payments/invoices',
        'POST',
        payload
      );

      if (response.success && response.data) {
        console.log('✅ Payment initiated successfully:', response.data.payment_ref);
      }

      return response;
    } catch (error) {
      console.error('❌ Payment initiation failed:', error);
      return {
        success: false,
        error: {
          code: 'INITIATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to initiate payment',
        },
      };
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentRef: string): Promise<IremboPayStatusResponse> {
    console.log('🔍 Checking payment status:', paymentRef);

    try {
      // For invoices, use the invoices endpoint
      const response = await this.request<IremboPayStatusResponse>(
        `/payments/invoices/${paymentRef}`,
        'GET'
      );

      if (response.success && response.data) {
        console.log('✅ Payment status:', response.data.status);
      }

      return response;
    } catch (error) {
      console.error('❌ Failed to get payment status:', error);
      return {
        success: false,
        error: {
          code: 'STATUS_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check payment status',
        },
      };
    }
  }

  /**
   * Verify payment by transaction ID
   */
  async verifyPayment(transactionId: string): Promise<IremboPayStatusResponse> {
    console.log('🔐 Verifying payment:', transactionId);

    try {
      const response = await this.request<IremboPayStatusResponse>(
        `/payments/transaction/${transactionId}/verify`,
        'GET'
      );

      return response;
    } catch (error) {
      console.error('❌ Payment verification failed:', error);
      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to verify payment',
        },
      };
    }
  }

  // =============================================
  // WEBHOOK UTILITIES
  // =============================================

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(
    payload: string | object,
    signature: string,
    secret?: string
  ): boolean {
    const webhookSecret = secret || IREMBOPAY_CONFIG.webhookSecret;
    
    if (!webhookSecret) {
      console.warn('⚠️ Webhook secret not configured');
      return false;
    }

    try {
      const payloadString = typeof payload === 'string' 
        ? payload 
        : JSON.stringify(payload);

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payloadString)
        .digest('hex');

      const isValid = expectedSignature === signature;
      
      if (isValid) {
        console.log('✅ Webhook signature validated successfully');
      } else {
        console.error('❌ Invalid webhook signature');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Webhook signature validation error:', error);
      return false;
    }
  }

  /**
   * Parse webhook payload
   */
  parseWebhook(body: string | object): IremboPayWebhookPayload | null {
    try {
      const payload = typeof body === 'string' ? JSON.parse(body) : body;
      
      console.log('📨 Parsing webhook payload:', payload);

      // Validate required fields
      if (!payload.event || !payload.data) {
        console.error('❌ Invalid webhook payload: missing required fields');
        return null;
      }

      return payload as IremboPayWebhookPayload;
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error);
      return null;
    }
  }
}

// =============================================
// SINGLETON INSTANCE
// =============================================

let iremboPayClientInstance: IremboPayClient | null = null;

export const getIremboPayClient = (): IremboPayClient => {
  if (!iremboPayClientInstance) {
    iremboPayClientInstance = new IremboPayClient();
  }
  return iremboPayClientInstance;
};

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Get IremboPay inline script URL
 */
export const getIremboPayInlineScriptUrl = (): string => {
  return getCurrentConfig().inlineScript;
};

/**
 * Get IremboPay dashboard URL
 */
export const getIremboPayDashboardUrl = (): string => {
  return getCurrentConfig().dashboardUrl;
};

/**
 * Format amount for IremboPay (ensure proper decimal places)
 */
export const formatAmountForIremboPay = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

/**
 * Generate payment reference
 */
export const generatePaymentReference = (applicationNumber?: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  
  if (applicationNumber) {
    return `PAY-${applicationNumber}-${random}`;
  }
  
  return `PAY-${timestamp}-${random}`;
};

/**
 * Check if IremboPay is properly configured
 */
export const isIremboPayConfigured = (): boolean => {
  return !!(
    IREMBOPAY_CONFIG.apiKey && 
    IREMBOPAY_CONFIG.publicKey
  );
};

/**
 * Get payment method display name
 */
export const getPaymentMethodDisplayName = (method: string): string => {
  const methodNames: Record<string, string> = {
    mobile_money: 'Mobile Money',
    card: 'Debit/Credit Card',
    bank_transfer: 'Bank Transfer',
    ussd: 'USSD Banking',
    cash: 'Cash',
    mtn_momo: 'MTN Mobile Money',
    airtel_money: 'Airtel Money',
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
  };

  return methodNames[method] || method;
};

/**
 * Get payment status display info
 */
export const getPaymentStatusInfo = (status: string): {
  label: string;
  color: string;
  icon: string;
} => {
  const statusInfo: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pending', color: 'yellow', icon: '⏳' },
    processing: { label: 'Processing', color: 'blue', icon: '🔄' },
    completed: { label: 'Completed', color: 'green', icon: '✅' },
    failed: { label: 'Failed', color: 'red', icon: '❌' },
    cancelled: { label: 'Cancelled', color: 'gray', icon: '🚫' },
    refunded: { label: 'Refunded', color: 'purple', icon: '↩️' },
  };

  return statusInfo[status] || { label: status, color: 'gray', icon: '❓' };
};

// =============================================
// EXPORT DEFAULT
// =============================================

export default IremboPayClient;

