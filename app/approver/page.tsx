"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileCheck,
  Loader2,
  MapPin,
} from "lucide-react";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { AllApplicationsList } from "@/components/approver/all-applications-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StaffSidebar, staffNavItems } from "@/components/shared/staff-sidebar";
import { useTabParam } from "@/hooks/use-tab-param";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { PermitRegistryList } from "@/components/permit-registry/permit-registry-list";
import { InspectionList } from "@/components/inspection/inspection-list";
import { StatusFilterChips, type StatusChipDef } from "@/components/shared/status-filter-chips";
import type { Application } from "@/types/database";
import { ProtectedRoute } from "@/components/auth/protected-route";

// ─── Chip definitions per RWB spec ────────────────────────────────────────────
const APPROVER_CHIPS: StatusChipDef[] = [
  { id: "pending_approval", label: "Pending Approval", statuses: ["pending_final_approval"], priority: "primary" },
  { id: "returned_to_verifier", label: "Returned to Verifier", statuses: ["returned_to_verification"], priority: "secondary" },
  { id: "awaiting_terms", label: "Awaiting Terms", statuses: ["approved_pending_permit"], priority: "secondary" },
  { id: "issued", label: "Approved", statuses: ["approved"], priority: "downstream" },
  { id: "rejected", label: "Rejected", statuses: ["rejected"], priority: "downstream" },
  { id: "all_applications", label: "All Applications", statuses: [], priority: "primary" },
];

function ApproverDashboardContent() {
  const isTopTab = (v: string): v is "approval" | "inspections" | "water-reports" | "permit-registry" | "inspection-registry" =>
    v === "approval" || v === "inspections" || v === "water-reports" || v === "permit-registry" || v === "inspection-registry";
  const [loading, setLoading] = useState(true);
  const [topTab, setTopTab] = useTabParam<"approval" | "inspections" | "water-reports" | "permit-registry" | "inspection-registry">(
    "approval",
    ["approval", "inspections", "water-reports", "permit-registry", "inspection-registry"]
  );
  const [activeChipId, setActiveChipId] = useState("pending_approval");
  const [activeApprovalTab, setActiveApprovalTab] = useState("all_applications");
  // All applications for chip count computation
  const [allApplications, setAllApplications] = useState<Application[]>([]);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/staff/applications/summary', { credentials: 'include' });
        if (!res.ok) {
          console.warn(`⚠️ Failed to load applications summary (${res.status}), continuing without chip counts.`);
          setAllApplications([]);
          return;
        }
        const json = (await res.json()) as { applications?: Application[] };
        setAllApplications(json.applications || []);
      } catch (err) {
        console.warn("⚠️ Failed to fetch approver applications summary, continuing without chip counts:", err);
        setAllApplications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, []);

  // Derive active statuses from chip selection
  const activeStatuses = useMemo(() => {
    const chip = APPROVER_CHIPS.find((c) => c.id === activeChipId);
    return chip?.statuses ?? [];
  }, [activeChipId]);

  if (loading) {
    return (
      <DashboardLayout wide>
        <div className="mx-auto w-full max-w-[96rem] px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-[#0072bc]" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const activeChipLabel = APPROVER_CHIPS.find((c) => c.id === activeChipId)?.label ?? "All Applications";

  return (
    <ProtectedRoute allowedRoles={['approver', 'admin']} requireProfile={true}>
      <DashboardLayout wide>
        <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <StaffSidebar
              value={topTab}
              onValueChange={(v) => {
                if (isTopTab(v)) setTopTab(v);
              }}
              items={staffNavItems("approval")}
            >

            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">
                  {topTab === "approval" ? "Executive Approver Dashboard"
                    : topTab === "inspections" ? "Inspections"
                    : topTab === "water-reports" ? "Water Use Reports"
                    : "Permit Registry"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {topTab === "approval" ? "Strategic oversight and final decision-making for water permit applications"
                    : topTab === "inspections" ? "Manage and track field inspections"
                    : topTab === "water-reports" ? "Monitor and review water usage reports"
                    : "View and manage issued permits"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/management">
                  <Button variant="outline">Management Dashboard</Button>
                </Link>
              </div>
            </div>

            {topTab === "approval" ? (
              <>
              <StatusFilterChips
                chips={APPROVER_CHIPS}
                activeChipId={activeChipId}
                onChipChange={setActiveChipId}
                applications={allApplications}
                className="mb-6"
              />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Approval Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeApprovalTab} onValueChange={setActiveApprovalTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="all_applications">Applications</TabsTrigger>
                      <TabsTrigger value="map" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Consolidated Map
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all_applications" className="space-y-4 mt-4">
                      <AllApplicationsList
                        externalStatusFilter={activeStatuses}
                        title={activeChipLabel}
                      />
                    </TabsContent>

                    <TabsContent value="map" className="space-y-4 mt-4">
                      <WaterConcessionMap />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              </>
            ) : topTab === "inspections" ? (
              <div className="space-y-6">
                <InspectionsWorkbench roleContext="approver" />
              </div>
            ) : topTab === "water-reports" ? (
              <WaterUseReportsList roleContext="approver" />
            ) : topTab === "permit-registry" ? (
              <PermitRegistryList />
            ) : (
              <InspectionList />
            )}
            </StaffSidebar>
          </motion.div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default function ApproverDashboard() {
  return (
    <Suspense
      fallback={
        <DashboardLayout wide>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </DashboardLayout>
      }
    >
      <ApproverDashboardContent />
    </Suspense>
  );
}
