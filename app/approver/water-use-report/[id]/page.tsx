"use client";

import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
import { WaterUseReportDetailTabs } from "@/components/water-use-reports/water-use-report-detail-tabs";

export default function ApproverWaterUseReportPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <ProtectedRoute allowedRoles={["approver", "admin"]} requireProfile={true}>
      <DashboardLayout>
        <div className="flex justify-end p-6">
          <UserProfileButton />
        </div>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
          <SmartBackButton fallbackHref={staffListHref("approver", "water-reports")} label="Go Back" variant="outline" />
          <WaterUseReportDetailTabs reportId={id} roleContext="approver" />
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
