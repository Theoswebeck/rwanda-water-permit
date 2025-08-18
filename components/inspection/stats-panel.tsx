"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  ClipboardList, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp,
  Clock,
  FileCheck,
  Eye,
  RotateCcw,
  FileText,
  UserCheck
} from "lucide-react"
import { supabase } from "@/lib/supabase"

interface InspectionStatsData {
  totalApplications: number
  pendingInspection: number
  underInspection: number
  returnedForRevision: number
}

export function StatsPanel() {
  const [stats, setStats] = useState<InspectionStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInspectionStats = async () => {
      try {
        setLoading(true)
        
        // Query for total applications
        const { count: totalCount, error: totalError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
        
        if (totalError) throw totalError

        // Query for applications pending inspection
        const { count: pendingCount, error: pendingError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_inspection')
        
        if (pendingError) throw pendingError

        // Query for applications currently under inspection (in_progress)
        const { count: underInspectionCount, error: underInspectionError } = await supabase
          .from('inspections')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'in_progress')
        
        if (underInspectionError) throw underInspectionError

        // Query for applications returned for revision
        const { count: revisionCount, error: revisionError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'revision_required')
        
        if (revisionError) throw revisionError

        const statsData: InspectionStatsData = {
          totalApplications: totalCount || 0,
          pendingInspection: pendingCount || 0,
          underInspection: underInspectionCount || 0,
          returnedForRevision: revisionCount || 0
        }

        setStats(statsData)
      } catch (err) {
        console.error('Error fetching inspection stats:', err)
        setError('Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchInspectionStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Loading...
              </CardTitle>
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold animate-pulse bg-gray-200 rounded h-8 w-12 mb-2" />
              <p className="text-xs text-muted-foreground animate-pulse bg-gray-200 rounded h-4 w-20 mb-2" />
              <div className="animate-pulse bg-gray-200 rounded h-4 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statsCards = [
    {
      title: "Total Applications",
      value: stats?.totalApplications?.toString() || "0",
      description: "All applications in the system",
      icon: ClipboardList,
      trend: `${stats?.totalApplications || 0} total`,
      trendUp: null,
      color: "text-blue-600"
    },
    {
      title: "Pending Inspection",
      value: stats?.pendingInspection?.toString() || "0",
      description: "Awaiting inspection assignment",
      icon: Clock,
      trend: (stats?.pendingInspection || 0) > 0 ? `${stats?.pendingInspection} waiting` : "All caught up",
      trendUp: (stats?.pendingInspection || 0) === 0 ? true : null,
      color: "text-amber-600"
    },
    {
      title: "Under Inspection",
      value: stats?.underInspection?.toString() || "0",
      description: "Currently being inspected",
      icon: Eye,
      trend: (stats?.underInspection || 0) > 0 ? `${stats?.underInspection} in progress` : "No active inspections",
      trendUp: null,
      color: "text-green-600"
    },
    {
      title: "Returned for Revision",
      value: stats?.returnedForRevision?.toString() || "0",
      description: "Pending resubmission",
      icon: RotateCcw,
      trend: (stats?.returnedForRevision || 0) > 0 ? `${stats?.returnedForRevision} revisions needed` : "No revisions pending",
      trendUp: (stats?.returnedForRevision || 0) === 0 ? true : false,
      color: "text-red-600"
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statsCards.map((stat, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stat.description}
            </p>
            <div className="flex items-center mt-2">
              {stat.trendUp !== null && (
                <Badge 
                  variant={stat.trendUp ? "default" : "secondary"}
                  className={`text-xs ${
                    stat.trendUp 
                      ? "bg-green-100 text-green-800 hover:bg-green-100" 
                      : "bg-red-100 text-red-800 hover:bg-red-100"
                  }`}
                >
                  {stat.trend}
                </Badge>
              )}
              {stat.trendUp === null && (
                <Badge variant="outline" className="text-xs">
                  {stat.trend}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 