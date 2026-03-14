"use client";

import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { BackButton } from "@/components/ui/back-button";
import { InspectionDetailTabs } from "@/components/inspection/inspection-detail-tabs";

export default function ReviewInspectionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <ProtectedRoute allowedRoles={["reviewer", "admin"]} requireProfile={true}>
      <DashboardLayout>
        <div className="flex justify-end p-6">
          <UserProfileButton />
        </div>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
          <BackButton />
          <InspectionDetailTabs inspectionId={id} />
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
