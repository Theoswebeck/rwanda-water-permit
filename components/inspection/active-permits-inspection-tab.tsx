"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Inspection, Permit } from "@/types/database";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, ArrowUpDown, ChevronLeft, ChevronRight, Eye, FileCheck, Loader2, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";

type PermitRow = Permit & {
  application?: {
    id: string;
    application_number?: string;
    project_title?: string;
    province?: string;
    district?: string;
    sector?: string;
    cell?: string;
    village?: string;
    applicant?: {
      first_name?: string;
      last_name?: string;
      company_name?: string;
      account_type?: string;
    } | null;
  } | null;
};

function formatApplicantName(applicant: PermitRow["application"] extends infer A ? any : any): string {
  const a = applicant?.applicant;
  if (!a) return "N/A";
  const isIndividual = a.account_type === "individual";
  if (isIndividual) {
    const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    return name || "N/A";
  }
  return a.company_name || "N/A";
}

function formatDate(dateString?: string): string {
  if (!dateString) return "N/A";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString();
}

export function ActivePermitsInspectionTab() {
  const { userProfile, loading: authLoading } = useAuth();
  const isAssessor = userProfile?.role === "assessor";

  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [latestInspectionByAppId, setLatestInspectionByAppId] = useState<Record<string, Inspection | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [filterNoInspection, setFilterNoInspection] = useState(false);
  const [filterHasInspection, setFilterHasInspection] = useState(false);
  const [filterExpiringSoon, setFilterExpiringSoon] = useState(false);
  const [sortBy, setSortBy] = useState<"issued_date" | "expiry_date">("issued_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: permitsError } = await supabase
          .from("permits")
          .select(
            `
            *,
            application:applications!permits_application_id_fkey(
              id,
              application_number,
              project_title,
              province,
              district,
              sector,
              cell,
              village,
              applicant:users!applicant_id(
                first_name,
                last_name,
                company_name,
                account_type
              )
            )
          `
          )
          .eq("status", "active")
          .order("issued_date", { ascending: false });

        if (permitsError) throw permitsError;
        const permitRows = (data || []) as PermitRow[];
        setPermits(permitRows);

        const applicationIds = permitRows.map(p => p.application?.id).filter(Boolean) as string[];
        if (applicationIds.length === 0) {
          setLatestInspectionByAppId({});
          return;
        }

        const { data: inspections, error: inspectionsError } = await supabase
          .from("inspections")
          .select("id, application_id, inspector_id, status, type, result, created_at, completed_date, inspection_template")
          .in("application_id", applicationIds)
          .order("created_at", { ascending: false });

        if (inspectionsError) throw inspectionsError;

        const map: Record<string, Inspection | undefined> = {};
        for (const ins of (inspections || []) as any[]) {
          if (!map[ins.application_id]) {
            map[ins.application_id] = ins as Inspection;
          }
        }
        setLatestInspectionByAppId(map);
      } catch (e: any) {
        console.error("❌ Failed to load active permits for inspection:", e);
        setError(e?.message || "Failed to load active permits");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = permits.filter(p => {
      const permitNo = p.permit_number?.toLowerCase() || "";
      const title = p.application?.project_title?.toLowerCase() || "";
      const applicant = formatApplicantName(p.application as any).toLowerCase();
      if (q) {
        if (!(permitNo.includes(q) || title.includes(q) || applicant.includes(q))) return false;
      }

      const appId = p.application?.id;
      const latest = appId ? latestInspectionByAppId[appId] : undefined;
      const hasInspection = !!latest;

      if (filterNoInspection && hasInspection) return false;
      if (filterHasInspection && !hasInspection) return false;

      if (filterExpiringSoon) {
        const expiry = p.expiry_date ? new Date(p.expiry_date) : null;
        if (!expiry || Number.isNaN(expiry.getTime())) return false;
        const now = new Date();
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) return false;
      }

      return true;
    });

    const toTime = (d?: string) => {
      if (!d) return 0;
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const sorted = [...base].sort((a, b) => {
      const aTime = toTime(sortBy === "issued_date" ? a.issued_date : a.expiry_date);
      const bTime = toTime(sortBy === "issued_date" ? b.issued_date : b.expiry_date);
      return sortDir === "asc" ? aTime - bTime : bTime - aTime;
    });

    return sorted;
  }, [permits, search, latestInspectionByAppId, filterNoInspection, filterHasInspection, filterExpiringSoon, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  useEffect(() => {
    // reset to page 1 on new search / list size changes
    setPage(1);
  }, [search, permits.length, filterNoInspection, filterHasInspection, filterExpiringSoon, sortBy, sortDir]);

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading active permits…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Active permits</span>
            <Badge variant="secondary">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 w-full md:w-[320px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Filter permits</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={filterNoInspection}
                    onCheckedChange={(v) => {
                      const next = Boolean(v);
                      setFilterNoInspection(next);
                      if (next) setFilterHasInspection(false);
                    }}
                  >
                    No inspection
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={filterHasInspection}
                    onCheckedChange={(v) => {
                      const next = Boolean(v);
                      setFilterHasInspection(next);
                      if (next) setFilterNoInspection(false);
                    }}
                  >
                    Has inspection
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={filterExpiringSoon} onCheckedChange={(v) => setFilterExpiringSoon(Boolean(v))}>
                    Expiring in 30 days
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      setFilterNoInspection(false);
                      setFilterHasInspection(false);
                      setFilterExpiringSoon(false);
                    }}
                  >
                    Clear filters
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={false}
                      // Placeholder for future bulk actions; no-op for now
                      onCheckedChange={() => {}}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Permit #</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 gap-1"
                      onClick={() => {
                        setSortBy("issued_date");
                        setSortDir(prev => (sortBy === "issued_date" ? (prev === "asc" ? "desc" : "asc") : "desc"));
                      }}
                    >
                      Issued
                      <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 gap-1"
                      onClick={() => {
                        setSortBy("expiry_date");
                        setSortDir(prev => (sortBy === "expiry_date" ? (prev === "asc" ? "desc" : "asc") : "desc"));
                      }}
                    >
                      Expiry
                      <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableHead>
                  <TableHead>Latest inspection</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No active permits match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map(p => {
                    const app = p.application;
                    const appId = app?.id;
                    const latest = appId ? latestInspectionByAppId[appId] : undefined;
                    const canContinueOwnDraft =
                      isAssessor &&
                      latest &&
                      latest.inspector_id === userProfile?.id &&
                      (latest.status === "scheduled" || latest.status === "in_progress");

                    const appNumber = app?.application_number;
                    const inspectionHref = appNumber ? `/inspection/permit/${appNumber}` : undefined;

                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Checkbox checked={false} onCheckedChange={() => {}} aria-label={`Select ${p.permit_number}`} />
                        </TableCell>
                        <TableCell className="font-medium">{p.permit_number}</TableCell>
                        <TableCell>{formatApplicantName(app as any)}</TableCell>
                        <TableCell>{formatDate(p.issued_date)}</TableCell>
                        <TableCell>{formatDate(p.expiry_date)}</TableCell>
                        <TableCell>
                          {latest ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{latest.status}</Badge>
                              {latest.completed_date ? (
                                <span className="text-xs text-muted-foreground">{formatDate(latest.completed_date)}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            {isAssessor ? (
                              inspectionHref ? (
                                <Link href={inspectionHref}>
                                  <Button size="sm" className="gap-1.5">
                                    <FileCheck className="h-4 w-4" />
                                    {canContinueOwnDraft ? "Continue" : "Begin"}
                                  </Button>
                                </Link>
                              ) : (
                                <Button size="sm" variant="outline" disabled>
                                  Missing application #
                                </Button>
                              )
                            ) : null}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open actions</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />

                                <DropdownMenuItem asChild>
                                  <Link href={`/permit/view/${encodeURIComponent(String(p.permit_number || ""))}`} className="flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    View permit
                                  </Link>
                                </DropdownMenuItem>

                                {appId ? (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/application/${appId}`} className="flex items-center gap-2">
                                      <Eye className="h-4 w-4" />
                                      View application
                                    </Link>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem disabled>Missing application</DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />

                                {isAssessor ? (
                                  inspectionHref ? (
                                    <DropdownMenuItem asChild>
                                      <Link href={inspectionHref} className="flex items-center gap-2">
                                        <FileCheck className="h-4 w-4" />
                                        {canContinueOwnDraft ? "Continue inspection" : "Begin inspection"}
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem disabled>Missing application #</DropdownMenuItem>
                                  )
                                ) : latest ? (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/inspection/${latest.id}`} className="flex items-center gap-2">
                                      <Eye className="h-4 w-4" />
                                      View inspection
                                    </Link>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem disabled>No inspection yet</DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


