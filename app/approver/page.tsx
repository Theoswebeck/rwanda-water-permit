"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApproverDashboardStats } from "@/lib/supabase";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileCheck, 
  AlertTriangle,
  Loader2
} from "lucide-react";
import { FinalDecisions } from "@/components/approver/final-decisions";
import { ExecutiveOverview } from "@/components/approver/executive-overview";
import { PerformanceMetrics } from "@/components/approver/performance-metrics";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { AllApplicationsList } from "@/components/approver/all-applications-list";

interface DashboardStats {
  pendingFinalApproval: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  totalApplications: number;
  avgDecisionTime: number;
  complianceRate: number;
}

export default function ApproverDashboard() {
  const [activeTab, setActiveTab] = useState("decisions");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const dashboardStats = await getApproverDashboardStats();
        setStats(dashboardStats);
      } catch (err) {
        console.error('Failed to fetch approver dashboard stats:', err);
        setError('Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading Dashboard</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-6">
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Executive Approver Dashboard
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
              Strategic oversight and final decision-making for water permit applications
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-muted-foreground">System Online</span>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalApplications || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingFinalApproval || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.approvedThisMonth || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.rejectedThisMonth || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="mt-12">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <div className="border-b">
              <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/50 rounded-lg">
                <TabsTrigger 
                  value="decisions" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200 py-3 px-4 text-sm font-medium"
                >
                  Final Decisions
                </TabsTrigger>
                <TabsTrigger 
                  value="applications" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200 py-3 px-4 text-sm font-medium"
                >
                  All Applications
                </TabsTrigger>
                <TabsTrigger 
                  value="map" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200 py-3 px-4 text-sm font-medium"
                >
                  Water Concessions
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-8">
              <TabsContent value="decisions" className="mt-0 space-y-6">
                <FinalDecisions />
              </TabsContent>

              {/* Overview and Performance removed per RWB request */}

              <TabsContent value="applications" className="mt-0 space-y-6">
                <AllApplicationsList />
              </TabsContent>

              <TabsContent value="map" className="mt-0 space-y-6">
                <WaterConcessionMap />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
} 