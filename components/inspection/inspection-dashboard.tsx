"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { StatsPanel } from "./stats-panel"
import { ApplicationsTab } from "./applications-tab"
import { InspectionsTab } from "./inspections-tab"
import { 
  ClipboardList, 
  FileCheck,
  Loader2
} from "lucide-react"
import { getInspectionStats, getApplicationsPendingInspection, getApplicationsForInspection, getCurrentUser } from "@/lib/supabase"

export function InspectionDashboard() {
  const [activeTab, setActiveTab] = useState("applications")
  const [stats, setStats] = useState({
    applicationsCount: 0,
    allApplicationsCount: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setLoading(true)
        
        let applicationsCount = 0
        let allApplicationsCount = 0
        
        try {
          // Get applications pending inspection count
          const applicationsData = await getApplicationsPendingInspection()
          applicationsCount = applicationsData?.length || 0
        } catch (appError) {
          console.warn('Failed to fetch applications, using fallback count:', appError)
          applicationsCount = 0
        }
        
        try {
          // Get all applications count for inspector view
          const applicationsData = await getApplicationsForInspection()
          allApplicationsCount = applicationsData?.length || 0
        } catch (inspError) {
          console.warn('Failed to fetch applications, using fallback count:', inspError)
          allApplicationsCount = 0
        }
        
        setStats({
          applicationsCount,
          allApplicationsCount
        })
        
        console.log('📊 Dashboard counts loaded:', {
          applicationsCount,
          allApplicationsCount
        })
      } catch (error) {
        console.error('Error in fetchCounts:', error)
        // Set to 0 on error
        setStats({
          applicationsCount: 0,
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
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="applications" className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Applications to Inspect
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin ml-2" />
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    {stats.applicationsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="inspections" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                All Applications
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin ml-2" />
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    {stats.allApplicationsCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="applications" className="mt-6">
              <ApplicationsTab />
            </TabsContent>
            <TabsContent value="inspections" className="mt-6">
              <InspectionsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 