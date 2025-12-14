"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PhoneVerification } from "@/components/auth/phone-verification";
import { EmailVerificationStep } from "@/components/auth/email-verification-step";
import { SuccessConfirmation } from "@/components/auth/success-confirmation";
import { SignUpForm, SignUpFormData } from "@/components/auth/sign-up-form";
import { useAuth } from "@/contexts/AuthContext";

export default function ApplyPage() {
  const router = useRouter();
  const { signUp, isAuthenticated, isApplicant, loading } = useAuth();
  const [step, setStep] = useState<"signup" | "phone" | "email" | "success">("signup");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const authRedirectCheckedRef = useRef(false);
  const [userData, setUserData] = useState<{
    email: string;
    accountType: string;
    details: Record<string, unknown>;
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
    // 07xxxxxxxx -> +2507xxxxxxxx
    if (digits.length === 10 && digits.startsWith("07")) return `+25${digits}`;
    // 2507xxxxxxxx -> +2507xxxxxxxx
    if (digits.length === 12 && digits.startsWith("250")) return `+${digits}`;
    return v;
  };

  // Redirect authenticated applicants to dashboard ONLY if they were already authenticated
  // when this page loaded. (Avoid redirecting mid-signup flow.)
  useEffect(() => {
    if (authRedirectCheckedRef.current) return;
    if (loading) return;
    authRedirectCheckedRef.current = true;
    if (isAuthenticated && isApplicant) router.push("/dashboard");
  }, [loading, isAuthenticated, isApplicant, router]);

  // Show loading or redirect early to prevent flash
  if (loading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      </AuthLayout>
    );
  }

  // If authenticated applicant, show loading while redirecting
  if (isAuthenticated && isApplicant) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const handleContinue = async (formData: SignUpFormData) => {
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Starting application registration for:", formData.email);
      
      // Prepare signup data based on account type
      const signUpData = {
        email: formData.email,
        password: formData.password,
        accountType: formData.accountType,
        ...(formData.accountType === 'individual' ? {
          firstName: formData.firstName,
          lastName: formData.lastName,
          idNumber: formData.idNumber,
          idType: formData.idType,
        } : {
          companyName: formData.companyName,
          companyTIN: formData.companyTIN,
          companyAddress: formData.companyAddress,
        })
      };

      const result = await signUp(signUpData);
      
      if (result.error) {
        console.error("❌ Application registration failed:", result.error);
        setError(result.error);
        return;
      }
      
      // Store the user data for later use
      const phoneNumber = normalizeRwandaPhone(
        formData.accountType === 'company' ? formData.companyPhone : formData.phone
      );

      setUserData({
        email: formData.email,
        accountType: formData.accountType,
        details: formData,
        phoneNumber,
        userId: result.userId
      });
      
      console.log("✅ Application registration successful");

      // ✅ Phone verification: send code then show verify step
      if (!phoneNumber) {
        setError("Phone number is required for verification.");
        return;
      }

      // #region agent log
      // Disabled: writing debug logs during dev can create rebuild loops.
      // #endregion

      const sendRes = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, userId: result.userId })
      });
      const sendJson = await sendRes.json().catch(() => null);
      if (!sendRes.ok || !sendJson?.success) {
        setError(sendJson?.error || sendJson?.message || 'Failed to send phone verification code');
        return;
      }

      setStep("phone");
      
    } catch (err) {
      console.error("❌ Application registration error:", err);
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
      // Next: email verification
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

  const handleEmailVerified = async (_emailCode: string) => {
    // EmailVerificationStep already verifies the code via API.
    router.push("/dashboard");
  };

  const handleSuccessComplete = () => {
    // Redirect to dashboard after successful registration
    router.push("/dashboard");
  };

  return (
    <AuthLayout>
      {step === "signup" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <SignUpForm 
            onContinue={handleContinue}
            isLoading={isLoading}
          />
        </motion.div>
      )}
      
      {step === "phone" && (
        <PhoneVerification
          phoneNumber={userData.phoneNumber || ""}
          onSubmit={handleVerifyPhoneCode}
          onResendCode={handleResendPhoneCode}
          onEditPhone={handleEditPhone}
          isLoading={isLoading}
          error={error}
          onClearError={() => setError("")}
        />
      )}

      {step === "email" && (
        <EmailVerificationStep
          email={userData.email}
          isLoading={isLoading}
          onBack={() => setStep("phone")}
          onContinue={() => {
            setError("");
            router.push("/dashboard");
          }}
        />
      )}
      
      {step === "success" && (
        <SuccessConfirmation 
          email={userData.email} 
          title="Welcome to Water Permit Portal!"
          message="Your account has been successfully created. You can now apply for water permits and track your applications."
          showPrimaryButton={true}
          redirectUrl="/dashboard"
          redirectLabel="Continue"
          showApplyButton={false}
        />
      )}
    </AuthLayout>
  );
} 