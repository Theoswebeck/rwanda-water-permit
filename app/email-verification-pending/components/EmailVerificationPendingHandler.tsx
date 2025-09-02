"use client";

import { useSearchParams } from "next/navigation";
import { EmailVerificationPending } from "@/components/auth/email-verification-pending";
import { createClient } from "@/lib/supabase/client";

export function EmailVerificationPendingHandler() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const handleResendEmail = async () => {
    if (!email) {
      return { success: false, message: 'Email address is required' };
    }

    try {
      const supabase = createClient();
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`
        }
      });

      if (error) {
        console.error('Resend email error:', error);
        return { 
          success: false, 
          message: error.message || 'Failed to resend verification email' 
        };
      }

      return { 
        success: true, 
        message: 'Verification email sent successfully! Please check your inbox.' 
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
