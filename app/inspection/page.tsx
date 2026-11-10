import { Metadata } from "next";
import { InspectionDashboard } from "@/components/inspection/inspection-dashboard";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

export const metadata: Metadata = {
  title: "Inspection Dashboard | Rwanda Water Resources Board",
  description: "Manage water permit applications and track inspection progress",
};

export default function InspectionPage() {
  return (
    <DashboardLayout wide>
      <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
        <InspectionDashboard />
      </div>
    </DashboardLayout>
  );
} 