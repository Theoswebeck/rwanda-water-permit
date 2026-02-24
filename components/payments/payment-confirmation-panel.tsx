"use client";

// =============================================
// Payment Confirmation Panel — Staff View
// Read-only panel showing Irembo payment details
// for staff to verify payment was collected.
// =============================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  CreditCard,
  Receipt,
  ArrowDownRight,
  Banknote,
  Phone,
  Mail,
  User,
  CalendarClock,
  Hash,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Payment } from "@/types/payment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentConfirmationPanelProps {
  applicationId: string;
  applicationStatus?: string;
  applicationNumber?: string;
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
}

interface StatusConfig {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  border: string;
  ring: string;
  iconColor: string;
  pulse?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, StatusConfig> = {
  completed: {
    icon: CheckCircle2,
    label: "Payment Confirmed",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    ring: "ring-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  processing: {
    icon: Loader2,
    label: "Processing",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    ring: "ring-blue-500/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    pulse: true,
  },
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
    ring: "ring-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800",
    ring: "ring-red-500/20",
    iconColor: "text-red-600 dark:text-red-400",
  },
  cancelled: {
    icon: AlertCircle,
    label: "Cancelled",
    color: "text-gray-700 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-950/40",
    border: "border-gray-200 dark:border-gray-700",
    ring: "ring-gray-500/20",
    iconColor: "text-gray-500 dark:text-gray-400",
  },
  refunded: {
    icon: ArrowDownRight,
    label: "Refunded",
    color: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-200 dark:border-violet-800",
    ring: "ring-violet-500/20",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
};

const FALLBACK_STATUS: StatusConfig = {
  icon: AlertCircle,
  label: "Unknown",
  color: "text-gray-600",
  bg: "bg-gray-50",
  border: "border-gray-200",
  ring: "ring-gray-500/20",
  iconColor: "text-gray-500",
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? FALLBACK_STATUS;
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-RW", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(dateString: string | undefined | null) {
  if (!dateString) return "—";
  try {
    return new Intl.DateTimeFormat("en-RW", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

function formatPaymentMethod(method: string | undefined | null) {
  if (!method) return null;
  const map: Record<string, string> = {
    mobile_money: "Mobile Money",
    card: "Card",
    bank_transfer: "Bank Transfer",
    ussd: "USSD",
    cash: "Cash",
    MTN_MOMO: "MTN Mobile Money",
    AIRTEL_MONEY: "Airtel Money",
    mtn_momo: "MTN Mobile Money",
    airtel_money: "Airtel Money",
    visa: "Visa",
    mastercard: "Mastercard",
  };
  return map[method] ?? method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Small reusable row
// ---------------------------------------------------------------------------

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-start gap-3 py-2.5 group">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground leading-none mb-1">{label}</p>
        <p className={`text-sm leading-snug break-all ${mono ? "font-mono text-[13px]" : ""}`}>
          {value}
        </p>
      </div>
      {copyable && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">{copied ? "Copied!" : "Copy"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PaymentConfirmationPanel({
  applicationId,
  applicationStatus,
  applicationNumber,
  applicantName,
  applicantEmail,
  applicantPhone,
}: PaymentConfirmationPanelProps) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(applicationId));
  const [error, setError] = useState<string | null>(null);
  const [showGatewayDetails, setShowGatewayDetails] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasAutoVerified, setHasAutoVerified] = useState(false);

  const verifyWithIremboPay = useCallback(async () => {
    if (!payment?.id) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      setIsVerifying(true);
      setError(null);
      const res = await fetch(`/api/payments/${payment.id}/status`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = `Failed to verify status (${res.status})`;
        setError(msg);
        return;
      }

      const data = await res.json();
      if (data?.success && data?.payment) {
        setPayment(data.payment as Payment);
      }
    } catch (err) {
      console.error("Error verifying payment status for staff panel:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Verification timed out. Please retry.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to verify payment status");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsVerifying(false);
    }
  }, [payment?.id]);

