import { Metadata } from "next"
import { InspectionDashboard } from "@/components/inspection/inspection-dashboard"
import { ProtectedRoute } from "@/components/auth/protected-route"

export const metadata: Metadata = {
  title: "Inspection Dashboard | Rwanda Water Board",
  description: "Manage water permit applications and track inspection progress",
}

export default function InspectionPage() {
  return (
    <ProtectedRoute allowedRoles={['inspector']} requireProfile={true}>
      <div className="container mx-auto py-6">
        <InspectionDashboard />
      </div>
    </ProtectedRoute>
  )
} 