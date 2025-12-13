"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SignUpForm, SignUpFormData } from "@/components/auth/sign-up-form";
import { PhoneVerification } from "@/components/auth/phone-verification";
import { SuccessConfirmation } from "@/components/auth/success-confirmation";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<"signup" | "verify" | "success">("signup");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState<{
    email: string;
    accountType: string;
    details: any;
    phoneNumber?: string;
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
  
  const handleContinue = async (formData: SignUpFormData) => {
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Starting registration for:", formData.email);
      
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
        console.error("❌ Registration failed:", result.error);
        setError(result.error);
        return;
      }
      
      const phoneNumber = normalizeRwandaPhone(
        formData.accountType === 'company' ? formData.companyPhone : formData.phone
      );

      // Store the user data for later use
      setUserData({
        email: formData.email,
        accountType: formData.accountType,
        details: formData,
        phoneNumber
      });
      
      console.log("✅ Registration successful");

      // ✅ Phone verification: send code then show verify step
      if (!phoneNumber) {
        setError("Phone number is required for verification.");
        return;
      }

      // #region agent log
      fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/(auth)/register/page.tsx:handleContinue',message:'sending phone verification code',data:{hasPhone:true},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'PHONE-VERIFY'})}).catch(()=>{});
      // #endregion

      const sendRes = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      const sendJson = await sendRes.json().catch(() => null);
      if (!sendRes.ok || !sendJson?.success) {
        setError(sendJson?.error || sendJson?.message || 'Failed to send phone verification code');
        return;
      }

      setStep("verify");
      
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
        body: JSON.stringify({ phoneNumber, code })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || json?.error || 'Invalid verification code');
        return;
      }
      setStep("success");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleResendPhoneCode = async () => {
    const phoneNumber = userData.phoneNumber || "";
    if (!phoneNumber) return;
    await fetch('/api/auth/verify-phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    }).catch(() => {});
  };

  const handleSuccessComplete = () => {
    // Redirect to login page after successful registration
    router.push("/login");
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
            />
          </motion.div>
        )}
        
        {step === "verify" && (
        <PhoneVerification
          phoneNumber={userData.phoneNumber || ""}
          onSubmit={handleVerifyPhoneCode}
          onResendCode={handleResendPhoneCode}
          isLoading={isLoading}
          error={error}
          onClearError={() => setError("")}
        />
        )}
        
        {step === "success" && (
          <SuccessConfirmation 
            email={userData.email} 
            onComplete={handleSuccessComplete}
            showApplyButton={false}
            redirectUrl="/dashboard"
            redirectLabel="Go to Dashboard"
          />
        )}
      </div>
    </div>
  );
} 