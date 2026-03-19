"use client";

import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { BackButton } from "@/components/ui/back-button";
import { WaterUseReportDetailTabs } from "@/components/water-use-reports/water-use-report-detail-tabs";

function WaterUseReportViewContent() {
  const params = useParams();
  const reportId = params.id as string;

  return (
    <DashboardLayout>
      <div className="flex justify-end p-6">
        <UserProfileButton />
      </div>
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
        <BackButton />
        <WaterUseReportDetailTabs reportId={reportId} />
      </div>
    </DashboardLayout>
  );
}

export default function WaterUseReportViewPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        "admin",
        "assessor",
        "reviewer",
        "verifier",
        "inspector",
        "approver",
        "applicant",
      ]}
    >
      <WaterUseReportViewContent />
    </ProtectedRoute>
  );
}
