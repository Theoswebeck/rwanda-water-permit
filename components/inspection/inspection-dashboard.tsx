"use client"

import { useState, useEffect } from "react"
import { useTabParam } from "@/hooks/use-tab-param"
import { TabsContent } from "@/components/ui/tabs"
import { StaffSidebar } from "@/components/shared/staff-sidebar"
import { Badge } from "@/components/ui/badge"
import { StatsPanel } from "./stats-panel"
import { ApplicationsTab } from "./applications-tab"
import { AssessmentTab } from "./assessment-tab"
import { InspectionsTab } from "./inspections-tab"
import { AllApplicationsTab } from "./all-applications-tab"
import { InspectionList } from "@/components/inspection/inspection-list"
import { StaffInquiriesWorkbench } from "@/components/inquiries/staff-inquiries-workbench"
import { WaterConcessionMap } from "@/components/shared/water-concession-map"
import { 
  ClipboardList, 
  FileCheck,
  Files,
  Loader2,
  MapPin,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getInspectionStats, getApplicationsForInspection, getCurrentUser } from "@/lib/supabase"

export function InspectionDashboard() {
  const [activeTab, setActiveTab] = useTabParam("inspections", ["inspections", "assessments", "applications", "map", "inquiries", "inspection-registry"])
  const [stats, setStats] = useState({
    pendingAssessmentCount: 0,
    allApplicationsCount: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setLoading(true)
        
        let pendingAssessmentCount = 0
        let allApplicationsCount = 0
        
        try {
          // Get applications pending assessment count
          const { data: applicationsData, error } = await supabase
            .from('applications')
            .select('id')
            .eq('status', 'pending_assessment')
          
          if (error) throw error
          pendingAssessmentCount = applicationsData?.length || 0
        } catch (appError) {
          console.warn('Failed to fetch pending assessment applications:', appError)
          pendingAssessmentCount = 0
        }
        
        try {
          // Get all applications count for inspector view
          const { data: allAppsData, error: allAppsError } = await supabase
            .from('applications')
            .select('id')
          
          if (allAppsError) throw allAppsError
          allApplicationsCount = allAppsData?.length || 0
        } catch (inspError) {
          console.warn('Failed to fetch all applications:', inspError)
          allApplicationsCount = 0
        }
        
        setStats({
          pendingAssessmentCount,
          allApplicationsCount
        })
        
        console.log('📊 Dashboard counts loaded:', {
          pendingAssessmentCount,
          allApplicationsCount
        })
      } catch (error) {
        console.error('Error in fetchCounts:', error)
        // Set to 0 on error
        setStats({
          pendingAssessmentCount: 0,
          allApplicationsCount: 0
        })
      } finally {
        setLoading(false)
      }
    }

    fetchCounts()
  }, [])

  const countBadge = (n: number) =>
    loading ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : (
      <Badge variant="secondary" className="px-1.5 tabular-nums">{n}</Badge>
    )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">Water Resource Inspection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Field inspection management and compliance monitoring
          </p>
        </div>
      </div>

      {/* Stats Panel */}
      <StatsPanel />

      {/* Main Content */}
      <StaffSidebar
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        items={[
          { value: "assessments", label: "Technical Assessment", icon: ClipboardList, badge: countBadge(stats.pendingAssessmentCount) },
          { value: "inspections", label: "Post-Permit Inspections", icon: FileCheck, badge: countBadge(stats.allApplicationsCount) },
          { value: "applications", label: "All Applications", icon: Files },
          { value: "map", label: "Consolidated Map", icon: MapPin },
          { value: "inquiries", label: "Inquiries", icon: MessageSquare },
          { value: "inspection-registry", label: "Inspection Registry", icon: ClipboardCheck },
        ]}
      >
        <TabsContent value="assessments" className="mt-0">
          <AssessmentTab />
        </TabsContent>
        <TabsContent value="inspections" className="mt-0">
          <InspectionsTab />
        </TabsContent>
        <TabsContent value="applications" className="mt-0">
          <AllApplicationsTab />
        </TabsContent>
        <TabsContent value="map" className="mt-0">
          <WaterConcessionMap />
        </TabsContent>
        <TabsContent value="inquiries" className="mt-0">
          <StaffInquiriesWorkbench />
        </TabsContent>
        <TabsContent value="inspection-registry" className="mt-0">
          <InspectionList />
        </TabsContent>
      </StaffSidebar>
    </div>
  )
} 