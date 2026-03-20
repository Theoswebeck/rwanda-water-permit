"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { ProtectedRoute, ApplicantOnly } from "@/components/auth/protected-route";
import { ProfileManagement } from "@/components/profile/profile-management";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);
  useEffect(() => { setLanguage(getPreferredLanguage()); return subscribeToLanguageChanges(setLanguage); }, []);

  const handleBack = () => {
    router.back();
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {tx("Back")}
            </Button>
          </div>

          <h1 className="text-3xl font-bold tracking-tight">{tx("Profile Management")}</h1>
          <p className="text-gray-600 mt-2">
            {tx("Manage your account information and security settings")}
          </p>
        </div>

        <ProfileManagement />
      </div>
    </ProtectedRoute>
  );
}