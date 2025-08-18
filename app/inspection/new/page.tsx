import { Metadata } from "next"
import { InspectionBuilder } from "@/components/inspection/inspection-builder"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title: "New Inspection | Rwanda Water Board",
  description: "Create a comprehensive water permit inspection report",
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
      <InspectionBuilder />
    </div>
  )
} 