"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { PasswordStrength } from "@/components/auth/password-strength";
import { validatePassword } from "@/lib/security/password";
import { rwbConfig } from "@/config/rwb.config";

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
    if (!trimmedEmail) { setError(tx("Please enter your email address.")); return; }
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
      setSuccess(tx("If an account exists for this email, you'll receive a password reset code shortly. Please check your inbox (and spam)."));
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
    if (!trimmedEmail) { setError(tx("Please enter your email address.")); setStep("request"); return; }
    const c = code.trim();
    if (!c) { setError(tx("Please enter the code we sent to your email.")); return; }
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
      if (!token) { setError(tx("Server error: missing reset token. Please resend the code and try again.")); return; }
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
    if (!resetToken) { setError(tx("Your reset session expired. Please verify the code again.")); setStep("verify"); return; }
    if (!password || !confirmPassword) { setError(tx("Please fill in all fields.")); return; }
    if (password !== confirmPassword) { setError(tx("Passwords do not match.")); return; }
    const strength = validatePassword(password, { email: trimmedEmail });
    if (!strength.valid) { setError(tx(strength.errors[0])); return; }
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

  const stepTitle =
    step === "request"
      ? tx("Forgot Password?")
      : step === "verify"
      ? tx("Verify Your Code")
      : tx("Set New Password");

  const stepSubtitle =
    step === "request"
      ? tx("Enter your registered email address and we'll send you a reset code.")
      : step === "verify"
      ? tx("Enter the 6-digit code sent to your email.")
      : tx("Code verified. Choose a strong new password.");

  return (
    <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[950px] animate-in fade-in duration-500">
        {/* Split Card */}
        <div className="bg-white rounded-[20px] shadow-[0_15px_50px_-12px_rgba(0,0,0,0.25)] flex flex-col md:flex-row overflow-hidden min-h-[500px]">

          {/* ── Left Panel ── */}
          <div className="md:w-1/2 bg-gradient-to-br from-[#0072bc] to-[#005a96] p-8 sm:p-12 flex flex-col justify-between text-white relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-white/10 rounded-full pointer-events-none" />
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full pointer-events-none" />

            {/* Logo */}
            <div className="relative z-10">
              <Link
                href="/"
                title={tx("Return to Portal Home")}
                className="inline-block bg-white/15 hover:bg-white/25 backdrop-blur-xs p-3 rounded-xl border border-white/20 mb-6 transition-all"
              >
                <Image
                  src="/images/logo_New.png"
                  alt="RWB Logo"
                  width={140}
                  height={38}
                  className="object-contain max-h-[38px] brightness-0 invert"
                  priority
                />
              </Link>
            </div>

            {/* Information */}
            <div className="relative z-10 my-6">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-wide mb-2">
                RECOVER ACCESS
              </h2>
              <h3 className="text-lg font-semibold text-white/95 mb-4 leading-snug">
                {rwbConfig.name}
              </h3>
              <p className="text-sm text-white/85 leading-relaxed">
                {"Don't worry, it happens! Enter your registered email address and we'll send you an encrypted reset code to safely restore access to your account."}
              </p>

              {/* Step indicators */}
              <div className="flex items-center gap-3 mt-8">
                {(["request", "verify", "set_password"] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        step === s
                          ? "bg-white text-[#0072bc] border-white"
                          : i < ["request", "verify", "set_password"].indexOf(step)
                          ? "bg-white/30 text-white border-white/50"
                          : "bg-white/10 text-white/50 border-white/20"
                      }`}
                    >
                      {i + 1}
                    </div>
                    {i < 2 && <div className="w-4 h-0.5 bg-white/30" />}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-white/70 font-medium">
                {step === "request" ? tx("Step 1: Enter Email") : step === "verify" ? tx("Step 2: Verify Code") : tx("Step 3: Set Password")}
              </div>
            </div>

            {/* Bottom info */}
            <div className="relative z-10 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-white/80">
              <span>{rwbConfig.institution.country}</span>
              <span className="flex items-center gap-1.5 font-medium">
                <i className="fa fa-envelope-open-text text-xs" /> {tx("Instant Email Delivery")}
              </span>
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div className="md:w-1/2 bg-white p-8 sm:p-12 flex flex-col justify-center">
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#212529] tracking-tight">
                {stepTitle}
              </h1>
              <p className="text-sm text-slate-500 mt-1">{stepSubtitle}</p>
            </div>

            {error && (
              <div className="p-3 mb-4 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <i className="fa fa-exclamation-circle text-rose-500" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 mb-4 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                <i className="fa fa-check-circle text-emerald-500" />
                <span>{success}</span>
              </div>
            )}

            <form
              onSubmit={step === "request" ? handleSendCode : step === "verify" ? handleVerifyCode : handleSetPassword}
              className="space-y-4"
            >
              {/* Email field — always shown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {tx("Email Address")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <i className="fa fa-envelope text-sm" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. name@rwb.rw"
                    disabled={isLoading || step !== "request"}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#0072bc] focus:ring-2 focus:ring-[#0072bc]/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Verify step — code field */}
              {step === "verify" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {tx("Reset Code")}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <i className="fa fa-key text-sm" />
                    </div>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder={tx("6-digit code")}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={isLoading}
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#0072bc] focus:ring-2 focus:ring-[#0072bc]/15 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Set password step */}
              {step === "set_password" && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      {tx("New Password")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <i className="fa fa-lock text-sm" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={tx("Enter new password")}
                        required
                        disabled={isLoading}
                        autoComplete="new-password"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#0072bc] focus:ring-2 focus:ring-[#0072bc]/15 transition-all"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? tx("Hide password") : tx("Show password")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} context={{ email: trimmedEmail }} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      {tx("Confirm New Password")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <i className="fa fa-lock text-sm" />
                      </div>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={tx("Confirm new password")}
                        required
                        disabled={isLoading}
                        autoComplete="new-password"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#0072bc] focus:ring-2 focus:ring-[#0072bc]/15 transition-all"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? tx("Hide confirm password") : tx("Show confirm password")}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={
                  isLoading ||
                  !trimmedEmail ||
                  (step === "verify" && !code.trim()) ||
                  (step === "set_password" && (!password || !confirmPassword))
                }
                className="w-full py-3 bg-[#0072bc] hover:bg-[#005a96] text-white font-bold rounded-lg text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:pointer-events-none mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {step === "request" ? tx("Sending…") : step === "verify" ? tx("Verifying…") : tx("Updating…")}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {step === "request" ? tx("Send Reset Code") : step === "verify" ? tx("Verify Code") : tx("Update Password")}
                    </span>
                    <i className={`fa ${step === "request" ? "fa-paper-plane" : step === "verify" ? "fa-check" : "fa-save"} text-xs`} />
                  </>
                )}
              </button>

              {/* Verify step helpers */}
              {step === "verify" && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    className="text-[#0072bc] font-semibold hover:underline"
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
                    <i className="fa fa-arrow-left mr-1 text-xs" />
                    {tx("Change email")}
                  </button>
                  <button
                    type="button"
                    className="text-slate-500 font-semibold hover:text-[#0072bc] hover:underline"
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
                    {tx("Resend code")} <i className="fa fa-redo text-xs ml-1" />
                  </button>
                </div>
              )}
            </form>

            {/* Footer links */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-2 text-xs">
              <div className="flex items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#0072bc] hover:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {tx("Back to Sign In")}
                </Link>
                <span className="text-slate-300">·</span>
                <Link href="/register" className="font-semibold text-slate-500 hover:text-[#0072bc] hover:underline">
                  {tx("Create an account")}
                </Link>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0072bc] font-semibold transition-colors mt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tx("Back to Home Portal")}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
