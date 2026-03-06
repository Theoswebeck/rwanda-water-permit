"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { StatsPanel } from "./stats-panel"
import { ApplicationsTab } from "./applications-tab"
import { AssessmentTab } from "./assessment-tab"
import { InspectionsTab } from "./inspections-tab"
import { AllApplicationsTab } from "./all-applications-tab"
import { WaterConcessionMap } from "@/components/shared/water-concession-map"
import { 
  ClipboardList, 
  FileCheck,
  Loader2,
  MapPin
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getInspectionStats, getApplicationsForInspection, getCurrentUser } from "@/lib/supabase"

export function InspectionDashboard() {
  const [activeTab, setActiveTab] = useState("assessments")
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">Water Resource Inspection</h1>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
            Field inspection management and compliance monitoring
          </p>
        </div>
      </div>

      {/* Stats Panel */}
      <StatsPanel />

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Inspection Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="assessments" className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Technical Assessment
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin ml-2" />
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    {stats.pendingAssessmentCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="inspections" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Post-Permit Inspections
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin ml-2" />
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    {stats.allApplicationsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="applications" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                All Applications
              </TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Consolidated Map
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assessments" className="mt-6">
              <AssessmentTab />
            </TabsContent>
            <TabsContent value="inspections" className="mt-6">
              <InspectionsTab />
            </TabsContent>
            <TabsContent value="applications" className="mt-6">
              <AllApplicationsTab />
            </TabsContent>
            <TabsContent value="map" className="mt-6">
              <WaterConcessionMap />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 