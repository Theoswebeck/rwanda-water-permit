import { Metadata } from "next"
import { InspectionDashboard } from "@/components/inspection/inspection-dashboard"
// import { ProtectedRoute } from "@/components/auth/protected-route" // TEMPORARY: Disabled for testing

export const metadata: Metadata = {
  title: "Inspection Dashboard | Rwanda Water Resources Board",
  description: "Manage water permit applications and track inspection progress",
}

export default function InspectionPage() {
  return (
    // <ProtectedRoute allowedRoles={['inspector']} requireProfile={true}>
      <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
        <InspectionDashboard />
      </div>
    // </ProtectedRoute>
  )
} 