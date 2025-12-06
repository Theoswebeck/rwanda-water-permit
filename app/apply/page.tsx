"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PinVerification } from "@/components/auth/pin-verification";
import { SuccessConfirmation } from "@/components/auth/success-confirmation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { useAuth } from "@/contexts/AuthContext";

export default function ApplyPage() {
  const router = useRouter();
  const { signUp, isAuthenticated, isApplicant, loading } = useAuth();
  const [step, setStep] = useState<"signup" | "verify" | "success">("signup");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [userData, setUserData] = useState<{
    email: string;
    accountType: string;
    details: Record<string, unknown>;
  }>({
    email: "",
    accountType: "",
    details: {}
  });

  // Redirect authenticated applicants to dashboard
  useEffect(() => {
    if (!loading && isAuthenticated && isApplicant) {
      router.push('/dashboard');
    }
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

  const handleSignUp = async (email: string, password: string, accountType: string, details: any) => {
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Starting application registration for:", email);
      
      // Prepare signup data based on account type
      const signUpData = {
        email,
        password,
        accountType: accountType as 'individual' | 'company',
        ...(accountType === 'individual' ? {
          firstName: details.firstName,
          lastName: details.lastName,
          phone: details.phone,
          idNumber: details.identification?.number,
          idType: details.identification?.type,
        } : {
          companyName: details.companyName,
          companyTIN: details.companyTIN,
          companyAddress: details.companyAddress,
          companyPhone: details.companyPhone,
        })
      };

      const result = await signUp(signUpData);
      
      if (result.error) {
        console.error("❌ Application registration failed:", result.error);
        setError(result.error);
        return;
      }
      
      // Store the user data for later use
      setUserData({
        email,
        accountType,
        details
      });
      
      console.log("✅ Application registration successful");
      
      // For now, skip PIN verification and go straight to success
      // In a real implementation, you would handle email verification here
      setStep("success");
      
    } catch (err) {
      console.error("❌ Application registration error:", err);
      setError("An unexpected error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleVerifyPin = (pin: string) => {
    // In a real implementation, this would verify the PIN with an API
    setTimeout(() => {
      setStep("success");
    }, 1000);
  };
  
  const handleResendPin = () => {
    // Mock function to resend PIN
    console.log("Resending PIN to", userData.email);
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
            onSubmit={handleSignUp} 
            error={error}
            isLoading={isLoading}
          />
        </motion.div>
      )}
      
      {step === "verify" && (
        <PinVerification 
          email={userData.email} 
          onSubmit={handleVerifyPin}
          onResendPin={handleResendPin}
        />
      )}
      
      {step === "success" && (
        <SuccessConfirmation 
          email={userData.email} 
          onComplete={handleSuccessComplete}
          title="Welcome to Water Permit Portal!"
          message="Your account has been successfully created. You can now apply for water permits and track your applications."
          redirectLabel="Start Dashboard"
        />
      )}
    </AuthLayout>
  );
} 