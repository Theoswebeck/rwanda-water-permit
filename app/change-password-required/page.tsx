"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Key, Loader2, ShieldCheck, CheckCircle2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordStrength } from "@/components/auth/password-strength";
import { validatePassword } from "@/lib/security/password";
import { rwbConfig } from "@/config/rwb.config";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

export default function ChangePasswordRequiredPage() {
  const router = useRouter();
  const { changePassword, userProfile, user, signOut } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(tx("Passwords do not match"));
      return;
    }

    const strength = validatePassword(newPassword, {
      email: user?.email,
      firstName: userProfile?.first_name,
      lastName: userProfile?.last_name,
    });
    if (!strength.valid) {
      setError(tx(strength.errors[0]));
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePassword(newPassword);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);

      const roleRedirects: Record<string, string> = {
        admin: "/admin",
        approver: "/approver",
        verifier: "/verification",
        inspector: "/inspection",
        assessor: "/assessment",
        reviewer: "/review",
        applicant: "/dashboard",
      };

      const effectiveRoles = (userProfile?.effective_roles as string[] | undefined) || [];
      const rolePriority = ["admin", "approver", "verifier", "inspector", "reviewer", "assessor", "applicant"];
      const highestRole = rolePriority.find((r) => effectiveRoles.map((er) => String(er).toLowerCase()).includes(r));
      const redirectRole = highestRole || userProfile?.role || "applicant";
      const redirectPath = roleRedirects[redirectRole] || "/dashboard";

      setTimeout(() => router.push(redirectPath), 600);
    } catch (err) {
      console.error("Password change error:", err);
      setError(tx("An unexpected error occurred. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const userEmail = user?.email || userProfile?.email || "";

  return (
    <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[960px] mx-auto animate-in fade-in duration-500">
        {/* Official RWB Split Card Design matching Login Form */}
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

          {/* Right Panel: Password Change Form */}
          <div className="md:w-1/2 bg-white p-8 sm:p-12 flex flex-col justify-center">
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#212529] tracking-tight">
                {tx("Set New Password")}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {tx("Your account was created by an administrator. Please set a strong password to securely access your account.")}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            {success ? (
              <div className="text-center py-8 space-y-3">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {tx("Password Updated Successfully!")}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  {tx("Redirecting you to your dashboard...")}
                </p>
                <Loader2 className="h-4 w-4 animate-spin text-[#0072bc] mx-auto mt-2" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* User / Email display */}
                {userEmail && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                      {tx("Username / Official Email")}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={userEmail}
                      readOnly
                      disabled
                      className="h-11 text-sm bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed"
                    />
                  </div>
                )}

                {/* New Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-slate-700">
                    {tx("New Password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter your new password"
                      required
                      disabled={isLoading}
                      className="h-11 text-sm pr-10 bg-slate-50/50 border-slate-200 focus:bg-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      title={showNewPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength
                    password={newPassword}
                    context={{
                      email: user?.email,
                      firstName: userProfile?.first_name,
                      lastName: userProfile?.last_name,
                    }}
                  />
                </div>

                {/* Confirm New Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-slate-700">
                    {tx("Confirm New Password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      required
                      disabled={isLoading}
                      className="h-11 text-sm pr-10 bg-slate-50/50 border-slate-200 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password requirements */}
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 space-y-1">
                  <p className="font-semibold text-slate-700">{tx("Password requirements:")}</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1 text-[11px]">
                    <li>{tx("At least 8 characters")}</li>
                    <li>{tx("At least one uppercase and one lowercase letter")}</li>
                    <li>{tx("At least one number")}</li>
                  </ul>
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  className="w-full h-11 bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md transition-all cursor-pointer mt-2"
                  disabled={isLoading || !newPassword || !confirmPassword}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tx("Setting New Password...")}
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      {tx("Set New Password")}
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Bottom Links */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-xs text-slate-600">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoading}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                {tx("Sign out and use a different account")}
              </button>

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
