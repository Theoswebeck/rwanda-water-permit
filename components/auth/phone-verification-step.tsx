"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Phone, Shield, CheckCircle, Loader2 } from "lucide-react";

interface PhoneVerificationStepProps {
  onContinue: (phoneNumber: string) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function PhoneVerificationStep({ onContinue, onBack, isLoading = false }: PhoneVerificationStepProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [codeSent, setCodeSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const validatePhone = (phone: string) => {
    if (!phone) {
      setPhoneError("Phone number is required.");
      return false;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10 || !digits.startsWith("07")) {
      setPhoneError("Invalid phone number format. Use 07XXXXXXXX (10 digits).");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhone = e.target.value;
    setPhoneNumber(newPhone);
    if (newPhone.length >= 10) {
      validatePhone(newPhone);
    } else {
      setPhoneError("");
    }
    // Reset code sent state if phone changes
    if (codeSent) {
      setCodeSent(false);
      setVerificationCode(["", "", "", "", "", ""]);
    }
  };

  const handleSendCode = async () => {
    if (!validatePhone(phoneNumber)) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const response = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: null, // Registration flow - no user yet
          phoneNumber: phoneNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to send verification code');
      }

      setCodeSent(true);
      setResendCountdown(60); // 60 second countdown before resend
      
      // Focus first code input
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (value && index === 5 && newCode.every(digit => digit !== "")) {
      handleVerifyCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setVerificationCode(newCode);
      handleVerifyCode(pastedData);
    }
  };

  const handleVerifyCode = async (code: string) => {
    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch('/api/auth/verify-phone/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: null, // Registration flow
          phoneNumber: phoneNumber,
          code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.verified) {
        throw new Error(data.error || data.message || 'Invalid verification code');
      }

      // Success!
      setVerificationSuccess(true);
      
      // Brief delay to show success state, then continue
      setTimeout(() => {
        onContinue(phoneNumber);
      }, 1000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMessage);
      setVerificationCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualVerify = () => {
    const code = verificationCode.join("");
    if (code.length === 6) {
      handleVerifyCode(code);
    } else {
      setError("Please enter all 6 digits");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Phone className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">Verify Your Phone</CardTitle>
          <CardDescription className="text-center">
            {codeSent 
              ? `Enter the 6-digit code sent to ${phoneNumber}`
              : "We'll send a verification code to your phone number"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {verificationSuccess ? (
            <div className="flex flex-col items-center justify-center py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 10 }}
              >
                <div className="p-4 bg-green-100 rounded-full">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                </div>
              </motion.div>
              <p className="mt-4 text-lg font-medium text-green-600">Phone Verified!</p>
              <p className="text-sm text-muted-foreground">Proceeding to next step...</p>
            </div>
          ) : !codeSent ? (
            // Phone input stage
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="07XXXXXXXX"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  className={`text-lg ${phoneError ? 'border-red-500' : ''}`}
                  disabled={isSending || isLoading}
                />
                {phoneError && (
                  <p className="text-xs text-red-500">{phoneError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Enter your phone number (e.g., 0788123456)
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                  disabled={isSending || isLoading}
                  className="flex-1"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!phoneNumber || !!phoneError || isSending || isLoading}
                  className="flex-1"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send Code
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            // Code verification stage
            <div className="space-y-6">
              <div className="space-y-4">
                <Label className="text-center block">Enter verification code</Label>
                <div className="flex justify-center gap-2">
                  {verificationCode.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={handlePaste}
                      className="w-12 h-12 text-center text-xl font-bold"
                      disabled={isVerifying || isLoading}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={verificationCode.some(d => !d) || isVerifying || isLoading}
                  className="w-full"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Verify Code
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSent(false);
                      setVerificationCode(["", "", "", "", "", ""]);
                      setError("");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={isVerifying || isLoading}
                  >
                    Change number
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={resendCountdown > 0 || isSending || isVerifying || isLoading}
                    className={`${resendCountdown > 0 ? 'text-muted-foreground' : 'text-primary hover:underline'}`}
                  >
                    {resendCountdown > 0 
                      ? `Resend in ${resendCountdown}s` 
                      : 'Resend code'
                    }
                  </button>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={isVerifying || isLoading}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to previous step
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}


