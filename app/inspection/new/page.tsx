import { Suspense } from "react"
import { Metadata } from "next"
import { InspectionBuilder } from "@/components/inspection/inspection-builder"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title: "New Inspection | Rwanda Water Resources Board",
  description: "Create a comprehensive water permit inspection report",
}

function InspectionLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="ml-3">Loading inspection form...</span>
    </div>
  )
}

export default function NewInspectionPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-4">
        <Link href="/inspection">
          <Button variant="ghost" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
      <Suspense fallback={<InspectionLoading />}>
        <InspectionBuilder />
      </Suspense>
    </div>
  )
} 