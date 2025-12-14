"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type VerificationState = 'disabled';

export function EmailVerificationHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state] = useState<VerificationState>('disabled');
  const [details, setDetails] = useState<string>('');

  useEffect(() => {
    // This app uses OTP-by-email via Resend, not Supabase auth email links.
    const code = searchParams.get('error_code') || searchParams.get('type') || '';
    if (code) setDetails(code);
  }, [searchParams]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-red-100">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        
        <div className="space-y-2">
          <CardTitle className="text-2xl font-bold text-red-600">
            Email link verification disabled
          </CardTitle>
          <CardDescription>
            This app verifies email using a 6-digit code (sent via Resend), not email links.
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            Please go back to signup/login and request a new email verification code.
            {!!details && <span className="block mt-2 text-xs text-red-600">Details: {details}</span>}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <Button
            onClick={() => router.push('/register')}
            className="w-full"
          >
            Go to Sign Up
          </Button>

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => router.push('/login')}
              className="text-sm"
            >
              Back to Login
            </Button>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <a href="/contact" className="text-primary hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
