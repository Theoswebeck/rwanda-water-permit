"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Shield, CheckCircle, Loader2 } from "lucide-react";

interface EmailVerificationStepProps {
  email: string;
  onContinue: (emailCode: string) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function EmailVerificationStep({ email, onContinue, onBack, isLoading = false }: EmailVerificationStepProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<string>("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Send code on mount
  useEffect(() => {
    if (!codeSent) {
      handleSendCode();
    }
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleSendCode = async () => {
    setIsSending(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          purpose: 'signup',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to send verification code');
      }

      setCodeSent(true);
      setResendCountdown(60); // 60 second countdown before resend

      // If the API says the email wasn't actually delivered (missing/failed provider), show a friendly warning.
      if (data.delivered === false && data.message) {
        setInfo(data.message);
      }
      
      // Store dev code if provided (for development mode)
      if (data.devCode) {
        setDevCode(data.devCode);
        console.log('📧 Dev email code:', data.devCode);
      }
      
      // Focus first code input
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : tx('An unexpected error occurred');
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
      const response = await fetch('/api/auth/email/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          code: code,
          purpose: 'signup',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }

      // Success!
      setVerificationSuccess(true);
      
      // Continue immediately (parent should redirect to dashboard)
      onContinue(code);

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
      setError(tx("Please enter all 6 digits"));
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
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">{tx("Verify Your Email")}</CardTitle>
          <CardDescription className="text-center">
            {isSending
              ? tx("Sending verification code...")
              : `${tx("Enter the 6-digit code sent to")} ${email}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {info && !error && (
            <div className="p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
              {info}
            </div>
          )}

          {/* Dev code is intentionally not displayed in UI */}

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
              <p className="mt-4 text-lg font-medium text-green-600">{tx("Email Verified!")}</p>
              <p className="text-sm text-muted-foreground">{tx("Redirecting to dashboard...")}</p>
            </div>
          ) : isSending ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="mt-4 text-muted-foreground">{tx("Sending verification code...")}</p>
            </div>
          ) : (
            // Code verification stage
            <div className="space-y-6">
              <div className="space-y-4">
                <Label className="text-center block">{tx("Enter verification code")}</Label>
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
                      {tx("Verifying...")}
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      {tx("Verify & Create Account")}
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-center text-sm">
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={resendCountdown > 0 || isSending || isVerifying || isLoading}
                    className={`${resendCountdown > 0 ? 'text-muted-foreground' : 'text-primary hover:underline'}`}
                  >
                    {resendCountdown > 0
                      ? `${tx("Resend code")} ${resendCountdown}s`
                      : tx("Resend code")
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
                {tx("Back to previous step")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}


