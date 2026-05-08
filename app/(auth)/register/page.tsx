"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SignUpForm, SignUpFormData } from "@/components/auth/sign-up-form";
import { PhoneVerification } from "@/components/auth/phone-verification";
import { EmailVerificationStep } from "@/components/auth/email-verification-step";
import { SuccessConfirmation } from "@/components/auth/success-confirmation";
import { useAuth } from "@/contexts/AuthContext";

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

      // ── Step 1: Send SMS BEFORE creating the account ──
      // If SMS delivery fails the user can fix the number and retry
      // without leaving an orphaned account in the database.
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

      // ── Step 2: SMS succeeded — now create the account ──
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
        console.error("❌ Registration failed:", result.error);
        setError(result.error);
        return;
      }

      console.log("✅ Registration successful");

      setUserData({
        email: formData.email,
        accountType: formData.accountType,
        details: formData,
        phoneNumber,
        userId: result.userId
      });

      setStep(smsSkipped ? "email" : "phone");

    } catch (err) {
      console.error("❌ Registration error:", err);
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

  return (
    <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-12">
      <div className="w-full max-w-md">
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
              error={error}
              onClearError={() => setError("")}
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
            onComplete={handleSuccessComplete}
            showApplyButton={false}
            redirectUrl="/dashboard"
            redirectLabel="Continue"
          />
        )}
      </div>
    </div>
  );
} 