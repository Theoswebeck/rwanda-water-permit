"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Mail, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { rwbConfig } from "@/config/rwb.config";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

function normalizeRole(input: unknown): string {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "application") return "applicant";
  return raw;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingSession, setIsClearingSession] = useState(false);
  const [showEmailVerificationHelp, setShowEmailVerificationHelp] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, verifyTwoFactor, user, userProfile } = useAuth();

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const clearSavedSession = async () => {
    setIsClearingSession(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { credentials: "include" });
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // storage access can fail in strict sandbox modes
      }
      setSuccess(tx("Saved session cleared. You can now try signing in again."));
    } catch {
      setError(tx("Failed to clear saved session. Please try refreshing the page."));
    } finally {
      setIsClearingSession(false);
    }
  };

  useEffect(() => {
    const verified = searchParams.get("verified");
    const registered = searchParams.get("registered");
    const message = searchParams.get("message");
    const emailParam = searchParams.get("email");

    if (emailParam) {
      setEmail(emailParam);
    }

    if (verified === "true") {
      setSuccess(tx("Email verified successfully! You can now log in to your account."));
    } else if (registered === "true") {
      setSuccess(tx("Account created successfully! Please check your email for a verification code before logging in."));
    }

    const errorParam = searchParams.get("error");
    if (message) {
      setSuccess(tx(message));
    }

    if (errorParam) {
      switch (errorParam) {
        case "suspended":
          setError(tx("Your account has been suspended. Please contact support."));
          break;
        case "inactive":
          setError(tx("Your account is inactive. Please contact support to reactivate."));
          break;
        case "session_timeout":
          setError(tx("Your session has expired. Please sign in again."));
          break;
        default:
          setError(tx("An authentication error occurred."));
      }

      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        url.searchParams.delete("message");
        window.history.replaceState({}, "", url.toString());
      }, 1000);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!shouldRedirect || !user) return;

    const getRedirectPath = (role: string | undefined): string => {
      switch (role) {
        case "admin":
          return "/admin";
        case "approver":
          return "/approver";
        case "inspector":
          return "/inspection";
        case "reviewer":
          return "/review";
        case "assessor":
          return "/assessment";
        case "verifier":
          return "/verification";
        case "applicant":
        default:
          return "/dashboard";
      }
    };

    const effectiveRoles =
      (user.user_metadata?.effective_roles as string[] | undefined) ||
      (userProfile?.effective_roles as string[] | undefined) ||
      [];
    const normalizedEffective = effectiveRoles.map((r) => normalizeRole(r)).filter(Boolean);
    const rolePriority = ["admin", "approver", "verifier", "inspector", "reviewer", "assessor", "applicant"];
    const highestRole = rolePriority.find((r) => normalizedEffective.includes(r));
    const role = highestRole ?? normalizeRole(userProfile?.role ?? (user.user_metadata?.role as string | undefined));
    const redirectPath = getRedirectPath(role);

    setShouldRedirect(false);
    router.push(redirectPath);
  }, [shouldRedirect, user, userProfile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError("");
    setIsLoading(true);

    try {
      const result = await signIn(email, password);

      if (result.error) {
        setError(result.error);
        if (result.error.includes("verify your email") || result.error.includes("email not confirmed")) {
          setShowEmailVerificationHelp(true);
        }
        return;
      }

      if (result.twoFactorRequired) {
        setSuccess(tx("We sent a sign-in code to your email address."));
        setTwoFactorRequired(true);
        return;
      }

      if (result.mustChangePassword) {
        router.push("/change-password-required");
        return;
      }

      setShouldRedirect(true);
    } catch {
      setError(tx("An unexpected error occurred. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    setError("");
    setIsLoading(true);
    try {
      const result = await verifyTwoFactor(code.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.mustChangePassword) {
        router.push("/change-password-required");
        return;
      }
      setShouldRedirect(true);
    } catch {
      setError(tx("An unexpected error occurred. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendingCode(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login/resend-2fa", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || tx("Could not resend the code. Please try signing in again."));
        return;
      }
      setSuccess(tx("A new sign-in code is on its way to your email."));
    } catch {
      setError(tx("Could not send the code. Please try again."));
    } finally {
      setResendingCode(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError(tx("Please enter your email address first."));
      return;
    }

    setResendingEmail(true);
    setError("");

    try {
      const res = await fetch("/api/auth/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || json?.error || tx("Failed to send verification email. Please try again."));
        return;
      }
      setSuccess(tx("Verification email sent successfully! Please check your inbox."));
      setShowEmailVerificationHelp(false);
    } catch {
      setError(tx("Failed to send verification email. Please try again."));
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div className="w-full max-w-[960px] mx-auto animate-in fade-in duration-500">
      {/* Official RWB Split Card Design */}
      <div className="bg-white rounded-[20px] shadow-[0_15px_50px_-12px_rgba(0,0,0,0.22)] flex flex-col md:flex-row overflow-hidden min-h-[580px] border border-slate-100">
        
        {/* Left Panel: Official RWB Identity & Branding */}
        <div className="md:w-1/2 bg-gradient-to-br from-[#0072bc] via-[#0062a3] to-[#004f84] p-8 sm:p-12 flex flex-col justify-between text-white relative overflow-hidden select-none">
          {/* Ambient Decorative Shapes */}
          <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-white/10 rounded-full pointer-events-none blur-sm" />
          <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full pointer-events-none blur-sm" />

          {/* Top Brand Logo */}
          <div className="relative z-10">
            <Link
              href="/"
              title={tx("Return to Portal Home")}
              className="inline-block bg-white/15 hover:bg-white/25 backdrop-blur-xs p-3 rounded-xl border border-white/20 mb-4 transition-all"
            >
              <Image
                src="/images/logo_New.png"
                alt="Rwanda Water Resources Board"
                width={140}
                height={38}
                className="object-contain max-h-[38px] brightness-0 invert"
                priority
              />
            </Link>
          </div>

          {/* Center Welcome Text */}
          <div className="relative z-10 my-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-wide mb-2">
              WELCOME
            </h2>
            <h3 className="text-base sm:text-lg font-semibold text-white/95 mb-3 leading-snug">
              {rwbConfig.name}
            </h3>
            <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
              Official digital authorization, technical assessment, and concession management portal of the Rwanda Water Resources Board.
            </p>
          </div>

          {/* Bottom Trust Badge */}
          <div className="relative z-10 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-white/80">
            <span>{rwbConfig.institution.country}</span>
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Official RWB Portal
            </span>
          </div>
        </div>

        {/* Right Panel: Authentication Form */}
        <div className="md:w-1/2 bg-white p-8 sm:p-12 flex flex-col justify-center">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#212529] tracking-tight">
              {twoFactorRequired ? tx("Enter sign-in code") : tx("Sign In")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {twoFactorRequired
                ? tx("Enter the 6-digit verification code sent to your email address.")
                : tx("Enter your institutional credentials to securely access your account.")}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 text-xs sm:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              {success}
            </div>
          )}

          {showEmailVerificationHelp && (
            <Alert className="mb-4 border-blue-200 bg-blue-50">
              <Mail className="h-4 w-4 text-[#0072bc]" />
              <AlertDescription className="text-blue-900 text-xs">
                <p className="mb-2">{tx("Your email address needs to be verified before you can log in.")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendVerification}
                  disabled={resendingEmail || !email}
                  className="w-full text-xs"
                >
                  {resendingEmail ? (
                    <>
                      <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                      {tx("Sending...")}
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      {tx("Resend Verification Email")}
                    </>
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={twoFactorRequired ? handleVerifyCode : handleSubmit} className="space-y-4">
            {twoFactorRequired ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs font-semibold text-slate-700">
                    {tx("6-Digit Verification Code")}
                  </Label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      disabled={isLoading}
                      className="pl-9 text-base tracking-widest font-mono text-center h-11"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {tx("The code expires in 10 minutes and can be used once.")}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                  disabled={isLoading || code.length < 6}
                >
                  {isLoading ? tx("Verifying...") : tx("Verify & Access Portal")}
                </Button>

                <div className="flex items-center justify-between text-xs pt-2">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendingCode || isLoading}
                    className="text-[#0072bc] hover:underline font-semibold cursor-pointer"
                  >
                    {resendingCode ? tx("Sending…") : tx("Resend sign-in code")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorRequired(false);
                      setCode("");
                      setPassword("");
                      setSuccess("");
                    }}
                    disabled={isLoading}
                    className="text-slate-500 hover:text-slate-700 underline cursor-pointer"
                  >
                    {tx("Use another account")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    {tx("Username / Official Email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@institution.rw"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 text-sm bg-slate-50/50 border-slate-200 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                      {tx("Password")}
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-[#0072bc] hover:underline font-medium"
                    >
                      {tx("Forgot password?")}
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 text-sm pr-10 bg-slate-50/50 border-slate-200 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md transition-all cursor-pointer mt-2"
                  disabled={isLoading || !email || !password}
                >
                  {isLoading ? tx("Signing in...") : tx("Sign In")}
                </Button>
              </>
            )}
          </form>

          {!twoFactorRequired && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-xs text-slate-600">
              <p>
                {tx("Don't have an account?")}{" "}
                <Link href="/register" className="text-[#0072bc] font-bold hover:underline">
                  {tx("Create an account")}
                </Link>
              </p>

              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0072bc] font-semibold transition-colors mt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tx("Back to Home Portal")}</span>
              </Link>

              <button
                type="button"
                onClick={clearSavedSession}
                disabled={isClearingSession || isLoading}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer mt-1"
              >
                {isClearingSession ? tx("Clearing session…") : tx("Clear saved browser session")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