  const fetchPayment = useCallback(async () => {
    if (!applicationId) {
      setPayment(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/payments?application_id=${applicationId}`, { signal: controller.signal });
      if (!res.ok) {
        if (res.status === 404) {
          setPayment(null);
          return;
        }
        throw new Error(`Failed to fetch payment (${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.payment) {
        setPayment(data.payment);
      } else {
        setPayment(null);
      }
    } catch (err) {
      console.error("Error fetching payment for staff panel:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out while loading payment data. Please retry.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load payment data");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId) {
      setPayment(null);
      setError(null);
      setLoading(false);
      return;
    }
    fetchPayment();
  }, [applicationId, fetchPayment]);

  // If payment is pending/processing, auto-verify once (staff can see up-to-date truth).
  useEffect(() => {
    if (!payment?.id) return;
    if (hasAutoVerified) return;
    if (payment.status !== "pending" && payment.status !== "processing") return;
    setHasAutoVerified(true);
    void verifyWithIremboPay();
  }, [payment?.id, payment?.status, hasAutoVerified, verifyWithIremboPay]);

  // ------ Loading ------
  // Per staff UX: don't show intermediate states while we're still fetching/verifying.
  if (loading || isVerifying) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading payment information…" : "Verifying with IremboPay…"}
        </p>
      </div>
    );
  }

