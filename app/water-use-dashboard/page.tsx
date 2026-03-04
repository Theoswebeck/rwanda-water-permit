"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PublicPermitsMap } from "@/components/public/public-permits-map";
import { getDistricts, getSectors } from "@/lib/rwanda-administrative-data";
import { usePublicWaterUseDashboardQuery } from "@/hooks/usePublicWaterUseDashboardQuery";
import {
  Droplets,
  Search,
  ShieldCheck,
  Info,
  ArrowRight,
  AlertTriangle,
  ArrowUpRight,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  Copy,
  MapPin,
} from "lucide-react";

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function labelStatus(s: string) {
  const map: Record<string, string> = {
    active: "Active",
    expired: "Expired",
    expiring_soon: "Expiring soon",
    suspended: "Suspended",
    revoked: "Revoked",
  };
  return map[s] || s;
}

function labelPurpose(purpose: string) {
  const map: Record<string, string> = {
    domestic: "Domestic supply",
    irrigation: "Irrigation",
    industrial: "Industry",
    electricity_generation: "Hydropower",
    mining: "Mining",
    aquaculture: "Fish farming",
    recreation: "Recreation",
    municipal_supply: "Municipal supply",
    livestock: "Livestock",
    other: "Other",
    // legacy / custom
    fish_farming_lakes: "Fish farming (lakes)",
    fish_farming_ponds: "Fish farming (ponds)",
    coffee_washing_station: "Coffee washing station",
    gas_extraction: "Gas extraction",
  };
  return map[purpose] || purpose.replaceAll("_", " ");
}

function labelWaterSource(source: string) {
  const map: Record<string, string> = {
    river: "Stream/River",
    lake: "Lake",
    groundwater: "Groundwater",
    borehole: "Borehole",
    surface_water: "Dam/Reservoir",
    spring: "Spring",
    wetland: "Wetland",
    other: "Other",
  };
  return map[source] || source.replaceAll("_", " ");
}

