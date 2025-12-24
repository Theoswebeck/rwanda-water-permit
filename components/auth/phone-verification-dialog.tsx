"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Shield,
  AlertTriangle 
} from "lucide-react";

interface PhoneVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  onVerificationComplete: () => void;
  onSendCode: () => Promise<{ success: boolean; message: string; requestId?: number }>;
  onVerifyCode: (code: string, phoneNumber: string, requestId?: number) => Promise<{ success: boolean; message: string; verified?: boolean }>;
  requestId?: number;
}

export function PhoneVerificationDialog({
  open,
  onOpenChange,
  phoneNumber,
  onVerificationComplete,
  onSendCode,
  onVerifyCode,
  requestId
}: PhoneVerificationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [canResend, setCanResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60); // 1 minute cooldown
  const [currentRequestId, setCurrentRequestId] = useState<number | undefined>(requestId);

  // Timer for verification code expiry
  useEffect(() => {
    if (!open || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setError('Verification code has expired. Please request a new one.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, timeLeft]);

  // Timer for resend cooldown
  useEffect(() => {
    if (!open || resendCooldown <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, resendCooldown]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setVerificationCode('');
      setError('');
      setSuccess('');
      setTimeLeft(600);
      setCanResend(false);
      setResendCooldown(60);
      setCurrentRequestId(requestId);
    }
  }, [open, requestId]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (phone: string): string => {
    // Format +250781234567 to +250 781 234 567
    if (phone.startsWith('+250') && phone.length === 13) {
      return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`;
    }
    return phone;
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    setError('');
    setSuccess('');
    
    try {
      const result = await onSendCode();
      
      if (result.success) {
        setSuccess('Verification code sent successfully!');
        setTimeLeft(600); // Reset timer
        setCanResend(false);
        setResendCooldown(60);
        if (result.requestId) {
          setCurrentRequestId(result.requestId);
        }
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to send verification code. Please try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit verification code');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const result = await onVerifyCode(verificationCode, phoneNumber, currentRequestId);
      
      if (result.success && result.verified) {
        setSuccess('Phone number verified successfully!');
        setTimeout(() => {
          onVerificationComplete();
          onOpenChange(false);
        }, 1500);
      } else {
        setError(result.message || 'Invalid verification code');
        setVerificationCode(''); // Clear the code on error
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
      setVerificationCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    // Only allow numbers and limit to 6 digits
    const numericValue = value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(numericValue);
    setError(''); // Clear error when user types
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6 && !loading) {
      handleVerifyCode();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Verify Phone Number
          </DialogTitle>
          <DialogDescription>
            We've sent a verification code to confirm your phone number
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Phone Number Display */}
          <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
            <Phone className="h-4 w-4 text-muted-foreground mr-2" />
            <span className="font-medium">{formatPhoneNumber(phoneNumber)}</span>
          </div>

          {/* Status Alerts */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error-alert"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {success && (
              <motion.div
                key="success-alert"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Verification Code Input */}
          <div className="space-y-2">
            <Label htmlFor="verification-code">Verification Code</Label>
            <div className="relative">
              <Input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter 6-digit code"
                className="text-center text-lg font-mono tracking-widest"
                disabled={loading || sendingCode || timeLeft <= 0}
              />
              {verificationCode.length === 6 && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </motion.div>
              )}
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Enter the 6-digit code sent via SMS</span>
              {timeLeft > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Expires in {formatTime(timeLeft)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleVerifyCode}
              disabled={verificationCode.length !== 6 || loading || timeLeft <= 0}
              className="w-full"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Verify Phone Number
                </>
              )}
            </Button>

            <div className="flex items-center justify-center">
              <span className="text-sm text-muted-foreground mr-2">
                Didn't receive the code?
              </span>
              <Button
                variant="link"
                size="sm"
                onClick={handleSendCode}
                disabled={!canResend || sendingCode || timeLeft <= 0}
                className="p-0 h-auto font-medium"
              >
                {sendingCode ? (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Sending...
                  </>
                ) : canResend ? (
                  <>
                    <MessageSquare className="mr-1 h-3 w-3" />
                    Resend Code
                  </>
                ) : (
                  <>
                    <Clock className="mr-1 h-3 w-3" />
                    Resend in {resendCooldown}s
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Security Notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Security Notice</p>
              <p className="text-blue-700">
                Never share your verification code with anyone. Rwanda Water Resources Board will never ask for your code.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
