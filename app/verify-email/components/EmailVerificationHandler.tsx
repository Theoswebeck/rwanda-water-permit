"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmailVerificationSuccess } from "@/components/auth/email-verification-success";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type VerificationState = 'loading' | 'success' | 'error' | 'expired' | 'invalid';

export function EmailVerificationHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<VerificationState>('loading');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      const type = searchParams.get('type');
      
      if (!token || type !== 'signup') {
        setState('invalid');
        setError('Invalid verification link. Please check your email for the correct link.');
        return;
      }

      try {
        const supabase = createClient();
        
        // Verify the email token
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'signup'
        });

        if (verifyError) {
          console.error('Email verification error:', verifyError);
          
          if (verifyError.message.includes('expired')) {
            setState('expired');
            setError('Verification link has expired. Please request a new one.');
          } else if (verifyError.message.includes('invalid')) {
            setState('invalid');
            setError('Invalid verification link. Please check your email for the correct link.');
          } else {
            setState('error');
            setError(verifyError.message || 'Email verification failed. Please try again.');
          }
          return;
        }

        if (data.user) {
          setEmail(data.user.email || '');
          setState('success');
          
          // Optional: Update user profile to mark email as verified
          try {
            await supabase
              .from('users')
              .update({ 
                email_verified: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', data.user.id);
          } catch (profileError) {
            console.warn('Failed to update profile verification status:', profileError);
            // Don't fail the entire verification for this
          }
        } else {
          setState('error');
          setError('Email verification failed. Please try again.');
        }
      } catch (error) {
        console.error('Unexpected verification error:', error);
        setState('error');
        setError('An unexpected error occurred. Please try again.');
      }
    };

    verifyEmail();
  }, [searchParams]);

  const handleResendVerification = async () => {
    try {
      const supabase = createClient();
      
      // We'll need the user to enter their email again for resending
      router.push('/register?resend=true');
    } catch (error) {
      console.error('Error redirecting to resend:', error);
    }
  };

  if (state === 'loading') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
          <CardTitle>Verifying Your Email</CardTitle>
          <CardDescription>
            Please wait while we verify your email address...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'success') {
    return <EmailVerificationSuccess email={email} />;
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center space-y-4">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
          state === 'expired' ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          {state === 'expired' ? (
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          ) : (
            <XCircle className="h-8 w-8 text-red-600" />
          )}
        </div>
        
        <div className="space-y-2">
          <CardTitle className={`text-2xl font-bold ${
            state === 'expired' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {state === 'expired' ? 'Link Expired' : 'Verification Failed'}
          </CardTitle>
          <CardDescription>
            {state === 'expired' 
              ? 'Your verification link has expired.'
              : 'We couldn\'t verify your email address.'
            }
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Alert className={`${
          state === 'expired' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'
        }`}>
          <AlertTriangle className={`h-4 w-4 ${
            state === 'expired' ? 'text-yellow-600' : 'text-red-600'
          }`} />
          <AlertDescription className={`${
            state === 'expired' ? 'text-yellow-700' : 'text-red-700'
          }`}>
            {error}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <div className="w-2 h-2 rounded-full bg-gray-400 mt-2"></div>
            <p>Check that you clicked the correct link from your email</p>
          </div>
          
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <div className="w-2 h-2 rounded-full bg-gray-400 mt-2"></div>
            <p>Verification links expire after 24 hours</p>
          </div>
          
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <div className="w-2 h-2 rounded-full bg-gray-400 mt-2"></div>
            <p>You can request a new verification email below</p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleResendVerification}
            className="w-full"
          >
            Get New Verification Link
          </Button>

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => router.push('/login')}
              className="text-sm"
            >
              Back to Login
            </Button>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <a href="/contact" className="text-primary hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
