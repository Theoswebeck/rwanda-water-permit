"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProfileManagement } from "@/components/profile/profile-management";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);
  useEffect(() => { setLanguage(getPreferredLanguage()); return subscribeToLanguageChanges(setLanguage); }, []);

  return (
    <DashboardLayout wide>
      <div className="w-full space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer -ml-2.5 h-8 px-2.5 rounded-lg"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{tx("Back")}</span>
              </Button>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{tx("Profile Management")}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {tx("Manage your account details, organization profile, security credentials, and role delegations")}
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200/80">
              <Loader2 className="h-6 w-6 animate-spin text-[#0072bc]" />
              <span className="ml-3 text-slate-600 font-medium">{tx("Loading profile...")}</span>
            </div>
          }
        >
          <ProfileManagement />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
