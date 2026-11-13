"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { ApplicationsDataTable } from "@/components/inspection/applications-data-table"
import { TypographyH2, TypographyP } from "@/components/ui/typography"
import { BackToDashboardButton } from "@/components/ui/back-button"

export default function InspectionApplicationsPage() {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 space-y-6">
        <BackToDashboardButton size="sm" className="gap-2" />
        <div className="space-y-2">
          <TypographyH2>Applications Pending Inspection</TypographyH2>
          <TypographyP>
            Review and manage water permit applications that require inspection.
          </TypographyP>
        </div>
        <ApplicationsDataTable />
      </div>
    </DashboardLayout>
  )
} 