"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLogin = async (email: string, password: string) => {
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Attempting login for:", email);
      
      const result = await signIn(email, password);
      
      if (result.error) {
        console.error("❌ Login failed:", result.error);
        setError(result.error);
        return;
      }
      
      console.log("✅ Login successful, redirecting to dashboard");
      // Redirect to dashboard after successful login
      router.push("/dashboard");
    } catch (error) {
      console.error("❌ Login error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-12">
      <div className="w-full max-w-md">
        <LoginForm 
          onSubmit={handleLogin} 
          error={error}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
} 