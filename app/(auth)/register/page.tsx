"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SignUpForm, SignUpFormData } from "@/components/auth/sign-up-form";
import { PhoneVerification } from "@/components/auth/phone-verification";
import { EmailVerificationStep } from "@/components/auth/email-verification-step";
import { SuccessConfirmation } from "@/components/auth/success-confirmation";
import { useAuth } from "@/contexts/AuthContext";
import { rwbConfig } from "@/config/rwb.config";

export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<"signup" | "phone" | "email" | "success">("signup");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState<{
    email: string;
    accountType: string;
    details: SignUpFormData | Record<string, unknown>;
    phoneNumber?: string;
    userId?: string;
  }>({
    email: "",
    accountType: "",
    details: {}
  });

  const normalizeRwandaPhone = (raw?: string) => {
    const v = (raw || "").trim();
    if (!v) return "";
    if (v.startsWith("+")) return v;
    const digits = v.replace(/\D/g, "");
    if (digits.length === 10 && digits.startsWith("07")) return `+25${digits}`;
    if (digits.length === 12 && digits.startsWith("250")) return `+${digits}`;
    return v;
  };

  const readStringProp = (obj: Record<string, unknown>, key: string): string | undefined => {
    const v = obj[key];
    return typeof v === "string" ? v : undefined;
  };
  
  const handleContinue = async (formData: SignUpFormData) => {
    setError("");
    setIsLoading(true);
    
    try {
      const formDataRecord = formData as unknown as Record<string, unknown>;
      const rawCompanyPhone =
        formData.companyPhone ||
        readStringProp(formDataRecord, "companyPhoneNumber") ||
        readStringProp(formDataRecord, "company_phone") ||
        readStringProp(formDataRecord, "company_phone_number");

      const phoneNumber = normalizeRwandaPhone(
        formData.accountType !== 'individual' ? rawCompanyPhone : formData.phone
      );

      if (!phoneNumber) {
        setError("Phone number is required for verification.");
        return;
      }

      const sendRes = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      const sendJson = await sendRes.json().catch(() => null);

      if (!sendRes.ok || !sendJson?.success) {
        const detail = sendJson?.error || sendJson?.message || '';
        const isPhoneFormat = detail.toLowerCase().includes('invalid phone');
        setError(
          isPhoneFormat
            ? `The phone number ${phoneNumber} is not valid. Please enter a Rwandan mobile number in the format 07XXXXXXXX.`
            : `We could not send a verification code to ${phoneNumber}. Please check the number and try again. (${detail})`
        );
        return;
      }

      const smsSkipped = sendJson?.skipped === true;

      const signUpData: Parameters<typeof signUp>[0] = {
        email: formData.email,
        password: formData.password,
        accountType: formData.accountType,
        ...(formData.accountType === 'individual' ? {
          firstName: formData.firstName,
          lastName: formData.lastName,
          dateOfBirth: formData.dateOfBirth,
          idNumber: formData.idNumber,
          idType: formData.idType,
          phone: phoneNumber,
          province: formData.province,
          district: formData.district,
          sector: formData.sector,
          cell: formData.cell,
          village: formData.village,
          address: formData.address,
        } : {
          companyName: formData.companyName,
          companyTIN: formData.companyTIN,
          companyAddress: formData.companyAddress,
          companyPhone: phoneNumber,
        })
      };

      const result = await signUp(signUpData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setUserData({
        email: formData.email,
        accountType: formData.accountType,
        details: formData,
        phoneNumber,
        userId: result.userId
      });

      // Always go directly to email verification — phone OTP is skipped intentionally
      // (Pindo SMS sender name "RWB" pending approval; email is the primary verification channel)
      setStep("email");

    } catch (err) {
      console.error("Registration error:", err);
      setError("An unexpected error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleVerifyPhoneCode = async (code: string) => {
    try {
      setIsLoading(true);
      const phoneNumber = userData.phoneNumber || "";
      const res = await fetch('/api/auth/verify-phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, code, userId: userData.userId, accountType: userData.accountType })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || json?.error || 'Invalid verification code');
        return;
      }
      setError("");
      setStep("email");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleResendPhoneCode = async () => {
    const phoneNumber = userData.phoneNumber || "";
    if (!phoneNumber) return;
    const res = await fetch('/api/auth/verify-phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, userId: userData.userId })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      setError(json?.message || json?.error || 'Failed to resend phone verification code');
      throw new Error(json?.message || json?.error || 'Failed to resend phone verification code');
    }
  };

  const handleEditPhone = async (newPhoneRaw: string) => {
    const phoneNumber = normalizeRwandaPhone(newPhoneRaw);
    setError("");
    setIsLoading(true);
    try {
      setUserData((prev) => ({ ...prev, phoneNumber }));
      const sendRes = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, userId: userData.userId })
      });
      const sendJson = await sendRes.json().catch(() => null);
      if (!sendRes.ok || !sendJson?.success) {
        setError(sendJson?.error || sendJson?.message || 'Failed to send phone verification code');
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessComplete = () => {
    router.push("/dashboard");
  };

  // ── Multi-step verification screens (phone, email, success) ──
  // These are shown without the split-card shell to keep the UX focused.
  if (step === "phone") {
    return (
      <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-md">
          <PhoneVerification
            phoneNumber={userData.phoneNumber || ""}
            onSubmit={handleVerifyPhoneCode}
            onResendCode={handleResendPhoneCode}
            onEditPhone={handleEditPhone}
            isLoading={isLoading}
            error={error}
            onClearError={() => setError("")}
          />
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-md">
          <EmailVerificationStep
            email={userData.email}
            isLoading={isLoading}
            onBack={() => setStep("signup")}
            onContinue={() => {
              setError("");
              router.push("/dashboard");
            }}
          />
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-md">
          <SuccessConfirmation
            email={userData.email}
            onComplete={handleSuccessComplete}
            showApplyButton={false}
            redirectUrl="/dashboard"
            redirectLabel="Continue"
          />
        </div>
      </div>
    );
  }

  // ── Step 1: Main registration form — Split-Card shell ──
  return (
    <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[960px] animate-in fade-in duration-500">
        {/* Split Card */}
        <div className="bg-white rounded-[20px] shadow-[0_15px_50px_-12px_rgba(0,0,0,0.2)] flex flex-col md:flex-row overflow-hidden min-h-[640px]">

          {/* ── Left Panel: Institutional Branding ── */}
          <div className="md:w-5/12 bg-gradient-to-br from-[#0072bc] to-[#005a96] p-8 sm:p-10 flex flex-col justify-between text-white relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-white/10 rounded-full pointer-events-none" />
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full pointer-events-none" />

            {/* Logo */}
            <div className="relative z-10">
              <Link
                href="/"
                title="Return to Portal Home"
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

            {/* Welcome Text */}
            <div className="relative z-10 my-4">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-wide mb-2">
                CREATE ACCOUNT
              </h2>
              <h3 className="text-base font-semibold text-white/95 mb-4 leading-snug">
                {rwbConfig.name}
              </h3>
              <p className="text-xs text-white/85 leading-relaxed mb-6">
                Register for secure access to the Rwanda Water Permit System. 
                Apply for water concessions, track your permits, and manage compliance obligations.
              </p>

              <div className="space-y-2.5 text-xs text-white/90">
                <div className="flex items-center gap-2">
                  <i className="fa fa-check-circle text-emerald-300 text-sm" />
                  <span>Online Permit Applications</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="fa fa-check-circle text-emerald-300 text-sm" />
                  <span>GIS Concession Boundary Mapping</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="fa fa-check-circle text-emerald-300 text-sm" />
                  <span>Real-Time Application Tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="fa fa-check-circle text-emerald-300 text-sm" />
                  <span>Secure Integrated Payments</span>
                </div>
              </div>
            </div>

            {/* Bottom */}
            <div className="relative z-10 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-white/80">
              <span>{rwbConfig.institution.country}</span>
              <span className="flex items-center gap-1.5 font-medium">
                <i className="fa fa-lock text-xs" /> 256-bit SSL Encrypted
              </span>
            </div>
          </div>

          {/* ── Right Panel: The existing SignUpForm (all business logic preserved) ── */}
          <div className="md:w-7/12 bg-white p-8 sm:p-10 flex flex-col justify-center overflow-y-auto">
            <div className="mb-5">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#212529] tracking-tight">
                Create Account
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Fill in your official credentials to apply for system access
              </p>
            </div>

            <SignUpForm
              onContinue={handleContinue}
              isLoading={isLoading}
              error={error}
              onClearError={() => setError("")}
            />

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-xs text-slate-600">
              <p>
                Already have an account?{" "}
                <Link href="/login" className="text-[#0072bc] font-bold hover:underline">
                  Sign in
                </Link>
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0072bc] font-semibold transition-colors mt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Home Portal</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
