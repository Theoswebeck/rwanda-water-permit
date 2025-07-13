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
  FileCheck
} from "lucide-react"
import { getInspectionStats } from "@/lib/supabase"

interface StatsData {
  pendingCount: number
  completedThisMonth: number
  overdueCount: number
  complianceRate: number
  draftCount: number
}

export function StatsPanel() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        const data = await getInspectionStats()
        setStats(data)
      } catch (err) {
        console.error('Error fetching inspection stats:', err)
        setError('Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[...Array(6)].map((_, index) => (
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="md:col-span-2 lg:col-span-3 xl:col-span-6">
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
      title: "Pending Inspections",
      value: stats?.pendingCount?.toString() || "0",
      description: "Applications waiting for inspection",
      icon: ClipboardList,
      trend: (stats?.pendingCount || 0) > 0 ? `${stats?.pendingCount} pending` : "No pending inspections",
      trendUp: (stats?.pendingCount || 0) > 0 ? null : true,
      color: "text-blue-600"
    },
    {
      title: "Completed This Month",
      value: stats?.completedThisMonth?.toString() || "0",
      description: "Inspections completed in current month",
      icon: CheckCircle2,
      trend: "Current month",
      trendUp: null,
      color: "text-green-600"
    },
    {
      title: "Overdue",
      value: stats?.overdueCount?.toString() || "0",
      description: "Inspections past due date",
      icon: AlertTriangle,
      trend: (stats?.overdueCount || 0) > 0 ? "Action required" : "All up to date",
      trendUp: (stats?.overdueCount || 0) > 0 ? false : true,
      color: "text-red-600"
    },
    {
      title: "Compliance Rate",
      value: `${stats?.complianceRate || 0}%`,
      description: "Applications meeting requirements",
      icon: TrendingUp,
      trend: (stats?.complianceRate || 0) >= 90 ? "Excellent" : (stats?.complianceRate || 0) >= 70 ? "Good" : "Needs improvement",
      trendUp: (stats?.complianceRate || 0) >= 90 ? true : (stats?.complianceRate || 0) >= 70 ? null : false,
      color: "text-emerald-600"
    },
    {
      title: "Avg. Inspection Time",
      value: "2.5 hrs",
      description: "Average time per inspection",
      icon: Clock,
      trend: "Estimated average",
      trendUp: null,
      color: "text-purple-600"
    },
    {
      title: "Draft Reports",
      value: stats?.draftCount?.toString() || "0",
      description: "Inspections saved as draft",
      icon: FileCheck,
      trend: (stats?.draftCount || 0) > 0 ? "Ready for completion" : "All reports complete",
      trendUp: null,
      color: "text-orange-600"
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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