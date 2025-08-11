"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  Download, 
  FileText,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Activity,
  Loader2
} from "lucide-react";
import { getAdminReportsData } from "@/lib/supabase";

interface ReportData {
  overview: {
    totalApplications: number;
    approvedApplications: number;
    rejectedApplications: number;
    pendingApplications: number;
    totalValue: number;
    avgProcessingTime: number;
    userSatisfaction: number;
    systemUptime: number;
  };
  byType: Record<string, { count: number; percentage: number; value: number }>;
  byLocation: Record<string, { count: number; percentage: number }>;
  performance: {
    avgReviewTime: number;
    avgInspectionTime: number;
    overtimeApplications: number;
    staffUtilization: number;
    errorRate: number;
  };
}

export function AdminReports() {
  const [timeRange, setTimeRange] = useState("30d");

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReportData();
  }, [timeRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const data = await getAdminReportsData();
      if (data) {
        setReportData(data);
      } else {
        setError('No report data available');
      }
    } catch (err) {
      console.error('Failed to fetch report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = (type: string) => {
    if (!reportData) {
      alert('No data available for report generation');
      return;
    }
    
    // Create CSV content based on report type
    let csvContent = '';
    const currentDate = new Date().toISOString().split('T')[0];
    
    switch (type) {
      case 'comprehensive':
        csvContent = `Rwanda Water Permit System - Comprehensive Report (${timeRange})\n\n`;
        csvContent += `Generated on: ${currentDate}\n\n`;
        csvContent += `OVERVIEW\n`;
        csvContent += `Total Applications,${reportData.overview.totalApplications}\n`;
        csvContent += `Approved Applications,${reportData.overview.approvedApplications}\n`;
        csvContent += `Rejected Applications,${reportData.overview.rejectedApplications}\n`;
        csvContent += `Pending Applications,${reportData.overview.pendingApplications}\n`;
        csvContent += `Total Value (RWF),${reportData.overview.totalValue}\n`;
        csvContent += `Average Processing Time (days),${reportData.overview.avgProcessingTime}\n\n`;
        csvContent += `PERFORMANCE\n`;
        csvContent += `Average Review Time (days),${reportData.performance.avgReviewTime}\n`;
        csvContent += `Average Inspection Time (days),${reportData.performance.avgInspectionTime}\n`;
        csvContent += `Overdue Applications,${reportData.performance.overtimeApplications}\n`;
        csvContent += `Staff Utilization (%),${reportData.performance.staffUtilization}\n`;
        break;
      default:
        csvContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${currentDate}\n`;
        csvContent += `Report generation for ${type} type is in development.\n`;
    }
    
    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${type}_report_${currentDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading Reports</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No report data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>System Reports & Analytics</CardTitle>
              <CardDescription>
                Comprehensive insights and performance metrics
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 3 months</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => generateReport("comprehensive")}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

              <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Performance Indicators */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.overview.totalApplications}</div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span>Total applications processed</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.overview.totalApplications > 0 
                    ? Math.round((reportData.overview.approvedApplications / reportData.overview.totalApplications) * 100)
                    : 0}%
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3 text-muted-foreground" />
                  <span>Approval percentage</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.overview.totalValue > 0 
                    ? `${(reportData.overview.totalValue / 1000000).toFixed(0)}M RWF`
                    : '0 RWF'}
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span>Total project value</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.overview.avgProcessingTime} days</div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span>Average processing time</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Application Type Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Applications by Type</CardTitle>
                <CardDescription>Distribution of permit applications by category</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(reportData.byType).map(([type, data]) => (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{type.replace('_', ' ')}</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{data.count}</span>
                        <span className="text-muted-foreground">({data.percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <Progress value={data.percentage} className="h-2" />
                    <div className="text-xs text-muted-foreground">
                      Value: {data.value > 0 ? `${(data.value / 1000000).toFixed(1)}M RWF` : '0 RWF'}
                    </div>
                  </div>
                ))}
                {Object.keys(reportData.byType).length === 0 && (
                  <p className="text-sm text-muted-foreground">No application type data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
                <CardDescription>Applications by province</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(reportData.byLocation).map(([location, data]) => (
                  <div key={location} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{location} Province</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{data.count}</span>
                        <span className="text-muted-foreground">({data.percentage}%)</span>
                      </div>
                    </div>
                    <Progress value={data.percentage} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Review Time</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.performance.avgReviewTime} days</div>
                <p className="text-xs text-muted-foreground">Average review time</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inspection Time</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.performance.avgInspectionTime} days</div>
                <p className="text-xs text-muted-foreground">Average inspection time</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{reportData.performance.overtimeApplications}</div>
                <p className="text-xs text-muted-foreground">Applications overdue</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Staff Utilization</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.performance.staffUtilization}%</div>
                <p className="text-xs text-muted-foreground">Average utilization</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Analysis</CardTitle>
              <CardDescription>System performance and efficiency metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Review Process Efficiency</span>
                  <span className="text-sm text-muted-foreground">{reportData.performance.avgReviewTime} days avg</span>
                </div>
                <Progress value={Math.max(0, 100 - (reportData.performance.avgReviewTime / 15) * 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {reportData.performance.avgReviewTime <= 10 ? 'Excellent performance' : 
                   reportData.performance.avgReviewTime <= 15 ? 'Good performance' : 'Needs improvement'}
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Inspection Process Efficiency</span>
                  <span className="text-sm text-muted-foreground">{reportData.performance.avgInspectionTime} days avg</span>
                </div>
                <Progress value={Math.max(0, 100 - (reportData.performance.avgInspectionTime / 7) * 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {reportData.performance.avgInspectionTime <= 3 ? 'Excellent performance' : 
                   reportData.performance.avgInspectionTime <= 5 ? 'Good performance' : 'Needs improvement'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Error Rate</span>
                  <span className="text-sm text-muted-foreground">{reportData.performance.errorRate}%</span>
                </div>
                <Progress value={Math.max(0, 100 - reportData.performance.errorRate * 50)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Very low error rate - excellent quality control
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>


    </div>
  );
} 