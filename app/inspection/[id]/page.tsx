import { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InspectionDetailTabs } from "@/components/inspection/inspection-detail-tabs"

export const metadata: Metadata = {
  title: "Inspection Details | Rwanda Water Resources Board",
  description: "View water permit inspection details",
}

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">Inspection Details</h1>
        <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
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
  )
} 