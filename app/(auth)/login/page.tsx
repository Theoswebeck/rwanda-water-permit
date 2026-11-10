import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

function LoginLoading() {
  return (
    <div className="flex items-center justify-center min-h-[500px]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-[#4a9fd8] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[960px]">
        <Suspense fallback={<LoginLoading />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
