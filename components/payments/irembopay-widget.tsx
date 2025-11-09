"use client";

// =============================================
// IremboPay Checkout Widget Component
// Uses JavaScript SDK Integration (NOT redirect)
// =============================================

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Script from 'next/script';

// Declare IremboPay global
declare global {
  interface Window {
    IremboPay: {
      initiate: (config: {
        publicKey: string;
        invoiceNumber: string;
        locale: 'EN' | 'FR' | 'RW';
        callback: (err: any, resp: any) => void;
      }) => void;
      closeModal: () => void;
      locale: {
        EN: 'EN';
        FR: 'FR';
        RW: 'RW';
      };
    };
  }
}

interface IremboPayWidgetProps {
  invoiceNumber: string;
  publicKey: string;
  amount: number;
  currency?: string;
  isSandbox?: boolean; // Explicitly specify sandbox mode
  onSuccess?: () => void;
  onFailed?: (error?: any) => void;
  onClose?: () => void;
}

export function IremboPayWidget({
  invoiceNumber,
  publicKey,
  amount,
  currency = 'RWF',
  isSandbox = true, // Default to sandbox for safety
  onSuccess,
  onFailed,
  onClose,
}: IremboPayWidgetProps) {
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  // Use explicit sandbox flag (more reliable than guessing from key)
  const scriptUrl = isSandbox
    ? 'https://dashboard.sandbox.irembopay.com/assets/payment/inline.js'
    : 'https://dashboard.irembopay.com/assets/payment/inline.js';

  /**
   * Validate required props
   */
  useEffect(() => {
    if (!invoiceNumber) {
      setError('Invoice number is required');
    }
    if (!publicKey) {
      setError('Public key is required');
    }
  }, [invoiceNumber, publicKey]);

  /**
   * Initiate payment when script is loaded
   */
  const initiatePayment = () => {
    if (!window.IremboPay) {
      console.error('❌ IremboPay SDK not loaded');
      setError('Payment system not loaded. Please refresh the page.');
      return;
    }

    console.log('💳 Initiating IremboPay payment with:', {
      invoiceNumber,
      publicKey: publicKey.substring(0, 20) + '...',
      amount,
      currency,
      environment: isSandbox ? 'SANDBOX' : 'PRODUCTION',
    });

    setPaymentStatus('processing');

    try {
      window.IremboPay.initiate({
        publicKey,
        invoiceNumber,
        locale: window.IremboPay.locale.EN,
        callback: (err, resp) => {
          console.log('📨 IremboPay callback received:', { err, resp });

          if (err) {
            console.error('❌ Payment failed:', err);
            setPaymentStatus('error');
            setError(
              err.message || 
              err.detail || 
              err.errors?.[0]?.detail ||
              'Payment failed. Please try again.'
            );
            onFailed?.(err);
          } else {
            console.log('✅ Payment successful:', resp);
            setPaymentStatus('success');
            onSuccess?.();
            
            // Close modal after successful payment
            setTimeout(() => {
              window.IremboPay?.closeModal();
            }, 2000);
          }
        },
      });
    } catch (err) {
      console.error('❌ Failed to initiate payment:', err);
      setPaymentStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to initiate payment');
      onFailed?.(err);
    }
  };

  /**
   * Auto-initiate payment when script loads
   */
  useEffect(() => {
    if (scriptLoaded && invoiceNumber && publicKey && !error && paymentStatus === 'idle') {
      // Small delay to ensure IremboPay is fully initialized
      const timer = setTimeout(() => {
        initiatePayment();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [scriptLoaded, invoiceNumber, publicKey, error, paymentStatus]);

  // Handle script load
  const handleScriptLoad = () => {
    console.log('✅ IremboPay script loaded');
    setScriptLoaded(true);
  };

  const handleScriptError = () => {
    console.error('❌ Failed to load IremboPay script');
    setError('Failed to load payment system. Please check your internet connection.');
  };

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
          Retry Payment
        </Button>
      </div>
    );
  }

  // Success state
  if (paymentStatus === 'success') {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          Payment completed successfully! Redirecting...
        </AlertDescription>
      </Alert>
    );
  }

  // Loading/Processing state
  return (
    <>
      {/* Load IremboPay inline script */}
      <Script
        src={scriptUrl}
        onLoad={handleScriptLoad}
        onError={handleScriptError}
        strategy="afterInteractive"
      />

      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">
            {!scriptLoaded ? 'Loading payment system...' : 'Opening payment modal...'}
          </p>
          <p className="text-sm text-muted-foreground">
            Amount: {amount.toLocaleString()} {currency}
          </p>
          {scriptLoaded && (
            <p className="text-xs text-muted-foreground">
              Environment: {isSandbox ? '🧪 Sandbox (Test Mode)' : '🔴 Production (Live)'}
            </p>
          )}
        </div>
        
        {scriptLoaded && (
          <Button onClick={initiatePayment} variant="outline" size="lg">
            Click here if payment modal doesn't open
          </Button>
        )}
      </div>
    </>
  );
}

export default IremboPayWidget;

