"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileCheck, Eye, Search, MapPin, Droplets, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";

interface VerificationApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
}

interface VerificationStatsData {
  pendingVerification: number;
  pendingApproval: number;
  approvedPendingPermit: number;
  rejected: number;
}

export default function VerificationDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<VerificationStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all applications for the "All Applications" tab, and locally filter for the queue.
        const { data, error } = await supabase
          .from("applications")
          .select(
            `
            *,
            applicant:users!applicant_id(first_name, last_name, company_name)
          `
          )
          .order("created_at", { ascending: false });

        if (error) throw error;

        const processed: VerificationApplication[] = (data || []).map((app: any) => {
          const applicant = app.applicant as any;
          const applicantName =
            applicant?.company_name ||
            (applicant?.first_name && applicant?.last_name ? `${applicant.first_name} ${applicant.last_name}` : "Unknown Applicant");

          let slaRemaining: number | null = null;
          if (app.due_date) {
            const dueDate = new Date(app.due_date);
            const now = new Date();
            const diffTime = dueDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            slaRemaining = diffDays;
          }

          return {
            ...app,
            applicant_name: applicantName,
            sla_days_remaining: slaRemaining,
          };
        });

        setApplications(processed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load verification queue";
        console.error("❌ Failed to load verification queue:", e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, []);

  // Fetch verification statistics from database
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);

        const { count: pendingVerificationCount, error: pendingVerificationError } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_verification");
        if (pendingVerificationError) throw pendingVerificationError;

        const { count: pendingApprovalCount, error: pendingApprovalError } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_final_approval");
        if (pendingApprovalError) throw pendingApprovalError;

        const { count: approvedPendingPermitCount, error: approvedPendingPermitError } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "approved_pending_permit");
        if (approvedPendingPermitError) throw approvedPendingPermitError;

        const { count: rejectedCount, error: rejectedError } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "rejected");
        if (rejectedError) throw rejectedError;

        setStats({
          pendingVerification: pendingVerificationCount || 0,
          pendingApproval: pendingApprovalCount || 0,
          approvedPendingPermit: approvedPendingPermitCount || 0,
          rejected: rejectedCount || 0,
        });
      } catch (e) {
        console.error("❌ Error fetching verification stats:", e);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getVerificationStatusBadge = (status: string) => {
    const statusConfig = {
      pending_verification: {
        label: "Pending Verification",
        className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800",
      },
      pending_review: {
        label: "Pending Review",
        className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
      },
      pending_final_approval: {
        label: "Pending Approval",
        className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800",
      },
      approved_pending_permit: {
        label: "Approved - Permit Pending",
        className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800",
      },
      rejected: {
        label: "Rejected",
        className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
      },
      approved: {
        label: "Approved",
        className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800",
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || ({
        label: status,
        className: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800",
      } as const);

    return (
      <Badge
        variant="outline"
        className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}
      >
        {config.label}
      </Badge>
    );
  };

  const filterApplications = (apps: VerificationApplication[]) => {
    return apps.filter((app) => {
      const matchesSearch =
        app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.applicant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.project_title?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType =
        filterType === "all" ||
        app.water_source?.toLowerCase().includes(filterType.toLowerCase()) ||
        app.application_type?.toLowerCase().includes(filterType.toLowerCase());

      return matchesSearch && matchesType;
    });
  };

  const getLocationString = (app: VerificationApplication) => `${app.district || "N/A"}, ${app.sector || "N/A"}`;

  const getWaterSourceLabel = (waterSource: string) => {
    const labels: Record<string, string> = {
      surface_water: "Surface Water",
      groundwater: "Groundwater",
      borehole: "Borehole",
      river: "River",
      lake: "Lake",
      spring: "Spring",
      swamp: "Swamp",
      other: "Other",
    };
    return labels[waterSource] || waterSource;
  };

  const getWaterPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      domestic: "Domestic Use",
      industrial: "Industrial Use",
      agricultural: "Agricultural Use",
      irrigation: "Irrigation",
      livestock: "Livestock",
      aquaculture: "Aquaculture",
      recreation: "Recreation",
      electricity_generation: "Electricity Generation",
      mining: "Mining",
      municipal_supply: "Municipal Supply",
      other: "Other",
    };
    return labels[purpose] || purpose;
  };

  const ApplicationTable = ({ apps, emptyMessage }: { apps: VerificationApplication[]; emptyMessage: string }) => {
    const filteredApps = filterApplications(apps);

    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold">
            {emptyMessage} ({filteredApps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[15%]">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[35%] hidden md:table-cell">
                    Location & Type
                  </TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          {apps.length === 0 ? "No applications found" : "No applications match your filters"}
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          {apps.length === 0 ? "Applications will appear here once ready" : "Try adjusting your search or filter criteria"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApps.map((app) => (
                    <TableRow
                      key={app.id}
                      className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{app.application_number}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {app.project_title || "No project title"}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {app.applicant_name || "Unknown Applicant"}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{getWaterPurposeLabel(app.water_purpose || "")}</div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">{getVerificationStatusBadge(app.status)}</div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 hidden md:table-cell">
                        <div className="flex items-center gap-1 mb-1">
                          <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{getLocationString(app)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getWaterSourceLabel(app.water_source || "")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                        <Link href={`/verification/application/${app.application_number}`}>
                          <Button
                            size="sm"
                            className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                          >
                            <Eye className="h-3 w-3" />
                            <span className="hidden sm:inline">{app.status === "pending_verification" ? "Verify" : "View"}</span>
                            <span className="sm:hidden">Go</span>
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["verifier", "admin", "approver"]} requireProfile={true}>
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
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Application Verification Dashboard
              </h1>
                <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                  Verify completeness and consistency before final approval
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/management">
                <Button variant="outline">Management Dashboard</Button>
              </Link>
            </div>
          </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending Verification</CardTitle>
                  <FileCheck className="h-4 w-4 text-indigo-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statsLoading ? <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" /> : stats?.pendingVerification || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting verifier review</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
                  <Clock className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statsLoading ? <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" /> : stats?.pendingApproval || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">With approver for final decision</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Permit Pending</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statsLoading ? (
                      <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      stats?.approvedPendingPermit || 0
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Approved, awaiting terms acceptance</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
                  <XCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statsLoading ? <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" /> : stats?.rejected || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Applications rejected</p>
                </CardContent>
              </Card>
            </div>

            {/* Main Content with Tabs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Verification Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="applications_to_verify" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="applications_to_verify">Applications for Verification</TabsTrigger>
                    <TabsTrigger value="all_applications">All Applications</TabsTrigger>
                    <TabsTrigger value="map" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Concession Map
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="applications_to_verify" className="space-y-4 mt-6">
                    <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                        <Input
                          placeholder="Search by applicant name, application number, or project title..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                        />
                      </div>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="surface">Surface Water</SelectItem>
                          <SelectItem value="groundwater">Groundwater</SelectItem>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {error ? <div className="text-sm text-destructive">{error}</div> : null}

                    <ApplicationTable
                      apps={applications.filter((a) => a.status === "pending_verification")}
                      emptyMessage="Applications for Verification"
                    />
                  </TabsContent>

                  <TabsContent value="all_applications" className="space-y-4 mt-6">
                    <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                        <Input
                          placeholder="Search by applicant name, application number, or project title..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                        />
                      </div>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="surface">Surface Water</SelectItem>
                          <SelectItem value="groundwater">Groundwater</SelectItem>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {error ? <div className="text-sm text-destructive">{error}</div> : null}

                    <ApplicationTable apps={applications} emptyMessage="All Applications" />
                  </TabsContent>

                  <TabsContent value="map" className="space-y-4 mt-6">
                    <WaterConcessionMap />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </motion.div>
    </DashboardLayout>
    </ProtectedRoute>
  );
}


