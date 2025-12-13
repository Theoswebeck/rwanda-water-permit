"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface PhoneVerificationProps {
  phoneNumber: string;
  onSubmit: (code: string) => void;
  onResendCode: () => void;
  isLoading?: boolean;
  error?: string;
  onClearError?: () => void;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  const last = digits.slice(-3);
  return `***${last}`;
}

export function PhoneVerification({
  phoneNumber,
  onSubmit,
  onResendCode,
  isLoading = false,
  error,
  onClearError,
}: PhoneVerificationProps) {
  const CODE_LEN = 6;
  const [code, setCode] = useState<string[]>(Array.from({ length: CODE_LEN }, () => ""));
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d+$/.test(value)) return;
    if (error) onClearError?.();

    const next = [...code];

    // Paste support
    if (value.length > 1) {
      const digits = value.split("").slice(0, CODE_LEN);
      for (let i = 0; i < digits.length; i++) {
        if (i + index < CODE_LEN) next[i + index] = digits[i];
      }
      setCode(next);
      const nextIndex = Math.min(index + digits.length, CODE_LEN - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    next[index] = value;
    setCode(next);
    if (value && index < CODE_LEN - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const submit = () => {
    const full = code.join("");
    if (full.length !== CODE_LEN || isLoading) return;
    onSubmit(full);
  };

  const resend = () => {
    if (countdown > 0 || isResending) return;
    if (error) onClearError?.();
    setIsResending(true);
    onResendCode();
    setTimeout(() => {
      setIsResending(false);
      setCountdown(30);
    }, 800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Verify your phone</CardTitle>
          <CardDescription className="text-center">
            We&apos;ve sent a verification code to <span className="font-medium">{maskPhone(phoneNumber)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!!error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Enter 6-digit code</Label>
              <div className="flex justify-center gap-2">
                {Array.from({ length: CODE_LEN }).map((_, index) => (
                  <Input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    id={`code-${index}`}
                    type="text"
                    maxLength={CODE_LEN}
                    value={code[index]}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className={`w-12 h-12 text-center text-xl ${error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                ))}
              </div>
            </div>

            <Button onClick={submit} className="w-full" disabled={code.join("").length !== CODE_LEN || isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify Phone"
              )}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center text-muted-foreground">
            Didn&apos;t receive the code?{" "}
            <button
              type="button"
              onClick={resend}
              disabled={countdown > 0 || isResending}
              className={`text-primary hover:underline font-medium ${
                countdown > 0 || isResending ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isResending ? "Resending..." : countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
            </button>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}


