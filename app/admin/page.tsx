"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { StatsCard } from "@/components/ui/stats-card";
import { TabsContent } from "@/components/ui/tabs";
import { StaffSidebar, type StaffNavItem } from "@/components/shared/staff-sidebar";
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
import { PermitRegistryList } from "@/components/permit-registry/permit-registry-list";
import { InspectionRegistryList } from "@/components/inspection-registry/inspection-registry-list";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useTabParam } from "@/hooks/use-tab-param";

import { getAdminDashboardStats } from "@/lib/supabase";
import {
  Users,
  FileText,
  AlertTriangle,
  Loader2,
  UserCheck,
  KeyRound,
  LayoutDashboard,
  Droplets,
  Map,
  PenSquare,
  ScrollText,
  BarChart3,
  BookOpen,
  ClipboardCheck
} from "lucide-react";

const ADMIN_VALID_TABS = [
  "overview",
  "reports",
  "logs",
  "applications",
  "water-reports",
  "map",
  "users",
  "delegations",
  "api-access",
  "content",
  "permit-registry",
  "inspection-registry",
] as const;

type AdminTab = (typeof ADMIN_VALID_TABS)[number];

const ADMIN_NAV: StaffNavItem[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard, group: "General" },
  { value: "users", label: "User Management", icon: Users, group: "Access" },
  { value: "applications", label: "Applications Oversight", icon: FileText, group: "Operations" },
  { value: "water-reports", label: "Water Use Reports", icon: Droplets, group: "Operations" },
  { value: "map", label: "Consolidated Map", icon: Map, group: "Operations" },
  { value: "logs", label: "Activity Logs", icon: ScrollText, group: "General" },
  { value: "delegations", label: "Delegations", icon: UserCheck, group: "Access" },
  { value: "api-access", label: "API Access", icon: KeyRound, group: "Access" },
  { value: "content", label: "Website Content", icon: PenSquare, group: "Website" },
  { value: "reports", label: "Reports", icon: BarChart3, group: "General" },
  { value: "permit-registry", label: "Permit Registry", icon: BookOpen, group: "Registries" },
  { value: "inspection-registry", label: "Inspection Registry", icon: ClipboardCheck, group: "Registries" },
];

interface AdminDashboardStats {
  totalUsers: number;
  totalApplications: number;
  pendingReviews: number;
  pendingAssessments: number;
  pendingApprovals: number;
  activeInspections: number;
}

function AdminDashboardContent() {
  const [activeTab, setActiveTab] = useTabParam<AdminTab>("overview", ADMIN_VALID_TABS);
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
        <DashboardLayout wide>
          <div className="mx-auto w-full px-4 py-6">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-[#0072bc]" />
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute allowedRoles={['admin']} requireProfile={true}>
        <DashboardLayout wide>
          <div className="mx-auto w-full px-4 py-6">
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
      <DashboardLayout wide>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-full px-4 py-6"
        >
          <div className="space-y-6">
            {activeTab !== "permit-registry" && activeTab !== "inspection-registry" && (
              <>
                {/* Executive Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      System Administration
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Manage users, monitor system performance, and oversee all water permit operations
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                      Status: System Operational
                    </span>
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <StatsCard
                    data={{
                      title: "Total Users",
                      value: stats?.totalUsers || 0,
                      iconName: "Users",
                      color: "blue",
                      description: "Registered users",
                    }}
                  />
                  <StatsCard
                    data={{
                      title: "Applications",
                      value: stats?.totalApplications || 0,
                      iconName: "FileText",
                      color: "green",
                      description: "Total processed",
                    }}
                  />
                  <StatsCard
                    data={{
                      title: "Pending Reviews",
                      value: stats?.pendingReviews || 0,
                      iconName: "Clock",
                      color: "amber",
                      description: "Require attention",
                    }}
                  />
                  <StatsCard
                    data={{
                      title: "Active Inspections",
                      value: stats?.activeInspections || 0,
                      iconName: "CheckCircle",
                      color: "purple",
                      description: "In progress",
                    }}
                  />
                  <StatsCard
                    data={{
                      title: "Pending Assessments",
                      value: stats?.pendingAssessments || 0,
                      iconName: "FileSpreadsheet",
                      color: "indigo",
                      description: "Awaiting assessment",
                    }}
                  />
                  <StatsCard
                    data={{
                      title: "Pending Approvals",
                      value: stats?.pendingApprovals || 0,
                      iconName: "CheckCircle2",
                      color: "blue",
                      description: "Awaiting DG sign-off",
                    }}
                  />
                </div>
              </>
            )}

            {/* Main Full-Width Horizontal Workbench Sections */}
            <StaffSidebar
              value={activeTab}
              onValueChange={(val) => {
                if (ADMIN_VALID_TABS.includes(val as AdminTab)) {
                  setActiveTab(val as AdminTab);
                }
              }}
              items={ADMIN_NAV}
            >
              <TabsContent value="overview" className="space-y-4 focus-visible:outline-none">
                <SystemOverview />
              </TabsContent>
              
              <TabsContent value="users" className="space-y-4 focus-visible:outline-none">
                <UserManagement />
              </TabsContent>
              
              <TabsContent value="delegations" className="space-y-4 focus-visible:outline-none">
                <RoleDelegationManagement />
              </TabsContent>
              
              <TabsContent value="applications" className="space-y-4 focus-visible:outline-none">
                <ApplicationOversight />
              </TabsContent>
              
              <TabsContent value="water-reports" className="space-y-4 focus-visible:outline-none">
                <WaterUseReportsList roleContext="admin" />
              </TabsContent>
              
              <TabsContent value="map" className="space-y-4 focus-visible:outline-none">
                <WaterConcessionMap />
              </TabsContent>

              <TabsContent value="api-access" className="space-y-4 focus-visible:outline-none">
                <ApiAccessManagement />
              </TabsContent>
              
              <TabsContent value="content" className="space-y-4 focus-visible:outline-none">
                <SiteContentManagement />
              </TabsContent>

              <TabsContent value="logs" className="space-y-4 focus-visible:outline-none">
                <ActivityLogs />
              </TabsContent>
              
              <TabsContent value="reports" className="space-y-4 focus-visible:outline-none">
                <AdminReports />
              </TabsContent>

              <TabsContent value="permit-registry" className="space-y-4 focus-visible:outline-none">
                <PermitRegistryList canUpload={true} canEdit={true} />
              </TabsContent>

              <TabsContent value="inspection-registry" className="space-y-4 focus-visible:outline-none">
                <InspectionRegistryList canUpload={true} canEdit={true} />
              </TabsContent>
            </StaffSidebar>
          </div>
        </motion.div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f3f5fa] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#0072bc]" />
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}
