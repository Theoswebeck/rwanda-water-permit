"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Download,
  Filter,
  LayoutDashboard,
  Loader2,
  Search,
  ShieldAlert,
  Droplets,
} from "lucide-react";
import type { ProvinceType, WaterPurpose, WaterSourceType } from "@/types/database";
import { useManagementDashboardQuery } from "@/hooks/useManagementDashboardQuery";

type Period = "monthly" | "quarterly" | "annually";
type SectionKey = "portfolio" | "allocation" | "compliance";

type FiltersState = {
  period: Period;
  from?: string;
  to?: string;
  province: ProvinceType | "all";
  district: string | "all";
  sector: string | "all";
  catchment1: string | "all";
  catchment2: string | "all";
  waterSource: WaterSourceType | "all";
  waterPurpose: WaterPurpose | "all";
};

const DEFAULT_FILTERS: FiltersState = {
  period: "monthly",
  province: "all",
  district: "all",
  sector: "all",
  catchment1: "all",
  catchment2: "all",
  waterSource: "all",
  waterPurpose: "all",
};

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function SectionButton({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-xl border px-3 py-3 text-left transition",
        "hover:bg-muted/50",
        active ? "border-primary/30 bg-primary/5" : "border-border bg-background",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className={["mt-0.5 rounded-lg p-2", active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"].join(" ")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-medium truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

export default function ManagementDashboardPage() {
  const [section, setSection] = useState<SectionKey>("portfolio");
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);

  const queryFilters = useMemo(() => filters, [filters]);
  const { data, isLoading, error, refetch, isFetching } = useManagementDashboardQuery(queryFilters);

  return (
    <ProtectedRoute allowedRoles={["reviewer", "inspector", "verifier", "approver", "admin"]} requireProfile={true}>
      <DashboardLayout>
        <div className="w-full px-4 py-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Sidebar */}
              <aside className="space-y-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-primary" />
                      Management
                    </CardTitle>
                    <CardDescription>Regulators & decision-makers</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <SectionButton
                      active={section === "portfolio"}
                      icon={<BarChart3 className="h-4 w-4" />}
                      title="Portfolio Overview"
                      subtitle="Permits & pipeline"
                      onClick={() => setSection("portfolio")}
                    />
                    <SectionButton
                      active={section === "allocation"}
                      icon={<Droplets className="h-4 w-4" />}
                      title="Abstraction & Allocation"
                      subtitle="Volumes & catchment pressure"
                      onClick={() => setSection("allocation")}
                    />
                    <SectionButton
                      active={section === "compliance"}
                      icon={<ShieldAlert className="h-4 w-4" />}
                      title="Compliance & Enforcement"
                      subtitle="Inspections & alerts"
                      onClick={() => setSection("compliance")}
                    />
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Quick hints</CardTitle>
                    <CardDescription>Why you may see 0s</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <div>✅ Application counts come from `applications`.</div>
                    <div>✅ Permit counts come from `permits` (will be 0 until permits are issued/seeded).</div>
                    <div>✅ Compliance uses `inspections` (will be empty until table exists + data is recorded).</div>
                  </CardContent>
                </Card>
              </aside>

              {/* Main */}
              <main className="space-y-6">
                {/* Topbar */}
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">Plan, monitor and act across permits, allocation and compliance.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative hidden md:block">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9 w-[280px]" placeholder="Search application, permit, catchment…" />
                    </div>

                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <Filter className="h-4 w-4" />
                          Filters
                        </Button>
                      </SheetTrigger>
                      <SheetContent>
                        <SheetHeader>
                          <SheetTitle>Filters</SheetTitle>
                          <SheetDescription>Scopes all dashboard metrics.</SheetDescription>
                        </SheetHeader>
                        <div className="p-4 space-y-4">
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Period</div>
                            <Select value={filters.period} onValueChange={(v: Period) => setFilters((p) => ({ ...p, period: v }))}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select period" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="annually">Annually</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="text-sm font-medium">From</div>
                              <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value || undefined }))} />
                            </div>
                            <div className="space-y-2">
                              <div className="text-sm font-medium">To</div>
                              <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value || undefined }))} />
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-2">
                            <div className="text-sm font-medium">Province</div>
                            <Select value={filters.province} onValueChange={(v) => setFilters((p) => ({ ...p, province: v as FiltersState["province"] }))}>
                              <SelectTrigger>
                                <SelectValue placeholder="All provinces" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="Kigali">Kigali</SelectItem>
                                <SelectItem value="Northern">Northern</SelectItem>
                                <SelectItem value="Southern">Southern</SelectItem>
                                <SelectItem value="Eastern">Eastern</SelectItem>
                                <SelectItem value="Western">Western</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="text-sm font-medium">District</div>
                              <Input
                                placeholder="All"
                                value={filters.district === "all" ? "" : filters.district}
                                onChange={(e) => setFilters((p) => ({ ...p, district: e.target.value ? e.target.value : "all" }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="text-sm font-medium">Sector</div>
                              <Input
                                placeholder="All"
                                value={filters.sector === "all" ? "" : filters.sector}
                                onChange={(e) => setFilters((p) => ({ ...p, sector: e.target.value ? e.target.value : "all" }))}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="text-sm font-medium">Catchment I</div>
                              <Input
                                placeholder="All"
                                value={filters.catchment1 === "all" ? "" : filters.catchment1}
                                onChange={(e) => setFilters((p) => ({ ...p, catchment1: e.target.value ? e.target.value : "all" }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="text-sm font-medium">Catchment II</div>
                              <Input
                                placeholder="All"
                                value={filters.catchment2 === "all" ? "" : filters.catchment2}
                                onChange={(e) => setFilters((p) => ({ ...p, catchment2: e.target.value ? e.target.value : "all" }))}
                              />
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-2">
                            <div className="text-sm font-medium">Water source</div>
                            <Select value={filters.waterSource} onValueChange={(v) => setFilters((p) => ({ ...p, waterSource: v as FiltersState["waterSource"] }))}>
                              <SelectTrigger>
                                <SelectValue placeholder="All" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="river">Stream/River</SelectItem>
                                <SelectItem value="lake">Lake</SelectItem>
                                <SelectItem value="groundwater">Groundwater</SelectItem>
                                <SelectItem value="borehole">Groundwater (Borehole)</SelectItem>
                                <SelectItem value="surface_water">Dam/Reservoir (Surface water)</SelectItem>
                                <SelectItem value="spring">Spring</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-medium">Use category</div>
                            <Select value={filters.waterPurpose} onValueChange={(v) => setFilters((p) => ({ ...p, waterPurpose: v as FiltersState["waterPurpose"] }))}>
                              <SelectTrigger>
                                <SelectValue placeholder="All" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="domestic">Domestic supply</SelectItem>
                                <SelectItem value="irrigation">Irrigation</SelectItem>
                                <SelectItem value="industrial">Industry</SelectItem>
                                <SelectItem value="electricity_generation">Hydropower</SelectItem>
                                <SelectItem value="mining">Mining</SelectItem>
                                <SelectItem value="aquaculture">Fish farming</SelectItem>
                                <SelectItem value="recreation">Recreation</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <SheetFooter>
                          <Button variant="secondary" className="w-full" onClick={() => setFilters(DEFAULT_FILTERS)}>
                            Reset filters
                          </Button>
                        </SheetFooter>
                      </SheetContent>
                    </Sheet>

                    <Button variant="outline" size="icon" aria-label="Notifications">
                      <Bell className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                      {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Refresh
                    </Button>
                    <Button variant="outline" disabled className="gap-2">
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                ) : null}

                {/* KPI Row (modern) */}
                <div className="grid gap-4 lg:grid-cols-4">
                  <Card className="border-0 text-white shadow-sm bg-gradient-to-br from-emerald-700 to-emerald-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/90">Total Applications</CardTitle>
                      <CardDescription className="text-white/70">All statuses (with filters)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? <Skeleton className="h-10 w-24 bg-white/20" /> : <div className="text-4xl font-semibold">{formatNumber(data?.portfolio.kpis.totalApplications ?? 0)}</div>}
                      <div className="mt-3 inline-flex items-center rounded-full bg-white/10 px-2 py-1 text-xs">
                        {formatNumber(data?.portfolio.kpis.submittedApplications ?? 0)} new submissions
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">In Process</CardTitle>
                      <CardDescription>Under review / assessment</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? <Skeleton className="h-10 w-24" /> : <div className="text-4xl font-semibold">{formatNumber(data?.portfolio.kpis.inProcessApplications ?? 0)}</div>}
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
                      <CardDescription>Waiting verifier</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? <Skeleton className="h-10 w-24" /> : <div className="text-4xl font-semibold">{formatNumber(data?.portfolio.kpis.pendingVerificationApplications ?? 0)}</div>}
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
                      <CardDescription>Final decision</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? <Skeleton className="h-10 w-24" /> : <div className="text-4xl font-semibold">{formatNumber(data?.portfolio.kpis.pendingFinalApprovalApplications ?? 0)}</div>}
                    </CardContent>
                  </Card>
                </div>

                {/* Section content */}
                {section === "portfolio" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Total permits issued</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.totalPermits ?? 0)}</div>}
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Active</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.active ?? 0)}</div>}
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Expired</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.expired ?? 0)}</div>}
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Suspended</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.suspended ?? 0)}</div>}
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">New permits ({filters.period})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{formatNumber(data?.portfolio.kpis.newPermitsIssued ?? 0)}</div>}
                          <div className="text-xs text-muted-foreground mt-1">Issued in selected period/range</div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="shadow-sm">
                        <CardHeader>
                          <CardTitle>Permits by water source type</CardTitle>
                          <CardDescription>Distribution across major water sources</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(data?.portfolio.distributions.byWaterSource ?? []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">No permit data found for current filters.</div>
                          ) : (
                            (data?.portfolio.distributions.byWaterSource ?? []).slice(0, 8).map((row) => (
                              <div key={row.key} className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{row.label}</div>
                                  <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
                                </div>
                                <div className="w-44 flex items-center gap-2">
                                  <Progress value={row.percentage} className="h-2" />
                                  <div className="text-xs text-muted-foreground w-10 text-right">{row.percentage.toFixed(0)}%</div>
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm">
                        <CardHeader>
                          <CardTitle>Pending applications by stage</CardTitle>
                          <CardDescription>Operational pressure across the workflow</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(data?.portfolio.workflow.pendingByStage ?? []).map((row) => (
                            <div key={row.key} className="flex items-center justify-between">
                              <div className="text-sm font-medium">{row.label}</div>
                              <Badge variant={row.count > 0 ? "secondary" : "outline"}>{formatNumber(row.count)}</Badge>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : null}

                {section === "allocation" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Total permitted abstraction</CardTitle>
                          <CardDescription>Daily (m³/day)</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.abstraction.totalPermittedM3PerDay ?? 0)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Total permitted abstraction</CardTitle>
                          <CardDescription>Annually (m³/year)</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.abstraction.totalPermittedM3PerYear ?? 0)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Actual vs permitted</CardTitle>
                          <CardDescription>Where metered</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm text-muted-foreground">Coming soon (metering dataset).</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Water balance</CardTitle>
                          <CardDescription>Remaining allocable water</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm text-muted-foreground">Coming soon (catchment supply dataset).</div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="shadow-sm">
                      <CardHeader>
                        <CardTitle>Abstraction pressure index per catchment</CardTitle>
                        <CardDescription>Derived from permitted abstraction where catchment is known</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(data?.abstraction.pressureByCatchment ?? []).length === 0 ? (
                          <div className="text-sm text-muted-foreground">Not enough data yet to compute pressure index.</div>
                        ) : (
                          (data?.abstraction.pressureByCatchment ?? []).slice(0, 12).map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{row.label}</div>
                                <div className="text-xs text-muted-foreground">{formatNumber(row.permittedM3PerDay)} m³/day permitted</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={row.flag === "stressed" ? "destructive" : row.flag === "watch" ? "secondary" : "outline"}>
                                  {row.flag.toUpperCase()}
                                </Badge>
                                <div className="w-44 flex items-center gap-2">
                                  <Progress value={row.index * 100} className="h-2" />
                                  <div className="text-xs text-muted-foreground w-12 text-right">{(row.index * 100).toFixed(0)}%</div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}

                {section === "compliance" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Fully compliant</CardTitle>
                          <CardDescription>Permit holders</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.compliance.holders.fullyCompliant ?? 0)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Partially compliant</CardTitle>
                          <CardDescription>Permit holders</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.compliance.holders.partiallyCompliant ?? 0)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Non-compliant</CardTitle>
                          <CardDescription>Permit holders</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.compliance.holders.nonCompliant ?? 0)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Inspections conducted</CardTitle>
                          <CardDescription>Selected period/range</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-semibold">{formatNumber(data?.compliance.inspections.conducted ?? 0)}</div>
                          <div className="text-xs text-muted-foreground mt-1">{formatNumber(data?.compliance.inspections.violationsDetected ?? 0)} violations detected</div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="shadow-sm">
                      <CardHeader>
                        <CardTitle>Compliance parameters</CardTitle>
                        <CardDescription>Based on latest completed inspection per application</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(data?.compliance.parameters ?? []).length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            No inspection compliance data available yet (either `inspections` table is missing, or no completed inspections exist).
                          </div>
                        ) : (
                          (data?.compliance.parameters ?? []).map((p) => (
                            <div key={p.key} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium">{p.label}</div>
                                <div className="text-xs text-muted-foreground">{formatNumber(p.numerator)} of {formatNumber(p.denominator)} compliant</div>
                              </div>
                              <div className="w-56 flex items-center gap-2">
                                <Progress value={p.percentage} className="h-2" />
                                <div className="text-xs text-muted-foreground w-12 text-right">{p.percentage.toFixed(0)}%</div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </main>
            </div>
          </motion.div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}


