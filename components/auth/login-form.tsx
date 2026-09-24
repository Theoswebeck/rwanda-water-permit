"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, verifyTwoFactor, userProfile, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailVerificationHelp, setShowEmailVerificationHelp] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [isClearingSession, setIsClearingSession] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  // RWB staff sign-in is two steps; applicants never see this one.
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [code, setCode] = useState("");
  const [resendingCode, setResendingCode] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const normalizeRole = (role: unknown): string => String(role ?? "").trim().toLowerCase();

  const clearSavedSession = async () => {
    setIsClearingSession(true);
    try {
      // Clear Supabase storage (normal vs incognito difference is primarily cookies/localStorage/extensions).
      // This fixes corrupted/stale sessions that can block profile fetches in regular Chrome.
      const lsKeys = Object.keys(window.localStorage || {});
      for (const k of lsKeys) {
        if (k.startsWith("sb-") || k.includes("supabase")) {
          window.localStorage.removeItem(k);
        }
      }

      const ssKeys = Object.keys(window.sessionStorage || {});
      for (const k of ssKeys) {
        if (k.startsWith("sb-") || k.includes("supabase")) {
          window.sessionStorage.removeItem(k);
        }
      }

      // Remove cookies that look like Supabase auth cookies
      const cookies = document.cookie.split(";").map((c) => c.trim());
      for (const c of cookies) {
        const name = c.split("=")[0];
        if (name.startsWith("sb-") || name.includes("supabase")) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      }

      // Force reload to reinitialize auth state cleanly
      window.location.href = "/login";
    } finally {
      setIsClearingSession(false);
    }
  };

  useEffect(() => {
    // Check for messages from URL params
    const message = searchParams.get('message');
    const errorParam = searchParams.get('error');
    
    if (message) {
      setSuccess(tx(message));
    }
    
    if (errorParam) {
      switch (errorParam) {
        case 'suspended':
          setError(tx('Your account has been suspended. Please contact support.'));
          break;
        case 'inactive':
          setError(tx('Your account is inactive. Please contact support to reactivate.'));
          break;
        case 'session_timeout':
          setError(tx('Your session has expired. Please sign in again.'));
          break;
        default:
          setError(tx('An authentication error occurred.'));
      }
      
      // Clear the URL parameters after showing the error
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('error');
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url.toString());
      }, 1000);
    }
  }, [searchParams]);

  // Handle redirect after successful login - use effective roles (includes delegations)
  useEffect(() => {
    if (!shouldRedirect || !user) return;

    const getRedirectPath = (role: string | undefined): string => {
      switch (role) {
        case 'admin':
          return '/admin';
        case 'approver':
          return '/approver';
        case 'inspector':
          return '/inspection';
        case 'reviewer':
          return '/review';
        case 'assessor':
          return '/assessment';
        case 'verifier':
          return '/verification';
        case 'applicant':
        default:
          return '/dashboard';
      }
    };

    // Prefer effective roles (base + delegated) so delegated approvers land on /approver
    const effectiveRoles = (user.user_metadata?.effective_roles as string[] | undefined) ||
      (userProfile?.effective_roles as string[] | undefined) ||
      [];
    const normalizedEffective = effectiveRoles.map((r) => normalizeRole(r)).filter(Boolean);
    const rolePriority = ['admin', 'approver', 'verifier', 'inspector', 'reviewer', 'assessor', 'applicant'];
    const highestRole = rolePriority.find((r) => normalizedEffective.includes(r));
    const role = highestRole ?? normalizeRole(userProfile?.role ?? (user.user_metadata?.role as string | undefined));
    const redirectPath = getRedirectPath(role);

    console.log("✅ Login successful, redirecting to:", redirectPath, "(effective roles:", normalizedEffective, ")");
    setShouldRedirect(false);
    router.push(redirectPath);
  }, [shouldRedirect, user, userProfile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) return;
    
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Attempting login for:", email);
      
      const result = await signIn(email, password);
      
      if (result.error) {
        console.error("❌ Login failed:", result.error);
        setError(result.error);
        
        // Check if error is related to email verification
        if (result.error.includes('verify your email') || result.error.includes('email not confirmed')) {
          setShowEmailVerificationHelp(true);
        }
        return;
      }
      
      if (result.twoFactorRequired) {
        setSuccess(tx("We sent a sign-in code to your email address."));
        setTwoFactorRequired(true);
        return;
      }

      // Check if user needs to change password (admin-created staff accounts)
      if (result.mustChangePassword) {
        console.log("🔐 Password change required, redirecting...");
        router.push("/change-password-required");
        return;
      }
      
      // Set flag to trigger redirect once profile is loaded
      setShouldRedirect(true);
    } catch (error) {
      console.error("❌ Login error:", error);
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
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || tx("Could not send the code. Please try again."));
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
      const res = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || json?.error || tx('Failed to send verification email. Please try again.'));
        return;
      }
      setSuccess(tx("Verification email sent successfully! Please check your inbox."));
      setShowEmailVerificationHelp(false);
    } catch (error) {
      setError(tx("Failed to send verification email. Please try again."));
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          {twoFactorRequired ? tx("Enter your sign-in code") : tx("Login to your account")}
        </CardTitle>
        <CardDescription>
          {twoFactorRequired
            ? tx("For security, RWB staff sign-in needs a code sent to your email address.")
            : tx("Enter your email below to login to your account")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={twoFactorRequired ? handleVerifyCode : handleSubmit} className="grid gap-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
              {success}
            </div>
          )}
          {showEmailVerificationHelp && (
            <Alert className="border-blue-200 bg-blue-50">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700">
                <div className="space-y-2">
                  <p>{tx("Your email address needs to be verified before you can log in.")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resendingEmail || !email}
                    className="w-full"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {tx("Sending...")}
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        {tx("Resend Verification Email")}
                      </>
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {twoFactorRequired ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="code">{tx("Verification code")}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  {tx("The code expires in 10 minutes and can be used once.")}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || code.length < 6}>
                {isLoading ? tx("Verifying...") : tx("Verify and continue")}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendingCode || isLoading}
                  className="underline"
                >
                  {resendingCode ? tx("Sending…") : tx("Resend code")}
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
                  className="underline"
                >
                  {tx("Use a different account")}
                </button>
              </div>
            </>
          ) : (
            <>
            <div className="grid gap-2">
              <Label htmlFor="email">{tx("Email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">{tx("Password")}</Label>
                <Link
                  href="/forgot-password"
                  className="ml-auto inline-block text-sm underline"
                >
                  {tx("Forgot your password?")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading || !email || !password}
            >
              {isLoading ? tx("Signing in...") : tx("Login")}
            </Button>
            </>
          )}
        </form>
        <div className="mt-4 text-center text-sm">
          {tx("Don't have an account?")}{" "}
          <Link href="/register" className="underline">
            {tx("Sign up")}
          </Link>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          {tx("Having trouble in a regular browser window?")}{" "}
          <button
            type="button"
            onClick={clearSavedSession}
            disabled={isClearingSession || isLoading}
            className="underline"
          >
            {isClearingSession ? tx("Clearing saved session…") : tx("Clear saved session")}
          </button>
        </div>
      </CardContent>
    </Card>
  );
} 