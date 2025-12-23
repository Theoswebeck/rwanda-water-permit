"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Server,
  Activity,
  Loader2
} from "lucide-react";
import { 
  getAdminDashboardStats, 
  getApplicationStatusDistribution, 
  getRecentSystemActivity,
  getTeamWorkload,
  getMonthlyApplicationStats,
  getMonthlyUserStats,
  getProcessingTimeStats,
  supabase
} from "@/lib/supabase";

interface SystemMetrics {
  applications: {
    total: number;
    thisMonth: number;
    change: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  users: {
    total: number;
    active: number;
    newThisMonth: number;
    change: number;
  };
  performance: {
    avgProcessingTime: number;
    improvement: number;
    uptime: number;
    responseTime: number;
    errorRate: number;
  };
  workload: {
    reviewersAvg: number;
    inspectorsAvg: number;
    overdueApplications: number;
  };
}

interface Activity {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  type: string;
}

interface StatusDistribution {
  status: string;
  count: number;
  color: string;
}

interface TeamWorkload {
  reviewers: {
    count: number;
    totalApplications: number;
    avgWorkload: number;
    workloadPercentage: number;
  };
  inspectors: {
    count: number;
    totalApplications: number;
    avgWorkload: number;
    workloadPercentage: number;
  };
  approvers: {
    count: number;
    totalApplications: number;
    avgWorkload: number;
    workloadPercentage: number;
  };
  overdueApplications: number;
}

export function SystemOverview() {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [teamWorkload, setTeamWorkload] = useState<TeamWorkload | null>(null);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<StatusDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch all data in parallel
        const [
          adminStats, 
          statusDist, 
          activity, 
          workloadData,
          monthlyApps,
          monthlyUsers,
          processingTime
        ] = await Promise.all([
          getAdminDashboardStats(),
          getApplicationStatusDistribution(),
          getRecentSystemActivity(),
          getTeamWorkload(),
          getMonthlyApplicationStats(),
          getMonthlyUserStats(),
          getProcessingTimeStats()
        ]);

        // Get approved and rejected counts from database
        const { data: applications } = await supabase
          .from('applications')
          .select('status')

        const approvedCount = applications?.filter(app => app.status === 'approved').length || 0
        const rejectedCount = applications?.filter(app => app.status === 'rejected').length || 0

        // Transform admin stats to system metrics format using real DB data
        if (adminStats) {
          setSystemMetrics({
            applications: {
              total: adminStats.totalApplications,
              thisMonth: monthlyApps.thisMonth,
              change: monthlyApps.change,
              pending: adminStats.pendingReviews,
              approved: approvedCount,
              rejected: rejectedCount
            },
            users: {
              total: adminStats.totalUsers,
              active: monthlyUsers.active,
              newThisMonth: monthlyUsers.newThisMonth,
              change: monthlyUsers.change
            },
            performance: {
              avgProcessingTime: processingTime.avgProcessingTime,
              improvement: processingTime.improvement,
              uptime: 0, // Not tracked yet - would need system logs
              responseTime: 0, // Not tracked yet - would need API monitoring
              errorRate: 0 // Not tracked yet - would need error logging
            },
            workload: {
              reviewersAvg: workloadData.reviewers.avgWorkload,
              inspectorsAvg: workloadData.inspectors.avgWorkload,
              overdueApplications: workloadData.overdueApplications
            }
          });
        }

        setTeamWorkload(workloadData);
        setStatusDistribution(statusDist);
        setRecentActivity(activity);
      } catch (err) {
        console.error('Failed to fetch system overview data:', err);
        setError('Failed to load system overview data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "application":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "inspection":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "approval":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "user":
        return <Users className="h-4 w-4 text-purple-600" />;
      case "system":
        return <Server className="h-4 w-4 text-gray-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading System Overview</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!systemMetrics) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No system data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.applications.thisMonth}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+{systemMetrics.applications.change}%</span>
              <span>from last month</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.users.active}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+{systemMetrics.users.change}%</span>
              <span>growth rate</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.performance.avgProcessingTime} days</div>
            {systemMetrics.performance.improvement > 0 && (
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <TrendingDown className="h-3 w-3 text-green-600" />
                <span className="text-green-600">-{systemMetrics.performance.improvement.toFixed(1)} days</span>
                <span>improvement</span>
              </div>
            )}
            {systemMetrics.performance.improvement <= 0 && systemMetrics.performance.avgProcessingTime > 0 && (
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span>Average processing time</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Application Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Application Status Distribution</CardTitle>
          <CardDescription>
            Current breakdown of all applications by status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusDistribution.map((item, index) => {
            const total = statusDistribution.reduce((sum, s) => sum + s.count, 0);
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            
            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded ${item.color}`} />
                    <span>{item.status}</span>
                  </div>
                  <div className="font-medium">
                    {item.count} ({percentage}%)
                  </div>
                </div>
                <Progress value={percentage} className="h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest system events and user actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-sm text-muted-foreground">{activity.details}</p>
                      <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Workload Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Team Workload</CardTitle>
            <CardDescription>
              Current workload distribution across teams
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {teamWorkload && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Reviewers</span>
                    <span className="text-sm text-muted-foreground">
                      Avg: {teamWorkload.reviewers.avgWorkload} applications
                    </span>
                  </div>
                  <Progress value={teamWorkload.reviewers.workloadPercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {teamWorkload.reviewers.count} reviewers, {teamWorkload.reviewers.totalApplications} applications assigned
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Inspectors</span>
                    <span className="text-sm text-muted-foreground">
                      Avg: {teamWorkload.inspectors.avgWorkload} inspections
                    </span>
                  </div>
                  <Progress value={teamWorkload.inspectors.workloadPercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {teamWorkload.inspectors.count} inspectors, {teamWorkload.inspectors.totalApplications} inspections assigned
                  </p>
                </div>

                {teamWorkload.approvers.count > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Approvers</span>
                      <span className="text-sm text-muted-foreground">
                        Avg: {teamWorkload.approvers.avgWorkload} applications
                      </span>
                    </div>
                    <Progress value={teamWorkload.approvers.workloadPercentage} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {teamWorkload.approvers.count} approvers, {teamWorkload.approvers.totalApplications} applications assigned
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overdue Applications</span>
                    <span className="text-sm font-medium text-red-600">
                      {teamWorkload.overdueApplications}
                    </span>
                  </div>
                  {teamWorkload.overdueApplications > 0 && (
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <p className="text-xs text-red-600">
                        Immediate attention required
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 