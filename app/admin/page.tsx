"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/admin/user-management";
import { SystemOverview } from "@/components/admin/system-overview";
import { ApplicationOversight } from "@/components/admin/application-oversight";
import { AdminReports } from "@/components/admin/admin-reports";
import { ApiAccessManagement } from "@/components/admin/api-access-management";
import { SiteContentManagement } from "@/components/admin/site-content-management";
import { ActivityLogs } from "@/components/admin/activity-logs";
import { RoleDelegationManagement } from "@/components/admin/role-delegation-management";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { ProtectedRoute } from "@/components/auth/protected-route";

import { getAdminDashboardStats } from "@/lib/supabase";
import {
  Users,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  UserCheck,
  KeyRound
} from "lucide-react";

interface AdminDashboardStats {
  totalUsers: number;
  totalApplications: number;
  pendingReviews: number;
  pendingAssessments: number;
  pendingApprovals: number;
  activeInspections: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const dashboardStats = await getAdminDashboardStats();
        setStats(dashboardStats);
      } catch (err) {
        console.error('Failed to fetch admin dashboard stats:', err);
        setError('Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute allowedRoles={['admin']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading Dashboard</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['admin']} requireProfile={true}>
      <DashboardLayout>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="container mx-auto px-4 py-6"
          >
          <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">System Administration</h3>
              <p className="text-muted-foreground">
                Manage users, monitor system performance, and oversee all water permit operations
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Registered users
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Applications</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalApplications || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Total processed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingReviews || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Require attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Inspections</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeInspections || 0}</div>
                <p className="text-xs text-muted-foreground">
                  In progress
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Assessments</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingAssessments || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting assessment
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingApprovals || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting final approval
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-10">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="delegations" className="flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" />
                Delegations
              </TabsTrigger>
              <TabsTrigger value="applications">Applications</TabsTrigger>
              <TabsTrigger value="water-reports">Water Use Reports</TabsTrigger>
              <TabsTrigger value="map">Consolidated Map</TabsTrigger>
              <TabsTrigger value="api-access" className="flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5" />
                API Access
              </TabsTrigger>
              <TabsTrigger value="content" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Content
              </TabsTrigger>
              <TabsTrigger value="logs">Activity Logs</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <SystemOverview />
            </TabsContent>
            
            <TabsContent value="users" className="space-y-4">
              <UserManagement />
            </TabsContent>
            
            <TabsContent value="delegations" className="space-y-4">
              <RoleDelegationManagement />
            </TabsContent>
            
            <TabsContent value="applications" className="space-y-4">
              <ApplicationOversight />
            </TabsContent>
            
            <TabsContent value="water-reports" className="space-y-4">
              <WaterUseReportsList roleContext="admin" />
            </TabsContent>
            
            <TabsContent value="map" className="space-y-4">
              <WaterConcessionMap />
            </TabsContent>

            <TabsContent value="api-access" className="space-y-4">
              <ApiAccessManagement />
            </TabsContent>
            
            <TabsContent value="content" className="space-y-4">
              <SiteContentManagement />
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <ActivityLogs />
            </TabsContent>
            
            <TabsContent value="reports" className="space-y-4">
              <AdminReports />
            </TabsContent>
          </Tabs>
          </div>
        </motion.div>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 