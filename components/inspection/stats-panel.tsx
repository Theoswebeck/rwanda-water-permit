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
  pendingAssessment: number
  underAssessment: number
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
        setError(null)

        // Query application counts in parallel for optimal performance
        const [
          totalRes,
          pendingRes,
          underReviewRes,
          revisionRes
        ] = await Promise.all([
          // Query for total applications
          supabase
            .from('applications')
            .select('*', { count: 'exact', head: true }),
          // Query for applications pending assessment
          supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_assessment'),
          // Query for applications currently under assessment (under_review)
          supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'under_review'),
          // Query for applications returned for revision
          supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'revision_required')
        ])

        if (totalRes.error) console.warn('Warning fetching total count:', totalRes.error)
        if (pendingRes.error) console.warn('Warning fetching pending count:', pendingRes.error)
        if (underReviewRes.error) console.warn('Warning fetching under review count:', underReviewRes.error)
        if (revisionRes.error) console.warn('Warning fetching revision count:', revisionRes.error)

        const statsData: InspectionStatsData = {
          totalApplications: totalRes.count || 0,
          pendingAssessment: pendingRes.count || 0,
          underAssessment: underReviewRes.count || 0,
          returnedForRevision: revisionRes.count || 0
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
      title: "Pending Assessment",
      value: stats?.pendingAssessment?.toString() || "0",
      description: "Awaiting technical assessment",
      icon: Clock,
      trend: (stats?.pendingAssessment || 0) > 0 ? `${stats?.pendingAssessment} waiting` : "All caught up",
      trendUp: (stats?.pendingAssessment || 0) === 0 ? true : null,
      color: "text-amber-600"
    },
    {
      title: "Under Assessment",
      value: stats?.underAssessment?.toString() || "0",
      description: "Currently being assessed",
      icon: Eye,
      trend: (stats?.underAssessment || 0) > 0 ? `${stats?.underAssessment} in progress` : "No active assessments",
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