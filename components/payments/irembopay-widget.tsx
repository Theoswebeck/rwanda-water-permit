"use client";

// =============================================
// IremboPay Checkout Widget Component
// Embeds IremboPay payment interface
// =============================================

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface IremboPayWidgetProps {
  paymentUrl: string;
  amount: number;
  currency?: string;
  onSuccess?: () => void;
  onFailed?: () => void;
  onClose?: () => void;
}

export function IremboPayWidget({
  paymentUrl,
  amount,
  currency = 'RWF',
  onSuccess,
  onFailed,
  onClose,
}: IremboPayWidgetProps) {
  const [error, setError] = useState<string | null>(null);

  /**
   * Validate payment URL on mount
   */
  useEffect(() => {
    if (!paymentUrl) {
      setError('Payment system not ready. Please refresh the page.');
    }
  }, [paymentUrl]);

  /**
   * Auto-redirect to payment URL
   */
  useEffect(() => {
    if (paymentUrl && !error) {
      console.log('🚀 Redirecting to IremboPay checkout:', paymentUrl);
      
      // Redirect to the payment page after a brief delay
      const timer = setTimeout(() => {
        window.location.href = paymentUrl;
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [paymentUrl, error]);

  /**
   * Manual launch - open payment URL if auto-redirect fails
   */
  const handleLaunchCheckout = () => {
    console.log('🚀 Manual redirect to IremboPay checkout...');
    window.location.href = paymentUrl;
  };

  // Show redirecting message
  if (paymentUrl && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Redirecting to secure payment page...</p>
          <p className="text-sm text-muted-foreground">You will be redirected to IremboPay in a moment</p>
        </div>
        <Button onClick={handleLaunchCheckout} variant="outline" size="lg">
          Click here if not redirected automatically
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Fallback - should not reach here
  return null;
}

export default IremboPayWidget;

