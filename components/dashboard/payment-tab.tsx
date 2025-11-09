"use client";

// =============================================
// Payment Tab Component
// Main payment interface for water permit applications
// =============================================

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { IremboPayWidget } from '@/components/payments/irembopay-widget';
import { PaymentStatusDisplay } from '@/components/payments/payment-status';
import { usePayment } from '@/hooks/usePayment';
import { getApplicationFee } from '@/lib/payment-utils';
import type { Application } from '@/types/database';

// Get public key from environment
const IREMBOPAY_PUBLIC_KEY = process.env.NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY || '';

// Debug: Log public key availability
if (typeof window !== 'undefined') {
  console.log('🔑 IremboPay Public Key Check:', {
    hasKey: !!IREMBOPAY_PUBLIC_KEY,
    keyPrefix: IREMBOPAY_PUBLIC_KEY ? IREMBOPAY_PUBLIC_KEY.substring(0, 15) + '...' : 'NOT SET',
    keyLength: IREMBOPAY_PUBLIC_KEY.length,
  });
}

interface PaymentTabProps {
  application?: Application; // Optional for testing mode
  onPaymentSuccess?: () => void;
  onBack?: () => void;
}

export function PaymentTab({ application, onPaymentSuccess, onBack }: PaymentTabProps) {
  const router = useRouter();
  const [showWidget, setShowWidget] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  
  // 🧪 TESTING MODE: Use mock app if none exists
  const [mockApp] = useState(() => {
    if (application) return null;
    
    const generateTestUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');
    };
    
    return {
      id: generateTestUUID(),
      application_number: 'TEST-' + Date.now(),
      project_title: 'Test Water Permit Application',
      district: 'Test District',
      province: 'Kigali',
      applicant_id: generateTestUUID(),
      status: 'draft' as const,
    };
  });
  
  const testApplication = (application || mockApp) as Application;

  const {
    payment,
    loading,
    error,
    initiatePayment,
    checkStatus,
    clearError,
  } = usePayment({
    applicationId: testApplication.id,
    autoFetch: false, // Don't auto-fetch to avoid errors
    pollInterval: 5000,
  });

  const applicationFee = getApplicationFee();

  /**
   * Handle payment initiation
   */
  const handleInitiatePayment = async () => {
    try {
      setIsInitializing(true);
      clearError();

      console.log('🚀 Initiating payment for application:', testApplication.id);

      const result = await initiatePayment({
        application_id: testApplication.id,
        amount: applicationFee,
        currency: 'RWF',
        customer: {
          email: testApplication.applicant?.email || 'test@example.com',
          phone: testApplication.applicant?.phone || testApplication.applicant?.company_phone || '+250788123456',
          name: `${testApplication.applicant?.first_name || ''} ${testApplication.applicant?.last_name || ''}`.trim() ||
                 testApplication.applicant?.company_name || 
                 'Test User',
        },
      });

      if (result.success && result.payment) {
        console.log('✅ Payment initialized successfully');
        setShowWidget(true);
      } else {
        console.error('❌ Payment initialization failed:', result.error);
      }
    } catch (err) {
      console.error('❌ Error initiating payment:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  /**
   * Handle payment success
   */
  const handlePaymentSuccess = () => {
    console.log('✅ Payment successful, checking status...');
    
    if (payment?.id) {
      checkStatus(payment.id);
    }

    // Wait a bit then trigger callback
    setTimeout(() => {
      onPaymentSuccess?.();
      router.push('/dashboard?tab=applications&payment=success');
    }, 2000);
  };

  /**
   * Handle payment failure
   */
  const handlePaymentFailed = () => {
    console.log('❌ Payment failed');
    
    if (payment?.id) {
      checkStatus(payment.id);
    }
  };

  /**
   * Handle retry payment
   */
  const handleRetryPayment = () => {
    setShowWidget(false);
    setTimeout(() => {
      handleInitiatePayment();
    }, 500);
  };

  /**
   * Handle download receipt
   */
  const handleDownloadReceipt = () => {
    // TODO: Implement receipt download
    console.log('📄 Download receipt for payment:', payment?.id);
    alert('Receipt download feature coming soon!');
  };

  /**
   * Format amount
   */
  const formatAmount = (amount: number, currency: string = 'RWF') => {
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Check if payment is already completed
  const isPaymentCompleted = payment?.status === 'completed';
  const isPaymentPending = payment?.status === 'pending' || payment?.status === 'processing';
  const isPaymentFailed = payment?.status === 'failed' || payment?.status === 'cancelled';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payment</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete payment to proceed with your application
          </p>
        </div>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        )}
      </div>

      {/* Application Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Application Summary</CardTitle>
          <CardDescription>Water Permit Application Details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Application Number</p>
              <p className="text-sm font-medium">{testApplication.application_number || 'Pending'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Project Title</p>
              <p className="text-sm font-medium">{testApplication.project_title || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Application Fee</p>
              <p className="text-lg font-bold text-primary">{formatAmount(applicationFee)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm">{testApplication.district}, {testApplication.province}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Payment Status or Widget */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isPaymentCompleted ? 'Payment Completed' : 'Payment Required'}
          </CardTitle>
          <CardDescription>
            {isPaymentCompleted
              ? 'Your payment has been processed successfully'
              : 'Pay the application fee to submit your application'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !payment ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-3 text-sm text-muted-foreground">Loading payment information...</span>
            </div>
          ) : isPaymentCompleted ? (
            // Show payment success status
            <div className="space-y-6">
              <PaymentStatusDisplay
                payment={payment!}
                onDownloadReceipt={handleDownloadReceipt}
              />
              
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Application Submitted</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your application has been submitted for review. You will receive updates via email and can track progress in your dashboard.
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => router.push('/dashboard?tab=applications')}
                className="w-full"
              >
                View My Applications
              </Button>
            </div>
          ) : payment && (isPaymentPending || isPaymentFailed) ? (
            // Show payment status for pending/failed payments
            <div className="space-y-6">
              <PaymentStatusDisplay
                payment={payment}
                onRetry={isPaymentFailed ? handleRetryPayment : undefined}
              />

              {showWidget && payment.irembo_payment_ref && isPaymentPending && (
                <div className="pt-6 border-t">
                  <IremboPayWidget
                    invoiceNumber={payment.irembo_payment_ref}
                    publicKey={IREMBOPAY_PUBLIC_KEY}
                    amount={payment.amount}
                    currency={payment.currency}
                    isSandbox={true}
                    onSuccess={handlePaymentSuccess}
                    onFailed={handlePaymentFailed}
                    onClose={() => console.log('Payment modal closed')}
                  />
                </div>
              )}
            </div>
          ) : !payment && !showWidget ? (
            // No payment yet - show initiation button
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Application Fee Required</AlertTitle>
                <AlertDescription>
                  A non-refundable application fee of <strong>{formatAmount(applicationFee)}</strong> is required to process your water permit application.
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                <h3 className="text-sm font-medium mb-4">What happens after payment?</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Your application will be submitted for review</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>You'll receive a payment receipt via email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Track your application status in your dashboard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Receive updates throughout the review process</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={handleInitiatePayment}
                disabled={isInitializing}
                size="lg"
                className="w-full"
              >
                {isInitializing ? (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    Initializing Payment...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Proceed to Payment
                  </>
                )}
              </Button>
            </div>
          ) : showWidget && payment?.irembo_payment_ref ? (
            // Show payment widget
            <IremboPayWidget
              invoiceNumber={payment.irembo_payment_ref}
              publicKey={IREMBOPAY_PUBLIC_KEY}
              amount={payment.amount}
              currency={payment.currency}
              isSandbox={true}
              onSuccess={handlePaymentSuccess}
              onFailed={handlePaymentFailed}
              onClose={() => setShowWidget(false)}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Need Help?</AlertTitle>
        <AlertDescription className="text-xs">
          If you encounter any issues with payment, please contact support at{' '}
          <a href="mailto:support@rwb.gov.rw" className="text-blue-600 hover:underline">
            support@rwb.gov.rw
          </a>{' '}
          or call <strong>+250 788 000 000</strong>
        </AlertDescription>
      </Alert>
    </motion.div>
  );
}

export default PaymentTab;