  // ------ Missing application id ------
  if (!applicationId) {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="rounded-full bg-muted/60 p-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="font-semibold text-muted-foreground">Payment data unavailable</p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              This view is missing an application ID, so payment details can&apos;t be loaded.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------ Error ------
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <XCircle className="h-10 w-10 text-red-400" />
          <div className="text-center space-y-1">
            <p className="font-medium text-red-700 dark:text-red-400">Failed to load payment data</p>
            <p className="text-sm text-red-600/80 dark:text-red-400/60">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPayment} className="mt-2">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ------ No payment found ------
  if (!payment) {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="rounded-full bg-muted/60 p-4">
            <CreditCard className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="font-semibold text-muted-foreground">No Payment Record Found</p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              No payment has been initiated for this application yet.
              This could indicate the applicant hasn&apos;t reached the payment step.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------ Payment found — render details ------
  const cfg = getStatusConfig(payment.status);
  const StatusIcon = cfg.icon;

  const isInconsistentSubmitted =
    applicationStatus === "submitted" && payment.status !== "completed";

  // Extract extra details from gateway_response if available
  const gw = payment.gateway_response as Record<string, any> | undefined;
  const gwWebhook = gw?.webhook?.data as Record<string, any> | undefined;
  const gwStatusCheck = (gw?.status_check as Record<string, any> | undefined) ?? undefined;
  const iremboInvoice = gw?.invoiceNumber ?? gwStatusCheck?.invoiceNumber ?? payment.irembo_payment_ref;
  const iremboTxnId =
    payment.irembo_transaction_id ??
    gw?.transactionId ??
    gwStatusCheck?.transactionId ??
    gwWebhook?.transaction_id;
  const paidAt = payment.completed_at ?? gw?.paidAt ?? gwStatusCheck?.paidAt ?? gwWebhook?.completed_at;
  const paymentMethod =
    formatPaymentMethod(payment.payment_method) ??
    formatPaymentMethod(gw?.paymentMethod as string) ??
    formatPaymentMethod(gwStatusCheck?.paymentMethod as string) ??
    formatPaymentMethod(gwWebhook?.payment_method as string);
  const paymentReference = gw?.paymentReference ?? gwStatusCheck?.paymentReference ?? gwWebhook?.reference;
  const paymentAccountId = gw?.paymentAccountIdentifier ?? gwStatusCheck?.paymentAccountIdentifier;
  const gatewayCustomerName = payment.customer_name ?? gw?.customer?.fullName ?? gwWebhook?.customer?.name;
  const gatewayCustomerEmail = payment.customer_email ?? gw?.customer?.email ?? gwWebhook?.customer?.email;
  const gatewayCustomerPhone = payment.customer_phone ?? gw?.customer?.phone ?? gwWebhook?.customer?.phone;

  const normalized = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const hasApplicant = Boolean(applicantName || applicantEmail || applicantPhone);
  const customerName = (applicantName && applicantName.trim()) ? applicantName.trim() : gatewayCustomerName;
  const customerEmail = (applicantEmail && applicantEmail.trim()) ? applicantEmail.trim() : gatewayCustomerEmail;
  const customerPhone = (applicantPhone && applicantPhone.trim()) ? applicantPhone.trim() : gatewayCustomerPhone;

  const showGatewayCustomerDiff =
    hasApplicant &&
    (normalized(gatewayCustomerName) && normalized(customerName) && normalized(gatewayCustomerName) !== normalized(customerName) ||
      normalized(gatewayCustomerEmail) && normalized(customerEmail) && normalized(gatewayCustomerEmail) !== normalized(customerEmail) ||
      normalized(gatewayCustomerPhone) && normalized(customerPhone) && normalized(gatewayCustomerPhone) !== normalized(customerPhone));
  const iremboStatus = gwStatusCheck?.paymentStatus ?? gw?.paymentStatus ?? gwWebhook?.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-5"
    >
      {/* Inconsistency warning */}
      {isInconsistentSubmitted && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Inconsistent state: application is Submitted but payment is not Completed
              </p>
              <p className="text-sm text-amber-800/80 dark:text-amber-200/70 mt-0.5">
                Application {applicationNumber ? <span className="font-mono">{applicationNumber}</span> : "record"} is marked <span className="font-semibold">submitted</span>,
                but IremboPay status is currently <span className="font-semibold">{payment.status}</span>.
                Use “Verify with IremboPay” to refresh the status.
              </p>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={verifyWithIremboPay} disabled={isVerifying}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isVerifying ? "animate-spin" : ""}`} />
                  {isVerifying ? "Verifying…" : "Verify with IremboPay"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ Status Banner ============ */}
      <div
        className={`relative overflow-hidden rounded-xl border-2 ${cfg.border} ${cfg.bg} p-5 ring-1 ${cfg.ring}`}
      >
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${cfg.bg} border ${cfg.border}`}>
            <StatusIcon
              className={`h-6 w-6 ${cfg.iconColor} ${cfg.pulse ? "animate-spin" : ""}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-lg font-semibold ${cfg.color}`}>{cfg.label}</h3>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase tracking-wider font-semibold ${cfg.border} ${cfg.color}`}
              >
                {payment.status}
              </Badge>
              {iremboStatus && iremboStatus !== payment.status && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  IremboPay: {iremboStatus}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {payment.status === "completed"
                ? "Payment has been verified and collected successfully via IremboPay."
                : payment.status === "processing"
                ? "Payment is currently being processed by IremboPay."
                : payment.status === "pending"
                ? "Payment has been initiated but not yet completed by the applicant."
                : payment.status === "failed"
                ? "Payment attempt failed. The applicant may need to retry."
                : payment.status === "cancelled"
                ? "Payment was cancelled by the applicant."
                : "Payment status requires manual review."}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold tracking-tight">
              {formatCurrency(payment.amount, payment.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {payment.purpose === "annual_report_fee" ? "Annual Report Fee" : "Application Fee"}
            </p>
          </div>
        </div>

        {/* Verification indicator for staff */}
        {payment.status === "completed" ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-100/60 dark:bg-emerald-900/20 px-3 py-2 border border-emerald-200/60 dark:border-emerald-800/40">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Payment collection confirmed — safe to proceed with application assessment.
            </p>
          </div>
        ) : payment.status === "failed" || payment.status === "cancelled" ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-100/60 dark:bg-red-900/20 px-3 py-2 border border-red-200/60 dark:border-red-800/40">
            <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">
              Payment was not collected. Verify with applicant before proceeding.
            </p>
          </div>
        ) : null}
      </div>

      {/* ============ Payment Details Grid ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* --- Transaction Details --- */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Receipt className="h-4 w-4" />
              Transaction Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-0.5">
            <DetailRow
              icon={Hash}
              label="IremboPay Invoice Number"
              value={iremboInvoice}
              mono
              copyable
            />
            <DetailRow
              icon={Hash}
              label="Transaction ID"
              value={iremboTxnId}
              mono
              copyable
            />
            <DetailRow
              icon={Hash}
              label="Payment Reference"
              value={paymentReference}
              mono
              copyable
            />
            {paymentAccountId && (
              <DetailRow
                icon={Banknote}
                label="Payment Account"
                value={paymentAccountId}
                mono
                copyable
              />
            )}
            <DetailRow
              icon={Hash}
              label="Internal Request ID"
              value={payment.irembo_request_id}
              mono
              copyable
            />
            <DetailRow
              icon={CreditCard}
              label="Payment Method"
              value={paymentMethod}
            />
            <Separator className="my-2" />
            <DetailRow
              icon={Banknote}
              label="Amount"
              value={formatCurrency(payment.amount, payment.currency)}
            />
            {payment.description && (
              <DetailRow
                icon={Receipt}
                label="Description"
                value={payment.description}
              />
            )}
          </CardContent>
        </Card>

        {/* --- Customer & Timing --- */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              Customer & Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-0.5">
            <DetailRow icon={User} label="Customer Name" value={customerName} />
            <DetailRow icon={Mail} label="Customer Email" value={customerEmail} copyable />
            <DetailRow icon={Phone} label="Customer Phone" value={customerPhone} copyable />

            {showGatewayCustomerDiff && (
              <>
                <Separator className="my-2" />
                <DetailRow icon={User} label="IremboPay Customer Name" value={gatewayCustomerName} />
                <DetailRow icon={Mail} label="IremboPay Customer Email" value={gatewayCustomerEmail} copyable />
                <DetailRow icon={Phone} label="IremboPay Customer Phone" value={gatewayCustomerPhone} copyable />
              </>
            )}

            <Separator className="my-2" />

            <DetailRow
              icon={CalendarClock}
              label="Payment Initiated"
              value={formatDate(payment.initiated_at)}
            />
            {payment.processing_at && (
              <DetailRow
                icon={CalendarClock}
                label="Processing Started"
                value={formatDate(payment.processing_at)}
              />
            )}
            <DetailRow
              icon={CalendarClock}
              label="Payment Completed"
              value={formatDate(paidAt)}
            />
            {payment.failed_at && (
              <DetailRow
                icon={CalendarClock}
                label="Payment Failed"
                value={formatDate(payment.failed_at)}
              />
            )}
            {payment.expires_at && (
              <DetailRow
                icon={CalendarClock}
                label="Expires At"
                value={formatDate(payment.expires_at)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ Gateway Raw Response (collapsible) ============ */}
      {gw && Object.keys(gw).length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-0 pt-3 px-5">
            <button
              type="button"
              className="flex w-full items-center justify-between py-1"
              onClick={() => setShowGatewayDetails(!showGatewayDetails)}
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                IremboPay Gateway Response
              </CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{showGatewayDetails ? "Hide" : "Show"} raw data</span>
                {showGatewayDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </button>
          </CardHeader>
          <AnimatePresence initial={false}>
            {showGatewayDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <CardContent className="px-5 pb-4 pt-2">
                  <pre className="text-xs font-mono bg-muted/50 dark:bg-muted/20 rounded-lg p-4 overflow-x-auto max-h-80 border whitespace-pre-wrap break-all">
                    {JSON.stringify(gw, null, 2)}
                  </pre>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          {(payment.status === "pending" || payment.status === "processing") && (
            <Button variant="outline" size="sm" onClick={verifyWithIremboPay} disabled={isVerifying}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isVerifying ? "animate-spin" : ""}`} />
              {isVerifying ? "Verifying…" : "Verify with IremboPay"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={fetchPayment} className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh Payment Data
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default PaymentConfirmationPanel;
