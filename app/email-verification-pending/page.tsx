"use client";

import { Suspense } from "react";
import { EmailVerificationPendingHandler } from "./components/EmailVerificationPendingHandler";

export default function EmailVerificationPendingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }>
        <EmailVerificationPendingHandler />
      </Suspense>
    </div>
  );
}
