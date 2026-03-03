"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileCheck,
  AlertTriangle,
  Loader2,
  MapPin,
} from "lucide-react";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { AllApplicationsList } from "@/components/approver/all-applications-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StaffTopTabs } from "@/components/shared/staff-top-tabs";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { PermitRegistryList } from "@/components/permit-registry/permit-registry-list";
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
];

export default function ApproverDashboard() {
  const isTopTab = (v: string): v is "approval" | "inspections" | "water-reports" | "permit-registry" =>
    v === "approval" || v === "inspections" || v === "water-reports" || v === "permit-registry";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<"approval" | "inspections" | "water-reports" | "permit-registry">("approval");
  const [activeChipId, setActiveChipId] = useState(APPROVER_CHIPS[0].id);
  const [activeApprovalTab, setActiveApprovalTab] = useState("all_applications");
  // All applications for chip count computation
  const [allApplications, setAllApplications] = useState<Application[]>([]);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/staff/applications/summary', { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load applications (${res.status})`);
        const json = (await res.json()) as { applications?: Application[] };
        setAllApplications(json.applications || []);
      } catch (err) {
        console.error("Failed to fetch approver applications:", err);
        setError("Failed to load dashboard");
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

  const activeChipLabel = APPROVER_CHIPS.find((c) => c.id === activeChipId)?.label ?? "All Applications";

  return (
    <ProtectedRoute allowedRoles={['approver', 'admin']} requireProfile={true}>
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

        {/* Status Filter Chips */}
        <StatusFilterChips
          chips={APPROVER_CHIPS}
          activeChipId={activeChipId}
          onChipChange={setActiveChipId}
          applications={allApplications}
          className="mb-6"
        />

        <StaffTopTabs
          value={topTab}
          onValueChange={(v) => {
            if (isTopTab(v)) setTopTab(v);
          }}
          tabs={[
            { value: "approval", label: "Application Approval" },
            { value: "inspections", label: "Inspections" },
            { value: "water-reports", label: "Water Use Reports" },
            { value: "permit-registry", label: "Permit Registry" },
          ]}
        />

        {topTab === "approval" ? (
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
                    Concession Map
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
        ) : topTab === "inspections" ? (
          <div className="space-y-6">
            <InspectionsWorkbench />
          </div>
        ) : topTab === "water-reports" ? (
          <WaterUseReportsList />
        ) : (
          <PermitRegistryList />
        )}
        </motion.div>
      </div>
    </ProtectedRoute>
  );
}
