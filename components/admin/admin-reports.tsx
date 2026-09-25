"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  Download, 
  FileText,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Loader2
} from "lucide-react";

interface ReportData {
  overview: {
    totalApplications: number;
    approvedApplications: number;
    rejectedApplications: number;
    pendingApplications: number;
    totalValue: number;
  };
}

export function AdminReports() {
  const [timeRange, setTimeRange] = useState("30d");

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/reports?range=${timeRange}`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setReportData(data);
    } catch (err) {
      console.error('Failed to fetch report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

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
        csvContent += `Total Payments Collected (RWF),${reportData.overview.totalValue}\n`;
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>System Reports & Analytics</CardTitle>
              <CardDescription>
                Comprehensive insights and performance metrics
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

              <div className="space-y-6">

          {/* Key Performance Indicators */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                    ? `${reportData.overview.totalValue.toLocaleString()} RWF`
                    : '0 RWF'}
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span>Total payments collected</span>
                </div>
              </CardContent>
            </Card>
            

          </div>


      </div>


    </div>
  );
} 