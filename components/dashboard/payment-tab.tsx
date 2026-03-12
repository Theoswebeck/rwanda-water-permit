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
import { CheckCircle, AlertCircle, ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { IremboPayWidget } from '@/components/payments/irembopay-widget';
import { PaymentStatusDisplay } from '@/components/payments/payment-status';
import { usePayment } from '@/hooks/usePayment';
import { getApplicationFee } from '@/lib/payment-utils';
import type { Application } from '@/types/database';
import type { InitiatePaymentRequest } from '@/types/payment';

// Get public key from environment
const IREMBOPAY_PUBLIC_KEY = process.env.NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY || '';
const IREMBOPAY_IS_SANDBOX_FROM_KEY =
  IREMBOPAY_PUBLIC_KEY.startsWith('pk_sandbox') || IREMBOPAY_PUBLIC_KEY.includes('sandbox');
const IREMBOPAY_IS_SANDBOX =
  typeof process.env.NEXT_PUBLIC_IREMBOPAY_SANDBOX === 'string'
    ? process.env.NEXT_PUBLIC_IREMBOPAY_SANDBOX === 'true'
    : IREMBOPAY_IS_SANDBOX_FROM_KEY || process.env.NODE_ENV === 'development';

// Debug: Log public key availability
if (typeof window !== 'undefined') {
  console.log('🔑 IremboPay Public Key Check:', {
    hasKey: !!IREMBOPAY_PUBLIC_KEY,
    keyPrefix: IREMBOPAY_PUBLIC_KEY ? IREMBOPAY_PUBLIC_KEY.substring(0, 15) + '...' : 'NOT SET',
    keyLength: IREMBOPAY_PUBLIC_KEY.length,
  });

  // Fail loudly in the console if client env looks inconsistent. This is a common cause of
  // checkout/modal failures even when invoice creation succeeds.
  const keyLooksLive = IREMBOPAY_PUBLIC_KEY.startsWith('pk_live');
  const keyLooksSandbox = IREMBOPAY_PUBLIC_KEY.startsWith('pk_sandbox') || IREMBOPAY_PUBLIC_KEY.includes('sandbox');
  if (IREMBOPAY_IS_SANDBOX && keyLooksLive) {
    console.error('❌ IremboPay config mismatch: NEXT_PUBLIC_IREMBOPAY_SANDBOX=true but public key looks LIVE (pk_live...).');
  }
  if (!IREMBOPAY_IS_SANDBOX && keyLooksSandbox) {
    console.error('❌ IremboPay config mismatch: NEXT_PUBLIC_IREMBOPAY_SANDBOX=false but public key looks SANDBOX.');
  }
}

type DraftFormData = {
  emailAddress?: string
  telephoneContact?: string
  fullNameApplicant?: string
  [key: string]: unknown
}

type CompletedApplication = {
  application_number?: string
  applicant?: { email?: string }
  [key: string]: unknown
}

interface PaymentTabProps {
  application?: Application; // Optional - may not exist yet
  formData?: DraftFormData; // Unsaved form data for new applications
  onPaymentComplete?: (paymentId: string) => Promise<unknown>; // Optional callback for callers
  onBack?: () => void;
  isSavingApplication?: boolean;
  saveError?: string | null;
  onRetrySave?: () => void;
}

export function PaymentTab({ application, formData, onBack, isSavingApplication, saveError, onRetrySave }: PaymentTabProps) {
  const router = useRouter();
  const [showWidget, setShowWidget] = useState(false);
  const [widgetDismissed, setWidgetDismissed] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [customerValidationError, setCustomerValidationError] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [completedApplication, setCompletedApplication] = useState<CompletedApplication | null>(null);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  
  const {
    payment,
    loading,
    error,
    initiatePayment,
    checkStatus,
    clearError,
  } = usePayment({
    applicationId: application?.id,
    autoFetch: !!application?.id, // Only auto-fetch if there is an application
    pollInterval: 5000,
  });

  const applicationFee = getApplicationFee();

  /**
   * Auto-detect when payment is completed via polling
   */
  useEffect(() => {
    if (payment && payment.status === 'completed' && !paymentCompleted && !isCompletingPayment) {
      console.log('✅ Payment completed detected via polling');
      setCompletedApplication(payment.application);
      setPaymentCompleted(true);

      // Close Irembo modal if it is open (helps demo flow)
      try {
        window.IremboPay?.closeModal?.();
      } catch {
        // ignore
      }
      
      // Auto-redirect to dashboard after 4 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 4000);
    }
  }, [payment?.status, payment?.application, paymentCompleted, isCompletingPayment, router]);

  /**
   * If a user comes back to an existing pending payment, automatically show the widget
   * (the widget itself auto-opens the Irembo modal when the script loads).
   */
  useEffect(() => {
    const isPendingWithRef =
      (payment?.status === 'pending' || payment?.status === 'processing') && !!payment?.irembo_payment_ref;

    if (isPendingWithRef && !showWidget && !widgetDismissed) {
      setShowWidget(true);
    }
  }, [payment?.status, payment?.irembo_payment_ref, showWidget, widgetDismissed]);

  /**
   * Handle payment initiation
   */
  const handleInitiatePayment = async () => {
    try {
      setIsInitializing(true);
      clearError();
      setCustomerValidationError(null);

      console.log('🚀 Initiating payment...');

      const requestData: InitiatePaymentRequest = {
          amount: applicationFee,
          currency: 'RWF',
      };

      if (application) {
        // application.applicant is populated via Supabase join (users!applications_applicant_id_fkey)
        const applicant = application.applicant;
        const email = (applicant?.email || '').trim();
        const phone = (applicant?.phone || applicant?.mobile_phone || applicant?.company_phone || '').trim();
        const name =
          `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() ||
          (applicant?.company_name || '').trim();

        if (!email || !phone || !name) {
          setCustomerValidationError(
            "Missing applicant contact details. Please update the applicant profile (name, email, phone) before initiating payment."
          );
          return;
        }

        requestData.application_id = application.id;
        requestData.customer = { email, phone, name };
      } else if (formData) {
        const email = String(formData.emailAddress || "").trim();
        const phone = String(formData.telephoneContact || "").trim();
        const name = String(formData.fullNameApplicant || "").trim();

        if (!email || !phone || !name) {
          setCustomerValidationError(
            "Missing applicant contact details in the form. Please provide full name, email, and phone before initiating payment."
          );
          return;
        }

        requestData.application_data = formData;
        requestData.customer = {
          email,
          phone,
          name,
        };
      } else {
          console.error('❌ Cannot initiate payment without application or form data.');
          setIsInitializing(false);
          return;
      }

      const result = await initiatePayment(requestData);

      if (result.success && result.payment) {
        console.log('✅ Payment initialized successfully');
        setShowWidget(true); // always open modal so demo can "attempt to pay"
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
  const handlePaymentSuccess = async () => {
    console.log('✅ [PAYMENT TAB] Widget onSuccess callback triggered at:', new Date().toISOString());
    console.log('✅ [PAYMENT TAB] Current payment state:', {
      paymentId: payment?.id,
      status: payment?.status,
      invoiceNumber: payment?.irembo_payment_ref,
    });
    console.log('✅ [PAYMENT TAB] Payment successful - checking final status');

    setShowWidget(false);
    setWidgetDismissed(true);
    
    try {
      setIsCompletingPayment(true);
      console.log('💾 [PAYMENT TAB] Verifying payment status...');

      // Check status one final time to get the latest payment data
      if (payment?.id) {
        const finalPayment = await checkStatus(payment.id);
        
        console.log('💾 [PAYMENT TAB] Status check result:', {
          paymentId: finalPayment?.id,
          status: finalPayment?.status,
          applicationNumber: finalPayment?.application?.application_number,
        });
        
        if (finalPayment && finalPayment.status === 'completed') {
          setCompletedApplication(finalPayment.application);
          setPaymentCompleted(true);
          console.log('✅ [PAYMENT TAB] Application submitted:', finalPayment.application?.application_number);

          // Auto-redirect to dashboard after 4 seconds
          setTimeout(() => {
            router.push('/dashboard');
          }, 4000);
        } else {
          console.log('⏳ [PAYMENT TAB] Payment not yet completed, waiting for status update...');
          // The hook's polling will handle the rest
        }
      }
    } catch (error) {
      console.error('❌ [PAYMENT TAB] Error completing payment:', error);
    } finally {
      setIsCompletingPayment(false);
    }
  };

  /**
   * Handle payment failure
   */
  const handlePaymentFailed = (error?: any) => {
    console.log('❌ [PAYMENT TAB] Widget onFailed callback triggered at:', new Date().toISOString());
    console.log('❌ [PAYMENT TAB] Error object received:', error);
    console.log('❌ [PAYMENT TAB] Error details:', {
      message: error?.message,
      detail: error?.detail,
      code: error?.code,
      errors: error?.errors,
      fullError: error ? JSON.stringify(error, null, 2) : 'no error object',
    });
    const isAlreadyPaid = error?.code === 'BAD_INVOICES_PAID';
    if (isAlreadyPaid) {
      console.log('ℹ️ [PAYMENT TAB] Invoice already paid — dismissing widget and verifying...');
      setShowWidget(false);
      setWidgetDismissed(true);
      setIsCompletingPayment(true);

      if (payment?.id) {
        checkStatus(payment.id)
          .then((result) => {
            if (result?.status === 'completed') {
              setCompletedApplication(result.application);
              setPaymentCompleted(true);
              setTimeout(() => router.push('/dashboard'), 4000);
            } else {
              console.log('⏳ [PAYMENT TAB] Status still pending after BAD_INVOICES_PAID — polling will continue');
            }
          })
          .catch((err) => console.error('❌ [PAYMENT TAB] Status check after already-paid failed:', err))
          .finally(() => setIsCompletingPayment(false));
      } else {
        setIsCompletingPayment(false);
      }
      return;
    }

    console.log('❌ [PAYMENT TAB] Payment failed');

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
  // IMPORTANT: If there's no application yet (undefined/null), payment is NOT completed
  // Only consider payment completed if we have an application with a status beyond draft/pending_payment
  const isPaymentCompleted = payment?.status === 'completed' || (
    application?.id && 
    application?.status && 
    application.status !== 'draft' && 
    application.status !== 'pending_payment' && 
    application.status !== 'revision_required'
  );
  const isPaymentPending = payment?.status === 'pending' || payment?.status === 'processing';
  const isPaymentFailed = payment?.status === 'failed' || payment?.status === 'cancelled';

  // Show success screen if payment completed and application saved
  if (paymentCompleted && completedApplication) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center py-16 space-y-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center"
        >
          <CheckCircle className="h-16 w-16 text-green-600" />
        </motion.div>
        
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-green-800">Payment Successful!</h2>
          <p className="text-lg text-gray-700">
            Your application <strong className="text-green-700">#{completedApplication.application_number}</strong> has been submitted.
          </p>
          <p className="text-sm text-gray-600">
            Amount paid: <strong>{formatAmount(payment?.amount || 0, payment?.currency)}</strong>
          </p>
        </div>

        <Alert className="bg-green-50 border-green-200 max-w-md">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Your application is now being reviewed. You will receive updates via email at <strong>{completedApplication.applicant?.email || payment?.customer_email}</strong>
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Redirecting to dashboard...</span>
        </div>
      </motion.div>
    );
  }

  // If the caller is saving the application in the background, block payment until we have an application id
  if (isSavingApplication && !application?.id) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 space-y-4"
      >
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Saving your application…</p>
          <p className="text-sm text-muted-foreground">
            Please wait — we’re preparing payment.
          </p>
        </div>
      </motion.div>
    );
  }

  // Show completing payment loader
  if (isCompletingPayment) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 space-y-4"
      >
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Verifying payment...</p>
          <p className="text-sm text-muted-foreground">
            This may take a few seconds. Please do not close this page.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {customerValidationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Missing applicant details</AlertTitle>
          <AlertDescription>{customerValidationError}</AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn’t save your application</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{saveError}</div>
            {onRetrySave && (
              <Button type="button" variant="outline" onClick={onRetrySave} className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry save
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
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
              <p className="text-sm font-medium">{application?.application_number || 'Pending'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Application Type</p>
              <p className="text-sm font-medium">{application?.application_type || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Application Fee</p>
              <p className="text-lg font-bold text-primary">{formatAmount(applicationFee)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm">{application?.district}, {application?.province}</p>
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
              {payment ? (
                <PaymentStatusDisplay
                  payment={payment}
                  onDownloadReceipt={handleDownloadReceipt}
                />
              ) : (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Payment Complete</AlertTitle>
                  <AlertDescription className="text-green-700">
                    Your payment was processed successfully.
                  </AlertDescription>
                </Alert>
              )}
              
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Application Submitted</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your application has been submitted for review. You will receive updates via email and can track progress in your dashboard.
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => router.push('/dashboard')}
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
                    isSandbox={IREMBOPAY_IS_SANDBOX}
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
                    <span>You will receive a payment receipt via email</span>
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
              isSandbox={IREMBOPAY_IS_SANDBOX}
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

