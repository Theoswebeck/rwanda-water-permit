"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
// import { ProtectedRoute } from "@/components/auth/protected-route"; // TEMPORARY: Disabled for testing
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApproverDashboardStats } from "@/lib/supabase";
import { 
  CheckCircle, 
  XCircle, 
  Clock,
  FileCheck, 
  AlertTriangle,
  Loader2,
  MapPin
} from "lucide-react";
import { FinalDecisions } from "@/components/approver/final-decisions";
import { ExecutiveOverview } from "@/components/approver/executive-overview";
import { PerformanceMetrics } from "@/components/approver/performance-metrics";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { AllApplicationsList } from "@/components/approver/all-applications-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StaffInspectionsTab } from "@/components/inspection/staff-inspections-tab";
import { ActivePermitsInspectionTab } from "@/components/inspection/active-permits-inspection-tab";
import { StaffTopTabs } from "@/components/shared/staff-top-tabs";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";

interface DashboardStats {
  pendingFinalApproval: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  totalApplications: number;
  avgDecisionTime: number;
  complianceRate: number;
}

export default function ApproverDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<"approval" | "inspections">("approval");

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
      // <ProtectedRoute allowedRoles={['approver']} requireProfile={true}>
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      // </ProtectedRoute>
    );
  }

  if (error) {
    return (
      // <ProtectedRoute allowedRoles={['approver']} requireProfile={true}>
        <div className="container mx-auto px-6 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading Dashboard</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      // </ProtectedRoute>
    );
  }

  return (
    // <ProtectedRoute allowedRoles={['approver']} requireProfile={true}>
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
          <div className="flex items-center gap-2">
            <Link href="/management">
              <Button variant="outline">Management Dashboard</Button>
            </Link>
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

        <StaffTopTabs
          value={topTab}
          onValueChange={(v) => setTopTab(v as any)}
          tabs={[
            { value: "approval", label: "Application Approval" },
            { value: "inspections", label: "Inspections" },
          ]}
        />

        {topTab === "approval" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Approval Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="pending_approval" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="pending_approval">Pending Approval</TabsTrigger>
                  <TabsTrigger value="all_applications">All Applications</TabsTrigger>
                  <TabsTrigger value="map" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Concession Map
                  </TabsTrigger>
                </TabsList>

              {/* Tab Contents */}
              <TabsContent value="pending_approval" className="space-y-4 mt-6">
                <FinalDecisions />
              </TabsContent>

              <TabsContent value="all_applications" className="space-y-4 mt-6">
                <AllApplicationsList />
              </TabsContent>

              <TabsContent value="map" className="space-y-4 mt-6">
                <WaterConcessionMap />
              </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <InspectionsWorkbench />
          </div>
        )}
      </motion.div>
      </div>
    // </ProtectedRoute>
  );
} 