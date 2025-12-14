"use client";

import { useSearchParams } from "next/navigation";
import { EmailVerificationPending } from "@/components/auth/email-verification-pending";

export function EmailVerificationPendingHandler() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const handleResendEmail = async () => {
    if (!email) {
      return { success: false, message: 'Email address is required' };
    }

    try {
      // We use custom OTP-by-email via our API (Resend), not Supabase auth email links.
      const resp = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'signup' }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        return { success: false, message: data?.message || 'Failed to send verification code' };
      }

      return { 
        success: true, 
        message: 'Verification code sent successfully! Please check your inbox.' 
      };
    } catch (error) {
      console.error('Unexpected resend error:', error);
      return { 
        success: false, 
        message: 'An unexpected error occurred. Please try again.' 
      };
    }
  };

  if (!email) {
    return (
      <div className="text-center">
        <p className="text-red-600">Email address not found. Please go back and try again.</p>
      </div>
    );
  }

  return (
    <EmailVerificationPending
      email={email}
      onResendEmail={handleResendEmail}
    />
  );
}
