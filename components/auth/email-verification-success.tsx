"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface EmailVerificationSuccessProps {
  email?: string;
  onContinue?: () => void;
  redirectTo?: string;
}

export function EmailVerificationSuccess({
  email,
  onContinue,
  redirectTo = "/login"
}: EmailVerificationSuccessProps) {
  const router = useRouter();

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    } else {
      router.push(redirectTo);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md mx-auto"
    >
      <Card>
        <CardHeader className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center"
          >
            <CheckCircle className="h-8 w-8 text-green-600" />
          </motion.div>
          
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold text-green-600">
              Email Verified!
            </CardTitle>
            <CardDescription className="text-base">
              Your email address has been successfully verified.
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {email && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm font-medium text-green-700">
                  Verified Email:
                </p>
              </div>
              <p className="text-sm text-green-600 mt-1">{email}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
              <p>Your account is now active and ready to use</p>
            </div>
            
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
              <p>You can now log in and access all features</p>
            </div>
            
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
              <p>Start by submitting your first water permit application</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Button 
              onClick={handleContinue}
              className="w-full"
              size="lg"
            >
              Continue to Login
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Welcome to Rwanda Water Board Water Permit System
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
