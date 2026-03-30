"use client";

// Set to true to show the real dashboard. Currently showing "Coming Soon".
const SHOW_WATER_DASHBOARD = false;

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import dynamic from "next/dynamic";
const PublicPermitsMap = dynamic(
  () => import("@/components/public/public-permits-map").then((m) => m.PublicPermitsMap),
  { ssr: false }
);
import { getDistricts, getSectors } from "@/lib/rwanda-administrative-data";
import { usePublicWaterUseDashboardQuery } from "@/hooks/usePublicWaterUseDashboardQuery";
import {
  Droplets,
  Search,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  MapPin,
  Waves,
  ChevronRight,
} from "lucide-react";

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function ComingSoon() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-primary/10 rounded-full">
            <Waves className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3">Water Use Dashboard</h1>
        <p className="text-muted-foreground text-lg mb-2">Coming Soon</p>
        <p className="text-muted-foreground text-sm">
          This page is under construction. Check back soon for water usage statistics and permit data across Rwanda.
        </p>
      </motion.div>
    </div>
  );
}

export default function WaterUseDashboardPage() {
  if (!SHOW_WATER_DASHBOARD) return <ComingSoon />;

  const [q, setQ] = useState("");
  const [province, setProvince] = useState<string>("all");
  const [district, setDistrict] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [waterSource, setWaterSource] = useState<string>("all");
  const [purpose, setPurpose] = useState<string>("all");

  const [expandedProvince, setExpandedProvince] = useState<string | null>(null);

  function toggleProvince(key: string) {
    setExpandedProvince(prev => (prev === key ? null : key));
  }

  const districtOptions = useMemo(() => (province === "all" ? [] : getDistricts(province)), [province]);
  const sectorOptions = useMemo(() => (province === "all" || district === "all" ? [] : getSectors(province, district)), [province, district]);

  const { data, isLoading, error } = usePublicWaterUseDashboardQuery({
    q: q || undefined,
    province,
    district,
    sector,
    water_source: waterSource,
    purpose,
    status: "all",
    includeExpired: true,
  });

  const snapshot = data?.snapshot;
  const catchments = data?.map.catchments ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-muted/40">
      <div className="container mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-8">
          {/* Hero */}
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Transparency & citizen oversight
              </div>

              <h1 className="text-4xl font-semibold tracking-tight text-balance">
                Rwanda Water Use Dashboard
              </h1>
              <p className="text-muted-foreground text-balance leading-relaxed">
                National snapshot of water permits and public map of permitted abstraction locations.
              </p>

              <div className="flex flex-wrap gap-2">
                <Link href="/apply">
                  <Button className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white">
                    Apply for a permit
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-900 hover:bg-emerald-50" asChild>
                  <a href="https://www.waterpermit.rwb.rw/Water_Use_Permitting_Guidelines.pdf" target="_blank" rel="noreferrer">
                    Guidelines
                  </a>
                </Button>
                <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-900 hover:bg-emerald-50" asChild>
                  <Link href="https://waterpermit.rwb.rw/contact" target="_blank" rel="noopener noreferrer">Contact</Link>
                </Button>
              </div>
            </div>

            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-muted-foreground" />
                  National snapshot
                </CardTitle>
                <CardDescription>Public summary</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-4 relative">
                  <div className="text-sm text-muted-foreground">Total permits issued</div>
                  <div className="mt-1 text-3xl font-semibold">
                    {isLoading ? <Skeleton className="h-9 w-20" /> : formatNumber(snapshot?.totalPermitsIssued ?? 0)}
                  </div>
                  <div className="absolute top-3 right-3">
                    <div className="h-8 w-8 rounded-full border bg-background/60 flex items-center justify-center">
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4 relative">
                  <div className="text-sm text-muted-foreground">Active permits</div>
                  <div className="mt-1 text-3xl font-semibold">
                    {isLoading ? <Skeleton className="h-9 w-20" /> : formatNumber(snapshot?.statusCounts?.active ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4 relative">
                  <div className="text-sm text-muted-foreground">Expired permits</div>
                  <div className="mt-1 text-3xl font-semibold">
                    {isLoading ? <Skeleton className="h-9 w-20" /> : formatNumber(snapshot?.statusCounts?.expired ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4 relative">
                  <div className="text-sm text-muted-foreground">Suspended / revoked</div>
                  <div className="mt-1 text-3xl font-semibold">
                    {isLoading ? (
                      <Skeleton className="h-9 w-20" />
                    ) : (
                      formatNumber((snapshot?.statusCounts?.suspended ?? 0) + (snapshot?.statusCounts?.revoked ?? 0))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                Search & filters
              </CardTitle>
              <CardDescription>Filter the public map.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search permit number, district, catchment…" />
              </div>
              <div>
                <Select
                  value={province}
                  onValueChange={(v) => {
                    setProvince(v);
                    setDistrict("all");
                    setSector("all");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Province" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All provinces</SelectItem>
                    <SelectItem value="Kigali">Kigali</SelectItem>
                    <SelectItem value="Northern">Northern</SelectItem>
                    <SelectItem value="Southern">Southern</SelectItem>
                    <SelectItem value="Eastern">Eastern</SelectItem>
                    <SelectItem value="Western">Western</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={district} onValueChange={(v) => { setDistrict(v); setSector("all"); }} disabled={province === "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder={province === "all" ? "Select province" : "District"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All districts</SelectItem>
                    {districtOptions.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={sector} onValueChange={setSector} disabled={province === "all" || district === "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder={district === "all" ? "Select district" : "Sector"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sectors</SelectItem>
                    {sectorOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={waterSource} onValueChange={setWaterSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Water source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All water sources</SelectItem>
                    <SelectItem value="river">Stream/River</SelectItem>
                    <SelectItem value="lake">Lake</SelectItem>
                    <SelectItem value="groundwater">Groundwater</SelectItem>
                    <SelectItem value="borehole">Borehole</SelectItem>
                    <SelectItem value="surface_water">Dam/Reservoir</SelectItem>
                    <SelectItem value="spring">Spring</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger>
                    <SelectValue placeholder="Use type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All uses</SelectItem>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="irrigation">Irrigation</SelectItem>
                    <SelectItem value="industrial">Industry</SelectItem>
                    <SelectItem value="electricity_generation">Hydropower</SelectItem>
                    <SelectItem value="mining">Mining</SelectItem>
                    <SelectItem value="fish_farming_lakes">Fish farming</SelectItem>
                    <SelectItem value="recreation">Recreation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}

          {/* Analytics row 1: sector + water source */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle>Water use by sector</CardTitle>
                <CardDescription>Based on permit purpose categories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </>
                ) : (
                  (snapshot?.waterUseBySector ?? []).slice(0, 8).map((row, idx) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-block h-2.5 w-2.5 rounded-full",
                              idx === 0 ? "bg-emerald-600" : idx === 1 ? "bg-emerald-400" : idx === 2 ? "bg-emerald-300" : "bg-slate-300",
                            ].join(" ")}
                          />
                          <div className="font-medium truncate">{row.label}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
                      </div>
                      <div className="w-52 flex items-center gap-2">
                        <Progress value={row.percentage} className="h-2 bg-muted" />
                        <div className="text-xs text-muted-foreground w-12 text-right">{row.percentage.toFixed(0)}%</div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Waves className="h-4 w-4 text-muted-foreground" />
                  Permits by water source
                </CardTitle>
                <CardDescription>Distribution across water source types</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </>
                ) : (
                  (snapshot?.permitsByWaterSource ?? []).slice(0, 8).map((row, idx) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-block h-2.5 w-2.5 rounded-full",
                              idx === 0 ? "bg-emerald-600" : idx === 1 ? "bg-emerald-400" : idx === 2 ? "bg-emerald-300" : "bg-slate-300",
                            ].join(" ")}
                          />
                          <div className="font-medium truncate">{row.label}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
                      </div>
                      <div className="w-52 flex items-center gap-2">
                        <Progress value={row.percentage} className="h-2 bg-muted" />
                        <div className="text-xs text-muted-foreground w-12 text-right">{row.percentage.toFixed(0)}%</div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Analytics row 2: province + catchment */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Permits by province
                </CardTitle>
                <CardDescription>Click a province to see district breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </>
                ) : (snapshot?.permitsByProvince ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No geographic data available for the current selection.</p>
                ) : (
                  (snapshot?.permitsByProvince ?? []).map((row, idx) => {
                    const isExpanded = expandedProvince === row.key;
                    const districtData = (snapshot?.permitsByDistrict ?? []).find(d => d.province === row.key);
                    const dotColor =
                      idx === 0 ? "bg-emerald-600" :
                      idx === 1 ? "bg-emerald-400" :
                      idx === 2 ? "bg-emerald-300" :
                      idx === 3 ? "bg-emerald-200" : "bg-slate-300";
                    return (
                      <div
                        key={row.key}
                        className={[
                          "rounded-lg border overflow-hidden",
                          isExpanded ? "border-emerald-200" : "border-border",
                        ].join(" ")}
                      >
                        <button
                          className={[
                            "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/40 cursor-pointer",
                            isExpanded ? "bg-emerald-50/50" : "",
                          ].join(" ")}
                          onClick={() => toggleProvince(row.key)}
                          aria-expanded={isExpanded}
                          aria-controls={`province-districts-${row.key}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                            <span className="font-medium truncate">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:flex items-center gap-2">
                              <Progress value={row.percentage} className="h-1.5 w-20 bg-muted" />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatNumber(row.count)} · {row.percentage.toFixed(0)}%
                            </span>
                            <ChevronRight
                              className={[
                                "h-4 w-4 text-muted-foreground transition-transform duration-150",
                                isExpanded ? "rotate-90 text-emerald-600" : "",
                              ].join(" ")}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div id={`province-districts-${row.key}`} className="border-t border-emerald-100 bg-white pr-3 pb-3 pt-2.5 pl-6">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                              Districts — % of province total
                            </p>
                            {!districtData || districtData.districts.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No district data available.</p>
                            ) : (
                              <div className="space-y-2">
                                {districtData.districts.map((d, dIdx) => (
                                  <div key={d.key} className="flex items-center gap-3">
                                    <span className="text-sm text-foreground w-28 truncate shrink-0">{d.label}</span>
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${dIdx < 3 ? "bg-emerald-300" : "bg-emerald-200"}`}
                                          style={{ width: `${d.percentage}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                                        {formatNumber(d.count)} · {d.percentage.toFixed(0)}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-muted-foreground" />
                  Permits by catchment basin
                </CardTitle>
                <CardDescription>Distribution by primary catchment area</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </>
                ) : (snapshot?.permitsByCatchment ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No catchment data available for the current selection.</p>
                ) : (
                  (snapshot?.permitsByCatchment ?? []).map((row, idx) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-block h-2.5 w-2.5 rounded-full",
                              idx === 0 ? "bg-emerald-600" : idx === 1 ? "bg-emerald-400" : idx === 2 ? "bg-emerald-300" : "bg-slate-300",
                            ].join(" ")}
                          />
                          <div className="font-medium truncate">{row.label}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatNumber(row.count)} permits</div>
                      </div>
                      <div className="w-52 flex items-center gap-2">
                        <Progress value={row.percentage} className="h-2 bg-muted" />
                        <div className="text-xs text-muted-foreground w-12 text-right">{row.percentage.toFixed(0)}%</div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trends (extended to 24 months) */}
          <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Trends over time</CardTitle>
                  <CardDescription>Permits issued over the last 24 months</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {snapshot?.permitsIssuedMoMPercent != null && (
                    <span className={[
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                      snapshot.permitsIssuedMoMPercent >= 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700",
                    ].join(" ")}>
                      {snapshot.permitsIssuedMoMPercent >= 0
                        ? <TrendingUp className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />}
                      {snapshot.permitsIssuedMoMPercent >= 0 ? "+" : ""}
                      {snapshot.permitsIssuedMoMPercent.toFixed(0)}% vs last month
                    </span>
                  )}
                  {snapshot?.permitsIssuedYoYPercent != null && (
                    <span className={[
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                      snapshot.permitsIssuedYoYPercent >= 0
                        ? "bg-slate-100 text-slate-600"
                        : "bg-red-50 text-red-700",
                    ].join(" ")}>
                      {snapshot.permitsIssuedYoYPercent >= 0
                        ? <TrendingUp className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />}
                      {snapshot.permitsIssuedYoYPercent >= 0 ? "+" : ""}
                      {snapshot.permitsIssuedYoYPercent.toFixed(0)}% vs last year
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/6" />
                  <Skeleton className="h-4 w-3/6" />
                </>
              ) : (
                (snapshot?.trend ?? [])
                  .map((t, idx, arr) => {
                    const max = Math.max(...arr.map((x) => x.permitsIssued), 1);
                    const pct = (t.permitsIssued / max) * 100;
                    return (
                      <div key={t.month} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground w-24">{t.month}</span>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-emerald-600/70" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="font-medium w-8 text-right">{formatNumber(t.permitsIssued)}</span>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>

          {/* Map temporarily hidden — under development */}
        </motion.div>
      </div>
    </div>
  );
}


