"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EmailVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onResendEmail: () => Promise<{ success: boolean; message?: string }>;
  onCheckVerification: () => Promise<{ verified: boolean; message?: string }>;
  isLoading?: boolean;
}

export function EmailVerificationDialog({
  open,
  onOpenChange,
  email,
  onResendEmail,
  onCheckVerification,
  isLoading = false,
}: EmailVerificationDialogProps) {
  const [resendLoading, setResendLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMessage(null);
      setTimeLeft(60);
      setCanResend(false);
      
      // Start countdown timer
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [open]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    setMessage(null);
    
    try {
      const result = await onResendEmail();
      
      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Verification email sent successfully! Please check your inbox.',
        });
        
        // Reset timer
        setTimeLeft(60);
        setCanResend(false);
        
        const timer = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              setCanResend(true);
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
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

  const handleCheckVerification = async () => {
    setCheckLoading(true);
    setMessage(null);
    
    try {
      const result = await onCheckVerification();
      
      if (result.verified) {
        setMessage({
          type: 'success',
          text: 'Email verified successfully! You can now continue.',
        });
        
        // Close dialog after a brief delay
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setMessage({
          type: 'info',
          text: result.message || 'Email not yet verified. Please check your email and click the verification link.',
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to check verification status. Please try again.',
      });
    } finally {
      setCheckLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Verify Your Email
          </DialogTitle>
          <DialogDescription>
            We&apos;ve sent a verification link to your email address.
          </DialogDescription>
        </DialogHeader>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Check Your Email
              </CardTitle>
              <CardDescription>
                We sent a verification link to:
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="font-medium text-sm">{email}</p>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
                  <p>Click the verification link in your email to confirm your account</p>
                </div>
                
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
                  <p>Check your spam folder if you don&apos;t see the email</p>
                </div>
                
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
                  <p>The verification link will expire in 24 hours</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {message && (
            <Alert className={`${
              message.type === 'error' ? 'border-red-200 bg-red-50' :
              message.type === 'success' ? 'border-green-200 bg-green-50' :
              'border-blue-200 bg-blue-50'
            }`}>
              <AlertTriangle className={`h-4 w-4 ${
                message.type === 'error' ? 'text-red-600' :
                message.type === 'success' ? 'text-green-600' :
                'text-blue-600'
              }`} />
              <AlertDescription className={`${
                message.type === 'error' ? 'text-red-700' :
                message.type === 'success' ? 'text-green-700' :
                'text-blue-700'
              }`}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleCheckVerification}
              disabled={checkLoading || isLoading}
              className="w-full"
            >
              {checkLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  I&apos;ve Verified My Email
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Didn&apos;t receive the email?
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={resendLoading || !canResend || isLoading}
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
                  {canResend ? 'Resend Email' : `Resend in ${formatTime(timeLeft)}`}
                </>
              )}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <a href="https://waterpermit.rwb.rw/contact" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
