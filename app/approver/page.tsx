"use client";

import { useState, useEffect, useMemo } from "react";
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
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { ClickableStatsGrid, StatsConfig } from "@/components/shared/clickable-stats-card";

interface DashboardStats {
  pendingFinalApproval: number;
  returnedToVerification: number;
  approvedPendingPermit: number;
  approved: number;
  totalApplications: number;
  avgDecisionTime: number;
  complianceRate: number;
}

export default function ApproverDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<"approval" | "inspections" | "water-reports">("approval");
  const [selectedStatId, setSelectedStatId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [activeApprovalTab, setActiveApprovalTab] = useState("all_applications");

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

  // Handle stats card click
  const handleStatClick = (statId: string | null, filterStatuses: string[]) => {
    setSelectedStatId(statId);
    setStatusFilter(filterStatuses);
  };

  // Create stats configuration for clickable cards
  // Pattern: Panel 1 = Pending (my queue), Panel 2 = Returned (under work), Panel 3 = Next Stage, Panel 4 = Next-Next Stage
  const statsConfig: StatsConfig[] = useMemo(() => [
    {
      id: "pending_approval",
      title: "Pending Approval",
      value: stats?.pendingFinalApproval ?? 0,
      description: "My queue - needs decision",
      icon: Clock,
      iconColor: "text-blue-600",
      filterStatuses: ["pending_final_approval"],
      badgeText: stats?.pendingFinalApproval === 0 ? "All caught up" : `${stats?.pendingFinalApproval} in queue`,
      badgeClassName: stats?.pendingFinalApproval === 0 
        ? "bg-green-100 text-green-800 hover:bg-green-100" 
        : "bg-blue-100 text-blue-800 hover:bg-blue-100",
    },
    {
      id: "returned_to_verification",
      title: "Returned to Verifier",
      value: stats?.returnedToVerification ?? 0,
      description: "Items I sent back",
      icon: AlertTriangle,
      iconColor: "text-amber-600",
      filterStatuses: ["returned_to_verification"],
      badgeText: stats?.returnedToVerification === 0 ? "No follow-ups" : `${stats?.returnedToVerification} returned`,
      badgeClassName: stats?.returnedToVerification === 0 
        ? "bg-green-100 text-green-800 hover:bg-green-100" 
        : "bg-amber-100 text-amber-800 hover:bg-amber-100",
    },
    {
      id: "approved_pending_permit",
      title: "Awaiting Terms",
      value: stats?.approvedPendingPermit ?? 0,
      description: "Next stage - with Applicant",
      icon: CheckCircle,
      iconColor: "text-green-600",
      filterStatuses: ["approved_pending_permit"],
      badgeText: stats?.approvedPendingPermit === 0 ? "None pending" : `${stats?.approvedPendingPermit} awaiting`,
      badgeClassName: stats?.approvedPendingPermit === 0 
        ? "bg-gray-100 text-gray-800 hover:bg-gray-100" 
        : "bg-green-100 text-green-800 hover:bg-green-100",
      isNextStage: true,
    },
    {
      id: "approved",
      title: "Permits Issued",
      value: stats?.approved ?? 0,
      description: "Next-next - active permits",
      icon: FileCheck,
      iconColor: "text-indigo-600",
      filterStatuses: ["approved"],
      badgeText: stats?.approved === 0 ? "None issued" : `${stats?.approved} permits`,
      badgeClassName: stats?.approved === 0 
        ? "bg-gray-100 text-gray-800 hover:bg-gray-100" 
        : "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
    },
  ], [stats]);

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

        {/* Summary Cards - Clickable to filter applications */}
        <ClickableStatsGrid
          stats={statsConfig}
          selectedStatId={selectedStatId}
          onStatClick={handleStatClick}
          isLoading={loading}
          columns={4}
        />

        <StaffTopTabs
          value={topTab}
          onValueChange={(v) => setTopTab(v as any)}
          tabs={[
            { value: "approval", label: "Application Approval" },
            { value: "inspections", label: "Inspections" },
            { value: "water-reports", label: "Water Use Reports" },
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
              <Tabs value={activeApprovalTab} onValueChange={setActiveApprovalTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all_applications">All Applications</TabsTrigger>
                  <TabsTrigger value="map" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Concession Map
                  </TabsTrigger>
                </TabsList>

              {/* Tab Contents */}
              <TabsContent value="all_applications" className="space-y-4 mt-6">
                <AllApplicationsList externalStatusFilter={statusFilter} />
              </TabsContent>

              <TabsContent value="map" className="space-y-4 mt-6">
                <WaterConcessionMap />
              </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : topTab === "inspections" ? (
          <div className="space-y-6">
            <InspectionsWorkbench />
          </div>
        ) : (
          <WaterUseReportsList />
        )}
      </motion.div>
      </div>
    // </ProtectedRoute>
  );
} 