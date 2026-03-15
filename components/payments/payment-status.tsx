"use client";

// =============================================
// Payment Status Component
// Displays payment status and progress
// =============================================

import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Payment, PaymentStatus } from '@/types/payment';

interface PaymentStatusProps {
  payment: Payment | null | undefined;
  onRetry?: () => void;
}

export function PaymentStatusDisplay({ payment, onRetry }: PaymentStatusProps) {
  // Handle null/undefined payment
  if (!payment) {
    return (
      <Alert className="border-gray-200 bg-gray-50">
        <AlertCircle className="h-5 w-5 text-gray-500" />
        <AlertTitle>No Payment Information</AlertTitle>
        <AlertDescription>
          Payment information is not available yet. Please initiate a payment first.
        </AlertDescription>
      </Alert>
    );
  }

  const getStatusConfig = (status: PaymentStatus) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50 dark:bg-green-950',
          borderColor: 'border-green-200 dark:border-green-900',
          title: 'Payment Successful!',
          description: 'Your payment has been processed successfully. Your application will now proceed to review.',
        };
      
      case 'processing':
        return {
          icon: Loader2,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 dark:bg-blue-950',
          borderColor: 'border-blue-200 dark:border-blue-900',
          title: 'Payment Processing',
          description: 'Your payment is being processed. This usually takes a few moments.',
          animate: true,
        };
      
      case 'pending':
        return {
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 dark:bg-yellow-950',
          borderColor: 'border-yellow-200 dark:border-yellow-900',
          title: 'Payment Pending',
          description: 'Waiting for payment confirmation. Please complete the payment to proceed.',
        };
      
      case 'failed':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-900',
          title: 'Payment Failed',
          description: 'Your payment could not be processed. Please try again or use a different payment method.',
          showRetry: true,
        };
      
      case 'cancelled':
        return {
          icon: AlertCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 dark:bg-gray-950',
          borderColor: 'border-gray-200 dark:border-gray-900',
          title: 'Payment Cancelled',
          description: 'You cancelled the payment. You can retry when ready.',
          showRetry: true,
        };
      
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: 'Payment Status Unknown',
          description: 'Unable to determine payment status.',
        };
    }
  };

  const config = getStatusConfig(payment.status);
  const Icon = config.icon;

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-RW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Status Card */}
      <Alert className={`${config.bgColor} ${config.borderColor} border-2`}>
        <div className="flex items-start gap-4">
          <Icon 
            className={`h-8 w-8 ${config.color} ${config.animate ? 'animate-spin' : ''}`} 
          />
          <div className="flex-1">
            <AlertTitle className={`text-lg font-semibold ${config.color}`}>
              {config.title}
            </AlertTitle>
            <AlertDescription className="mt-2 text-sm">
              {config.description}
            </AlertDescription>
          </div>
        </div>
      </Alert>

      {/* Payment Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border p-6 space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Payment Details</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-lg font-semibold">
              {formatAmount(payment.amount, payment.currency)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-lg font-semibold capitalize">{payment.status}</p>
          </div>

          {payment.payment_method && (
            <div>
              <p className="text-xs text-muted-foreground">Payment Method</p>
              <p className="text-sm capitalize">{payment.payment_method.replace('_', ' ')}</p>
            </div>
          )}

          {payment.irembo_transaction_id && (
            <div>
              <p className="text-xs text-muted-foreground">Transaction ID</p>
              <p className="text-sm font-mono text-xs">{payment.irembo_transaction_id}</p>
            </div>
          )}

          {payment.initiated_at && (
            <div>
              <p className="text-xs text-muted-foreground">Initiated</p>
              <p className="text-sm">{formatDate(payment.initiated_at)}</p>
            </div>
          )}

          {payment.completed_at && (
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-sm">{formatDate(payment.completed_at)}</p>
            </div>
          )}
        </div>

        {payment.irembo_payment_ref && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">Payment Reference</p>
            <p className="text-sm font-mono text-xs mt-1">{payment.irembo_payment_ref}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {config.showRetry && onRetry && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={onRetry} variant="default" className="flex-1">
            <AlertCircle className="h-4 w-4 mr-2" />
            Retry Payment
          </Button>
        </div>
      )}

      {/* Processing Info */}
      {payment.status === 'processing' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription className="text-xs">
            Please do not close this page. Your payment is being confirmed...
          </AlertDescription>
        </Alert>
      )}
    </motion.div>
  );
}

export default PaymentStatusDisplay;

