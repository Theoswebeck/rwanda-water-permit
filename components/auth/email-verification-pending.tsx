"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Clock, RefreshCw, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";

interface EmailVerificationPendingProps {
  email: string;
  onResendEmail?: () => Promise<{ success: boolean; message?: string }>;
  onBackToSignup?: () => void;
}

export function EmailVerificationPending({
  email,
  onResendEmail,
  onBackToSignup
}: EmailVerificationPendingProps) {
  const router = useRouter();
  const [resendLoading, setResendLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleResendEmail = async () => {
    if (!onResendEmail) return;
    
    setResendLoading(true);
    setMessage(null);
    
    try {
      const result = await onResendEmail();
      
      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Verification email sent successfully! Please check your inbox.',
        });
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Failed to send verification email. Please try again.',
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleBackToSignup = () => {
    if (onBackToSignup) {
      onBackToSignup();
    } else {
      router.push('/register');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md mx-auto"
    >
      <Card>
        <CardHeader className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center"
          >
            <Mail className="h-8 w-8 text-blue-600" />
          </motion.div>
          
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold">
              Check Your Email
            </CardTitle>
            <CardDescription className="text-base">
              We&apos;ve sent a verification link to verify your email address.
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-medium text-blue-700">
                Verification email sent to:
              </p>
            </div>
            <p className="text-sm text-blue-600 mt-1 font-medium">{email}</p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
              <p>Click the verification link in your email to activate your account</p>
            </div>
            
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
              <p>Check your spam or junk folder if you don&apos;t see the email</p>
            </div>
            
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
              <p>The verification link will expire in 24 hours</p>
            </div>
          </div>

          {message && (
            <Alert className={`${
              message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
            }`}>
              <Clock className={`h-4 w-4 ${
                message.type === 'error' ? 'text-red-600' : 'text-green-600'
              }`} />
              <AlertDescription className={`${
                message.type === 'error' ? 'text-red-700' : 'text-green-700'
              }`}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {onResendEmail && (
              <Button
                variant="outline"
                onClick={handleResendEmail}
                disabled={resendLoading}
                className="w-full"
              >
                {resendLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Resend Verification Email
                  </>
                )}
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              onClick={handleBackToSignup}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign Up
            </Button>
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
    </motion.div>
  );
}
