"use client";

import { Suspense } from "react";
import { EmailVerificationHandler } from "./components/EmailVerificationHandler";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }>
        <EmailVerificationHandler />
      </Suspense>
    </div>
  );
}