function statusPillClass(status: string) {
  const base = "rounded-full px-2 py-1 text-xs font-medium border";
  switch (status) {
    case "active":
      return `${base} bg-emerald-50 text-emerald-800 border-emerald-200`;
    case "expiring_soon":
      return `${base} bg-amber-50 text-amber-800 border-amber-200`;
    case "expired":
      return `${base} bg-rose-50 text-rose-800 border-rose-200`;
    case "suspended":
      return `${base} bg-purple-50 text-purple-800 border-purple-200`;
    case "revoked":
      return `${base} bg-slate-50 text-slate-700 border-slate-200`;
    default:
      return `${base} bg-muted/30 text-muted-foreground border-border`;
  }
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function permitValidityProgress(issued?: string, expiry?: string): { percent: number; label: string } {
  if (!issued || !expiry) return { percent: 0, label: "N/A" };
  const i = new Date(issued);
  const e = new Date(expiry);
  if (Number.isNaN(i.getTime()) || Number.isNaN(e.getTime())) return { percent: 0, label: "N/A" };
  const total = Math.max(1, daysBetween(i, e));
  const elapsed = Math.min(total, Math.max(0, daysBetween(i, new Date())));
  const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const remainingDays = Math.max(0, total - elapsed);
  const remainingLabel = remainingDays >= 365 ? `${(remainingDays / 365).toFixed(1)}y left` : remainingDays >= 30 ? `${Math.round(remainingDays / 30)}m left` : `${remainingDays}d left`;
  return { percent, label: remainingLabel };
}

function useIconKey(useType: string) {
  if (useType === "electricity_generation") return "hydro";
  if (useType === "industrial") return "industry";
  if (useType === "irrigation") return "irrigation";
  if (useType === "mining") return "mining";
  if (useType === "domestic") return "domestic";
  if (useType === "municipal_supply") return "municipal";
  if (useType === "aquaculture" || useType.includes("fish_farming")) return "aquaculture";
  return "other";
}

function iconBgClass(useType: string) {
  const key = useIconKey(useType);
  const base = "h-10 w-10 rounded-full flex items-center justify-center border";
  switch (key) {
    case "hydro":
      return `${base} bg-emerald-50 border-emerald-200 text-emerald-800`;
    case "industry":
      return `${base} bg-blue-50 border-blue-200 text-blue-800`;
    case "irrigation":
      return `${base} bg-lime-50 border-lime-200 text-lime-800`;
    case "mining":
      return `${base} bg-amber-50 border-amber-200 text-amber-800`;
    case "domestic":
      return `${base} bg-sky-50 border-sky-200 text-sky-800`;
    case "municipal":
      return `${base} bg-indigo-50 border-indigo-200 text-indigo-800`;
    case "aquaculture":
      return `${base} bg-cyan-50 border-cyan-200 text-cyan-800`;
    default:
      return `${base} bg-slate-50 border-slate-200 text-slate-800`;
  }
}

function iconLetter(useType: string) {
  const key = useIconKey(useType);
  const map: Record<string, string> = {
    hydro: "H",
    industry: "I",
    irrigation: "IR",
    mining: "M",
    domestic: "D",
    municipal: "MS",
    aquaculture: "F",
    other: "O",
  };
  return map[key] || "O";
}

export default function WaterUseDashboardPage() {
  const [q, setQ] = useState("");
  const [province, setProvince] = useState<string>("all");
  const [district, setDistrict] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [waterSource, setWaterSource] = useState<string>("all");
  const [purpose, setPurpose] = useState<string>("all");
  const [sort, setSort] = useState<{ key: "permit" | "status" | "district" | "progress"; dir: "asc" | "desc" }>({
    key: "permit",
    dir: "asc",
  });

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
    includeExpired: false,
    limit: 50,
    offset: 0,
  });

  const snapshot = data?.snapshot;
  const points = data?.map.points ?? [];
  const registry = data?.registry.items ?? [];

  const sortedRegistry = useMemo(() => {
    const items = [...registry];
    const dir = sort.dir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sort.key === "permit") return a.permitNumber.localeCompare(b.permitNumber) * dir;
      if (sort.key === "status") return String(a.status).localeCompare(String(b.status)) * dir;
      if (sort.key === "district") return String(a.district ?? "").localeCompare(String(b.district ?? "")) * dir;
      if (sort.key === "progress") {
        const pa = permitValidityProgress(a.issuedDate, a.expiryDate).percent;
        const pb = permitValidityProgress(b.issuedDate, b.expiryDate).percent;
        return (pa - pb) * dir;
      }
      return 0;
    });
    return items;
  }, [registry, sort]);

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
                National snapshot of water permits and public map of permitted abstraction locations. This dashboard intentionally avoids displaying sensitive volume values.
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
                  <Link href="https://rwandawaterpermit.com/contact" target="_blank" rel="noopener noreferrer">Contact</Link>
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
              <CardDescription>Filter the map and permit registry (public fields only).</CardDescription>
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
                    <SelectItem value="aquaculture">Fish farming</SelectItem>
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

          {/* Analytics + Map */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
              <CardHeader>
                <CardTitle>Water use by sector (percentages)</CardTitle>
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
                <CardTitle>Trends over time</CardTitle>
                <CardDescription>Permits issued per month</CardDescription>
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
                    .slice(-10)
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
          </div>

          <div data-public-map>
            <PublicPermitsMap points={points} />
          </div>

          {/* Registry */}
          <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Permit registry (public fields)</CardTitle>
                  <CardDescription>Public permit information</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4" />
                  Volumes are not shown; intensity is bucketed on the map.
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[340px]">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-foreground"
                          onClick={() =>
                            setSort((s) => ({ key: "permit", dir: s.key === "permit" && s.dir === "asc" ? "desc" : "asc" }))
                          }
                        >
                          Permit
                          {sort.key === "permit" ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                        </button>
                      </TableHead>
                      <TableHead className="w-[160px]">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-foreground"
                          onClick={() =>
                            setSort((s) => ({ key: "status", dir: s.key === "status" && s.dir === "asc" ? "desc" : "asc" }))
                          }
                        >
                          Status
                          {sort.key === "status" ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">Summary</TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-foreground"
                          onClick={() =>
                            setSort((s) => ({ key: "district", dir: s.key === "district" && s.dir === "asc" ? "desc" : "asc" }))
                          }
                        >
                          Location
                          {sort.key === "district" ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-foreground"
                          onClick={() =>
                            setSort((s) => ({ key: "progress", dir: s.key === "progress" && s.dir === "asc" ? "desc" : "asc" }))
                          }
                        >
                          Validity
                          {sort.key === "progress" ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                        </button>
                      </TableHead>
                      <TableHead className="text-right w-[72px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="space-y-2 py-4">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-4/6" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : registry.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">
                          No permits match the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRegistry.map((r) => {
                        const validity = permitValidityProgress(r.issuedDate, r.expiryDate);
                        const useLabel = labelPurpose(r.useType);
                        const sourceLabel = labelWaterSource(r.waterSource);
                        const summary = `${useLabel} • ${sourceLabel}`;
                        const location = `${r.district ?? "N/A"} • ${r.sector ?? "N/A"}`;

                        return (
                          <TableRow key={r.permitId} className="hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold truncate">{r.permitNumber}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {r.province ?? "N/A"} • {r.district ?? "N/A"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={statusPillClass(r.status)}>{labelStatus(r.status)}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{summary}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  Catchment: {r.catchment1 ?? "N/A"}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="min-w-0">
                                <div className="font-medium truncate flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                  {location}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{r.duration}</div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-3">
                                <div className="w-40">
                                  <div className="h-2 rounded-full bg-muted">
                                    <div className="h-2 rounded-full bg-emerald-600/70" style={{ width: `${validity.percent}%` }} />
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground w-16 text-right">{validity.label}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label="Row actions">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(r.permitNumber);
                                      } catch {
                                        // ignore
                                      }
                                    }}
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy permit number
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const el = document.querySelector("[data-public-map]");
                                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                                    }}
                                  >
                                    <MapPin className="h-4 w-4 mr-2" />
                                    Jump to map
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Why permits are required</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Permits help allocate water fairly, protect ecosystems, and ensure lawful and safe abstraction.
                  </CardContent>
                </Card>
                <Card className="border bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Priority water uses</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Domestic supply and environmental flows are prioritized during scarcity and drought conditions.
                  </CardContent>
                </Card>
                <Card className="border bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Citizens’ rights & obligations</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Citizens can report concerns and must avoid unauthorized abstraction. Use official channels for applications and renewals.
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}


