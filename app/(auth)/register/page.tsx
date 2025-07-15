"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { PinVerification } from "@/components/auth/pin-verification";
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
  }>({
    email: "",
    accountType: "",
    details: {}
  });
  
  const handleSignUp = async (email: string, password: string, accountType: string, details: any) => {
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Starting registration for:", email);
      
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
        console.error("❌ Registration failed:", result.error);
        setError(result.error);
        return;
      }
      
      // Store the user data for later use
      setUserData({
        email,
        accountType,
        details
      });
      
      console.log("✅ Registration successful");
      
      // For now, skip PIN verification and go straight to success
      // In a real implementation, you would handle email verification here
      setStep("success");
      
    } catch (err) {
      console.error("❌ Registration error:", err);
      setError("An unexpected error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleVerifyPin = (pin: string) => {
    // In a real implementation, this would verify the PIN with an API
    console.log("Verifying PIN:", pin);
    
    // Move to success step
    setTimeout(() => {
      setStep("success");
    }, 1000);
  };
  
  const handleResendPin = () => {
    // Mock function to resend PIN
    console.log("Resending PIN to", userData.email);
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
            showApplyButton={false}
            redirectUrl="/dashboard"
            redirectLabel="Go to Dashboard"
          />
        )}
      </div>
    </div>
  );
} 