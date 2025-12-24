/**
 * Pindo.io SMS API Client for Rwanda Water Resources Board
 * Handles SMS verification and communication via Pindo.io API
 */

interface PindoSMSRequest {
  to: string;
  text: string;
  sender: string;
}

interface PindoBulkSMSRequest {
  recipients: Array<{
    phonenumber: string;
    name?: string;
  }>;
  text: string;
  sender: string;
}

interface PindoVerifyRequest {
  brand: string;
  number: string;
}

interface PindoVerifyCheckRequest {
  code: string;
  request_id: number;
}

interface PindoResponse {
  message?: string;
  network?: string;
  remaining_balance?: number;
  request_id?: number;
  status?: string;
  error?: string;
}

interface PindoVerifyResponse extends PindoResponse {
  request_id: number;
  message: 'success' | string;
  network?: string;
  remaining_balance?: number;
}

interface PindoVerifyCheckResponse extends PindoResponse {
  message: 'success' | string;
  remaining_balance?: number;
  request_id?: number;
}

export class PindoClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.pindo.io/v1';
  private defaultSender: string;

  constructor(apiKey?: string, defaultSender: string = 'RWB') {
    this.apiKey = apiKey || process.env.PINDO_API_KEY || '';
    this.defaultSender = defaultSender;
    
    if (!this.apiKey) {
      console.warn('⚠️ Pindo API key not provided. SMS features will not work.');
    }
  }

  private async makeRequest<T = PindoResponse>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' = 'POST', 
    data?: any
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Pindo API key is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      console.log(`📱 Making Pindo API request to: ${endpoint}`);
      
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Pindo API error (${response.status}):`, errorText);
        throw new Error(`Pindo API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ Pindo API response:`, result);
      
      return result as T;
    } catch (error) {
      console.error('❌ Error making Pindo API request:', error);
      throw error;
    }
  }

  /**
   * Send a single SMS message
   */
  async sendSMS(to: string, text: string, sender?: string): Promise<PindoResponse> {
    const payload: PindoSMSRequest = {
      to: this.formatPhoneNumber(to),
      text,
      sender: sender || this.defaultSender,
    };

    return this.makeRequest('/sms/', 'POST', payload);
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(
    recipients: Array<{ phonenumber: string; name?: string }>, 
    text: string, 
    sender?: string
  ): Promise<PindoResponse> {
    const payload: PindoBulkSMSRequest = {
      recipients: recipients.map(r => ({
        phonenumber: this.formatPhoneNumber(r.phonenumber),
        name: r.name,
      })),
      text,
      sender: sender || this.defaultSender,
    };

    return this.makeRequest('/sms/bulk', 'POST', payload);
  }

  /**
   * Generate and send a verification PIN
   */
  async generateVerificationPIN(phoneNumber: string, brand?: string): Promise<PindoVerifyResponse> {
    const payload: PindoVerifyRequest = {
      brand: brand || this.defaultSender,
      number: this.formatPhoneNumber(phoneNumber),
    };

    return this.makeRequest<PindoVerifyResponse>('/sms/verify', 'POST', payload);
  }

  /**
   * Verify a PIN code
   */
  async verifyPIN(code: string, requestId: number): Promise<PindoVerifyCheckResponse> {
    const payload: PindoVerifyCheckRequest = {
      code,
      request_id: requestId,
    };

    return this.makeRequest<PindoVerifyCheckResponse>('/sms/verify/check', 'POST', payload);
  }

  /**
   * Check PIN verification status
   */
  async checkPINStatus(requestId: number): Promise<PindoResponse> {
    return this.makeRequest(`/sms/verify/status/${requestId}`, 'GET');
  }

  /**
   * Cancel a PIN verification request
   */
  async cancelPIN(requestId: number): Promise<PindoResponse> {
    return this.makeRequest(`/sms/verify/cancel/${requestId}`, 'PUT');
  }

  /**
   * Format phone number to Rwandan format
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Handle different formats:
    // - +250781234567 -> +250781234567
    // - 0781234567 -> +250781234567  
    // - 781234567 -> +250781234567
    if (digits.startsWith('250') && digits.length === 12) {
      return `+${digits}`;
    } else if (digits.startsWith('0') && digits.length === 10) {
      return `+250${digits.substring(1)}`;
    } else if (digits.length === 9) {
      return `+250${digits}`;
    } else if (digits.startsWith('250') && digits.length > 12) {
      // Handle cases with extra digits
      return `+250${digits.substring(3, 12)}`;
    }
    
    // If none of the above, assume it's already in correct format or invalid
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  /**
   * Validate if phone number is in correct Rwandan format
   */
  isValidRwandanPhone(phone: string): boolean {
    const formatted = this.formatPhoneNumber(phone);
    // Rwanda mobile numbers: +250 7X XXXXXXX (where X is any digit)
    const rwandanMobileRegex = /^\+2507[0-9]{8}$/;
    return rwandanMobileRegex.test(formatted);
  }

  /**
   * Get API configuration status
   */
  getStatus(): { configured: boolean; hasApiKey: boolean } {
    return {
      configured: !!this.apiKey,
      hasApiKey: !!this.apiKey,
    };
  }
}

// Create a singleton instance
const pindoClient = new PindoClient(
  process.env.PINDO_API_KEY,
  process.env.PINDO_SENDER_NAME || 'RWB'
);

export default pindoClient;

// Export types for use in other modules
export type {
  PindoResponse,
  PindoVerifyResponse,
  PindoVerifyCheckResponse,
  PindoSMSRequest,
  PindoBulkSMSRequest,
};
