import { Metadata } from "next"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InspectionDetailTabs } from "@/components/inspection/inspection-detail-tabs"
import { BackButton } from "@/components/ui/back-button"

export const metadata: Metadata = {
  title: "Inspection Details | Rwanda Water Resources Board",
  description: "View water permit inspection details",
}

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 space-y-8">
        <BackButton />
        
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">Inspection Details</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View detailed information about this inspection
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inspection Report</CardTitle>
            <CardDescription>
              Inspection findings and recommendations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InspectionDetailTabs inspectionId={id} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
} 