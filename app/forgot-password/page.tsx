"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { PasswordStrength } from "@/components/auth/password-strength";
import { validatePassword } from "@/lib/security/password";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "set_password">("request");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!trimmedEmail) {
      setError(tx("Please enter your email address."));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, purpose: "password_reset" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || tx("Failed to send reset code. Please try again."));
        return;
      }

      // Security/UX: don't reveal whether an email exists.
      setSuccess(
        tx("If an account exists for this email, you'll receive a password reset code shortly. Please check your inbox (and spam).")
      );
      setStep("verify");
    } catch {
      setError(tx("Failed to send reset code. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!trimmedEmail) {
      setError(tx("Please enter your email address."));
      setStep("request");
      return;
    }

    const c = code.trim();
    if (!c) {
      setError(tx("Please enter the code we sent to your email."));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, code: c }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || tx("Invalid or expired code. Please try again."));
        return;
      }

      const token = String(json?.resetToken ?? "").trim();
      if (!token) {
        setError(tx("Server error: missing reset token. Please resend the code and try again."));
        return;
      }
      setResetToken(token);
      setSuccess(tx("Code verified. Please set your new password."));
      setStep("set_password");
    } catch {
      setError(tx("Could not verify code. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!resetToken) {
      setError(tx("Your reset session expired. Please verify the code again."));
      setStep("verify");
      return;
    }

    if (!password || !confirmPassword) {
      setError(tx("Please fill in all fields."));
      return;
    }

    if (password !== confirmPassword) {
      setError(tx("Passwords do not match."));
      return;
    }

    // Same policy the /api/auth/password-reset/confirm route enforces.
    const strength = validatePassword(password, { email: trimmedEmail });
    if (!strength.valid) {
      setError(tx(strength.errors[0]));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword: password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || tx("Could not update password. Please try again."));
        return;
      }

      setSuccess(json?.message || tx("Password updated successfully! Redirecting to login…"));
      setTimeout(() => {
        router.push("/login?message=Password updated successfully! Please sign in with your new password.");
      }, 1500);
    } catch {
      setError(tx("Could not update password. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">{tx("Forgot password")}</CardTitle>
            <CardDescription>
              {step === "request"
                ? tx("Enter your email and we'll send you a reset code.")
                : step === "verify"
                  ? tx("Enter the code from your email to verify your request.")
                  : tx("Code verified. Choose a new password.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={
                step === "request" ? handleSendCode : step === "verify" ? handleVerifyCode : handleSetPassword
              }
              className="space-y-4"
            >
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">
                  {success}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{tx("Email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-9"
                    autoComplete="email"
                  />
                </div>
              </div>

              {step !== "request" && step !== "set_password" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="code">{tx("Code")}</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder={tx("6-digit code")}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                </>
              )}

              {step === "set_password" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">{tx("New Password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={tx("Enter new password")}
                        required
                        disabled={isLoading}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? tx("Hide password") : tx("Show password")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <PasswordStrength password={password} context={{ email: trimmedEmail }} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{tx("Confirm New Password")}</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={tx("Confirm new password")}
                        required
                        disabled={isLoading}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? tx("Hide confirm password") : tx("Show confirm password")}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isLoading ||
                  !trimmedEmail ||
                  (step === "verify" && !code.trim()) ||
                  (step === "set_password" && (!password || !confirmPassword))
                }
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {step === "request" ? tx("Sending…") : step === "verify" ? tx("Verifying…") : tx("Updating…")}
                  </span>
                ) : step === "request" ? tx("Send reset code") : step === "verify" ? tx("Verify code") : tx("Update password")}
              </Button>

              {step === "verify" && (
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setStep("request");
                      setCode("");
                      setResetToken("");
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={isLoading}
                  >
                    {tx("Change email")}
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      setError("");
                      setSuccess("");
                      setIsLoading(true);
                      try {
                        const res = await fetch("/api/auth/email/send-code", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: trimmedEmail, purpose: "password_reset" }),
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok || !json?.success) {
                          setError(json?.message || tx("Failed to resend code. Please try again."));
                          return;
                        }
                        setSuccess(tx("Code resent. Please check your email."));
                      } catch {
                        setError(tx("Failed to resend code. Please try again."));
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isLoading || !trimmedEmail}
                  >
                    {tx("Resend code")}
                  </button>
                </div>
              )}
            </form>

            <div className="mt-6 text-center text-sm">
              <Link href="/login" className="underline">
                {tx("Back to login")}
              </Link>
              <span className="mx-2 text-muted-foreground">·</span>
              <Link href="/register" className="underline">
                {tx("Create an account")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


