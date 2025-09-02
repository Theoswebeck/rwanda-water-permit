"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, RefreshCw, ShieldCheck } from "lucide-react";

interface EmailCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onVerified: (code: string) => void;
}

export function EmailCodeDialog({ open, onOpenChange, email, onVerified }: EmailCodeDialogProps) {
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setTimeLeft(60);
    const t = setInterval(() => setTimeLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [open]);

  const requestCode = async () => {
    setResending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(data.message || "Failed to send code");
      } else if (data.devCode) {
        // For developers, autofill helps testing quickly
        setCode(data.devCode.split("").slice(0, 6));
      }
      setTimeLeft(60);
    } catch (e) {
      setMessage("Network error while sending code");
    } finally {
      setResending(false);
    }
  };

  const handleChange = (i: number, v: string) => {
    if (v && !/^\d+$/.test(v)) return;
    const next = [...code];
    if (v.length > 1) {
      v.split("").slice(0, 6 - i).forEach((d, idx) => (next[i + idx] = d));
    } else {
      next[i] = v;
    }
    setCode(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const verify = async () => {
    const full = code.join("");
    if (full.length !== 6) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/email/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: full }),
      });
      const data = await res.json();
      if (data.success) {
        onVerified(full);
        onOpenChange(false);
      } else {
        setMessage(data.message || "Invalid or expired code");
      }
    } catch (e) {
      setMessage("Network error while verifying code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Verify your email
          </DialogTitle>
          <DialogDescription>Enter the 6-digit code sent to {email}</DialogDescription>
        </DialogHeader>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {message && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                value={code[i]}
                onChange={(e) => handleChange(i, e.target.value)}
                className="w-12 h-12 text-center text-xl"
                inputMode="numeric"
                maxLength={1}
              />
            ))}
          </div>

          <Button disabled={loading || code.join("").length !== 6} onClick={verify} className="w-full">
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Verifying...
              </span>
            ) : (
              'Verify'
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={resending || timeLeft > 0}
            onClick={requestCode}
            className="w-full"
          >
            {resending ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Sending...
              </span>
            ) : timeLeft > 0 ? (
              `Resend in ${timeLeft}s`
            ) : (
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Resend code
              </span>
            )}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}


