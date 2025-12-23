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

const DEFAULT_SCRIPT_TIMEOUT_MS = 15000;
const getScriptTimeoutMs = () => {
  const raw = process.env.NEXT_PUBLIC_IREMBOPAY_SCRIPT_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCRIPT_TIMEOUT_MS;
};

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
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Use explicit sandbox flag (more reliable than guessing from key)
  const scriptUrl = isSandbox
    ? 'https://dashboard.sandbox.irembopay.com/assets/payment/inline.js'
    : 'https://dashboard.irembopay.com/assets/payment/inline.js';

  // Generate payment URL as fallback
  const paymentUrl = isSandbox
    ? `https://checkout.sandbox.irembopay.com/${invoiceNumber}`
    : `https://checkout.irembopay.com/${invoiceNumber}`;

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
   * Add timeout for script loading (configurable)
   * Also detect if the SDK is already present (e.g. cached / already loaded on the page).
   */
  useEffect(() => {
    console.log('📊 IremboPay Widget mounted:', {
      invoiceNumber,
      publicKey: publicKey ? publicKey.substring(0, 15) + '...' : 'NOT SET',
      scriptUrl,
      paymentUrl,
    });

    // If SDK is already available, don't wait on <Script> events.
    if (typeof window !== 'undefined' && window.IremboPay) {
      setScriptLoaded(true);
      return;
    }

    const timeoutMs = getScriptTimeoutMs();
    const timer = setTimeout(() => {
      if (!scriptLoaded) {
        console.warn(`⚠️ IremboPay script loading timeout after ${Math.round(timeoutMs / 1000)} seconds`);
        console.warn('   Script URL:', scriptUrl);
        console.warn('   Fallback to direct payment URL:', paymentUrl);
        setLoadingTimeout(true);
      }
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [invoiceNumber, paymentUrl, publicKey, scriptLoaded, scriptUrl]);

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
          console.log('📨 [IREMBOPAY WIDGET] Callback received at:', new Date().toISOString());
          console.log('📨 [IREMBOPAY WIDGET] Error object:', err);
          console.log('📨 [IREMBOPAY WIDGET] Response object:', resp);
          console.log('📨 [IREMBOPAY WIDGET] Error type:', typeof err);
          console.log('📨 [IREMBOPAY WIDGET] Response type:', typeof resp);
          console.log('📨 [IREMBOPAY WIDGET] Error keys:', err ? Object.keys(err) : 'null');
          console.log('📨 [IREMBOPAY WIDGET] Response keys:', resp ? Object.keys(resp) : 'null');
          
          // Log full error structure if it exists
          if (err) {
            console.log('📨 [IREMBOPAY WIDGET] Error details:', {
              message: err.message,
              detail: err.detail,
              code: err.code,
              errors: err.errors,
              status: err.status,
              statusCode: err.statusCode,
              fullError: JSON.stringify(err, null, 2),
            });
          }
          
          // Log full response structure if it exists
          if (resp) {
            console.log('📨 [IREMBOPAY WIDGET] Response details:', {
              success: resp.success,
              status: resp.status,
              paymentStatus: resp.paymentStatus,
              invoiceNumber: resp.invoiceNumber,
              transactionId: resp.transactionId,
              fullResponse: JSON.stringify(resp, null, 2),
            });
          }

          if (err) {
            console.error('❌ [IREMBOPAY WIDGET] Payment failed:', err);
            setPaymentStatus('error');
            setError(
              err.message || 
              err.detail || 
              err.errors?.[0]?.detail ||
              'Payment failed. Please try again.'
            );
            onFailed?.(err);
          } else {
            console.log('✅ [IREMBOPAY WIDGET] Payment successful:', resp);
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
      // Initiate as soon as possible once the SDK is ready.
      const timer = setTimeout(() => {
        initiatePayment();
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [scriptLoaded, invoiceNumber, publicKey, error, paymentStatus]);

  // Handle script load
  const handleScriptLoad = () => {
    console.log('✅ IremboPay script loaded');
    // Some environments fire `onLoad` earlier than `onReady`. Mark loaded ASAP.
    setScriptLoaded(true);
  };

  // `onReady` is more reliable than `onLoad` in Next.js (fires even if cached).
  const handleScriptReady = () => {
    console.log('✅ IremboPay script ready');
    setScriptLoaded(true);

    // Kick off the modal immediately (don’t wait for the effect cycle).
    // Guarded to avoid double-init.
    if (invoiceNumber && publicKey && !error && paymentStatus === 'idle') {
      setTimeout(() => initiatePayment(), 0);
    }
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

  // Loading/Processing state with immediate fallback
  return (
    <>
      {/* Load IremboPay inline script */}
      <Script
        src={scriptUrl}
        onLoad={handleScriptLoad}
        onReady={handleScriptReady}
        onError={handleScriptError}
        strategy="afterInteractive"
      />

      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        {!loadingTimeout && !scriptLoaded && <Loader2 className="h-12 w-12 animate-spin text-blue-600" />}
        
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">
            {loadingTimeout 
              ? 'Payment system taking longer than expected' 
              : !scriptLoaded 
                ? 'Loading payment system...' 
                : 'Opening payment modal...'}
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
        
        {/* Always show fallback option immediately */}
        <div className="space-y-3 w-full max-w-md">
          {/* Primary action: Open payment page */}
          <Button 
            onClick={() => window.open(paymentUrl, '_blank')} 
            size="lg" 
            className="w-full"
          >
            Open Payment Page {scriptLoaded ? '(Recommended)' : ''}
          </Button>
          
          {/* Secondary actions */}
          {scriptLoaded && (
            <Button 
              onClick={initiatePayment} 
              variant="outline" 
              size="lg" 
              className="w-full"
            >
              Try Opening Modal Here
            </Button>
          )}
          
          {loadingTimeout && !scriptLoaded && (
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              size="sm" 
              className="w-full"
            >
              Retry Loading Widget
            </Button>
          )}
        </div>

        {!scriptLoaded && (
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Tip: Click "Open Payment Page" to proceed with payment in a new tab. The payment status will update automatically when completed.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}

export default IremboPayWidget;

