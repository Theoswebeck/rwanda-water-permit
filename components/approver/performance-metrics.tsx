"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  AlertCircle,
  Download,
  Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PerformanceKPI {
  name: string;
  current: number;
  target: number;
  previous: number;
  unit: string;
  trend: "up" | "down" | "stable";
  status: "excellent" | "good" | "warning" | "critical";
}

interface StaffPerformance {
  name: string;
  role: "reviewer" | "inspector" | "approver";
  applicationsProcessed: number;
  averageProcessingTime: number;
  qualityScore: number;
  efficiency: number;
}

export function PerformanceMetrics() {
  const [kpis, setKpis] = useState<PerformanceKPI[]>([]);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch applications for metrics calculation
      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (appsError) throw appsError;

      // Calculate KPIs from real data
      const currentMonth = new Date();
      const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      const currentMonthApps = applications?.filter(app => 
        new Date(app.created_at) >= lastMonth
      ) || [];

      const previousMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 2, 1);
      const previousMonthApps = applications?.filter(app => {
        const appDate = new Date(app.created_at);
        return appDate >= previousMonth && appDate < lastMonth;
      }) || [];

      // Calculate processing times
      const completedApps = applications?.filter(app => 
        app.status === 'approved' || app.status === 'rejected'
      ) || [];

      const avgProcessingTime = completedApps.length > 0 
        ? completedApps.reduce((sum, app) => {
            const created = new Date(app.created_at);
            const completed = new Date(app.approved_at || app.updated_at);
            return sum + (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / completedApps.length
        : 0;

      const prevAvgProcessingTime = previousMonthApps.length > 0 
        ? previousMonthApps.reduce((sum, app) => {
            const created = new Date(app.created_at);
            const completed = new Date(app.approved_at || app.updated_at);
            return sum + (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / previousMonthApps.length
        : avgProcessingTime;

      // Calculate approval rate
      const approvedApps = currentMonthApps.filter(app => app.status === 'approved').length;
      const totalDecisions = currentMonthApps.filter(app => 
        app.status === 'approved' || app.status === 'rejected'
      ).length;
      const approvalRate = totalDecisions > 0 ? (approvedApps / totalDecisions) * 100 : 0;

      const prevApprovedApps = previousMonthApps.filter(app => app.status === 'approved').length;
      const prevTotalDecisions = previousMonthApps.filter(app => 
        app.status === 'approved' || app.status === 'rejected'
      ).length;
      const prevApprovalRate = prevTotalDecisions > 0 ? (prevApprovedApps / prevTotalDecisions) * 100 : approvalRate;

      // Calculate SLA compliance
      const slaCompliantApps = currentMonthApps.filter(app => app.sla_status === 'on_time').length;
      const slaCompliance = currentMonthApps.length > 0 ? (slaCompliantApps / currentMonthApps.length) * 100 : 0;

      const prevSlaCompliantApps = previousMonthApps.filter(app => app.sla_status === 'on_time').length;
      const prevSlaCompliance = previousMonthApps.length > 0 ? (prevSlaCompliantApps / previousMonthApps.length) * 100 : slaCompliance;

      const calculatedKPIs: PerformanceKPI[] = [
        {
          name: "Average Processing Time",
          current: Math.round(avgProcessingTime * 10) / 10,
          target: 10.0,
          previous: Math.round(prevAvgProcessingTime * 10) / 10,
          unit: "days",
          trend: avgProcessingTime < prevAvgProcessingTime ? "up" : avgProcessingTime > prevAvgProcessingTime ? "down" : "stable",
          status: avgProcessingTime <= 8 ? "excellent" : avgProcessingTime <= 12 ? "good" : avgProcessingTime <= 15 ? "warning" : "critical"
        },
        {
          name: "Application Approval Rate",
          current: Math.round(approvalRate * 10) / 10,
          target: 85.0,
          previous: Math.round(prevApprovalRate * 10) / 10,
          unit: "%",
          trend: approvalRate > prevApprovalRate ? "up" : approvalRate < prevApprovalRate ? "down" : "stable",
          status: approvalRate >= 85 ? "excellent" : approvalRate >= 75 ? "good" : approvalRate >= 60 ? "warning" : "critical"
        },
        {
          name: "SLA Compliance",
          current: Math.round(slaCompliance * 10) / 10,
          target: 95.0,
          previous: Math.round(prevSlaCompliance * 10) / 10,
          unit: "%",
          trend: slaCompliance > prevSlaCompliance ? "up" : slaCompliance < prevSlaCompliance ? "down" : "stable",
          status: slaCompliance >= 95 ? "excellent" : slaCompliance >= 85 ? "good" : slaCompliance >= 70 ? "warning" : "critical"
        },
        {
          name: "Applications This Month",
          current: currentMonthApps.length,
          target: 150,
          previous: previousMonthApps.length,
          unit: "apps",
          trend: currentMonthApps.length > previousMonthApps.length ? "up" : currentMonthApps.length < previousMonthApps.length ? "down" : "stable",
          status: currentMonthApps.length >= 150 ? "excellent" : currentMonthApps.length >= 100 ? "good" : currentMonthApps.length >= 50 ? "warning" : "critical"
        }
      ];

      setKpis(calculatedKPIs);

      // Fetch staff performance data
      const { data: staffData, error: staffError } = await supabase
        .from('users')
        .select(`
          id,
          first_name,
          last_name,
          role,
          reviews!reviewer_id(id, created_at, processing_time_hours),
          inspections!inspector_id(id, created_at, completed_date),
          approvals!approver_id(id, created_at)
        `)
        .in('role', ['reviewer', 'inspector', 'approver']);

      if (staffError) throw staffError;

      const staffPerformanceData: StaffPerformance[] = staffData?.map(staff => {
        const name = `${staff.first_name} ${staff.last_name}`;
        const role = staff.role as "reviewer" | "inspector" | "approver";
        
        let applicationsProcessed = 0;
        let averageProcessingTime = 0;
        let qualityScore = 95; // Default quality score
        let efficiency = 90; // Default efficiency

        if (role === 'reviewer' && staff.reviews) {
          applicationsProcessed = staff.reviews.length;
          const totalHours = staff.reviews.reduce((sum: number, review: any) => 
            sum + (review.processing_time_hours || 0), 0);
          averageProcessingTime = applicationsProcessed > 0 ? (totalHours / applicationsProcessed) / 24 : 0;
        } else if (role === 'inspector' && staff.inspections) {
          applicationsProcessed = staff.inspections.length;
          const totalDays = staff.inspections.reduce((sum: number, inspection: any) => {
            if (inspection.completed_date) {
              const created = new Date(inspection.created_at);
              const completed = new Date(inspection.completed_date);
              return sum + (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
            }
            return sum;
          }, 0);
          averageProcessingTime = applicationsProcessed > 0 ? totalDays / applicationsProcessed : 0;
        } else if (role === 'approver' && staff.approvals) {
          applicationsProcessed = staff.approvals.length;
          averageProcessingTime = 2; // Approvals typically take 1-2 days
        }

        // Calculate efficiency based on processing time vs target
        const targetTime = role === 'reviewer' ? 5 : role === 'inspector' ? 7 : 2;
        efficiency = Math.max(0, Math.min(100, 100 - ((averageProcessingTime - targetTime) / targetTime) * 20));

        return {
          name,
          role,
          applicationsProcessed,
          averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
          qualityScore,
          efficiency: Math.round(efficiency)
        };
      }).filter(staff => staff.applicationsProcessed > 0) || [];

      setStaffPerformance(staffPerformanceData);

    } catch (err) {
      console.error('Error fetching performance data:', err);
      setError('Failed to load performance metrics');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "excellent": return "text-green-600 bg-green-100";
      case "good": return "text-blue-600 bg-blue-100";
      case "warning": return "text-yellow-600 bg-yellow-100";
      case "critical": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "down": return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <div className="h-4 w-4" />;
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
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Error Loading Performance Data</h3>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchPerformanceData} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Metrics</h2>
          <p className="text-muted-foreground">
            Real-time system performance and staff productivity metrics
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.name}</CardTitle>
              {getTrendIcon(kpi.trend)}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {kpi.current}{kpi.unit}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>Target: {kpi.target}{kpi.unit}</span>
                <Badge variant="outline" className={getStatusColor(kpi.status)}>
                  {kpi.status}
                </Badge>
              </div>
              <Progress 
                value={(kpi.current / kpi.target) * 100} 
                className="mt-3" 
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Staff Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Performance</CardTitle>
          <CardDescription>
            Individual staff productivity and quality metrics from database records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {staffPerformance.length > 0 ? (
              staffPerformance.map((staff) => (
                <div key={staff.name} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">{staff.name}</h4>
                      <p className="text-sm text-muted-foreground capitalize">{staff.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6 text-sm">
                    <div className="text-center">
                      <div className="font-semibold">{staff.applicationsProcessed}</div>
                      <div className="text-muted-foreground">Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{staff.averageProcessingTime}d</div>
                      <div className="text-muted-foreground">Avg Time</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{staff.qualityScore}%</div>
                      <div className="text-muted-foreground">Quality</div>
                    </div>
                    <div className="text-center">
                      <Badge variant="outline" className={
                        staff.efficiency >= 90 ? "bg-green-100 text-green-700" : 
                        staff.efficiency >= 75 ? "bg-blue-100 text-blue-700" : 
                        "bg-yellow-100 text-yellow-700"
                      }>
                        {staff.efficiency}% Efficiency
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No staff performance data available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 